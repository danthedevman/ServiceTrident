import { encode } from './codec.js';

/** Compile the bounded query vocabulary used by repositories. All values use SQL parameters. */
export class Query {
  values = [];
  elementSequence = 0;
  param(value, type = 'jsonb') {
    this.values.push(type === 'jsonb' ? JSON.stringify(encode(value)) : value);
    return `$${this.values.length}::${type}`;
  }
  path(field) {
    if (typeof field !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field))
      throw new Error('Invalid persistence field');
    return field.split('.');
  }
  raw(field, doc = 'data') {
    return `(${doc} #> ${this.param(this.path(field), 'text[]')})`;
  }
  field(field, doc = 'data') {
    return `sk_scalar(${this.raw(field, doc)})`;
  }
  text(expr) {
    return `(${expr} #>> '{}')`;
  }
  bool(expr) {
    return `COALESCE((${expr}) = 'true'::jsonb, false)`;
  }
  expression(value, doc = 'data') {
    if (value === '$$NOW')
      return `jsonb_build_object('$date', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
    if (typeof value === 'string' && value.startsWith('$')) return this.raw(value.slice(1), doc);
    if (Array.isArray(value))
      return `jsonb_build_array(${value.map((v) => this.expression(v, doc)).join(',')})`;
    if (!value || typeof value !== 'object' || value instanceof Date || value._bsontype)
      return this.param(value);
    const entries = Object.entries(value);
    if (!entries.some(([k]) => k.startsWith('$')))
      return `jsonb_build_object(${entries.flatMap(([k, v]) => [this.param(k, 'text'), this.expression(v, doc)]).join(',')})`;
    const [[op, arg]] = entries;
    const ex = (v) => this.expression(v, doc);
    if (op === '$literal') return this.param(arg);
    if (op === '$ifNull') return `COALESCE(NULLIF(${ex(arg[0])}, 'null'::jsonb), ${ex(arg[1])})`;
    if (['$eq', '$ne', '$lt', '$lte', '$gt', '$gte'].includes(op))
      return `to_jsonb(sk_scalar(${ex(arg[0])}) ${{ $eq: '=', $ne: '<>', $lt: '<', $lte: '<=', $gt: '>', $gte: '>=' }[op]} sk_scalar(${ex(arg[1])}))`;
    if (op === '$and' || op === '$or')
      return `to_jsonb(${arg.map((v) => this.bool(ex(v))).join(op === '$and' ? ' AND ' : ' OR ') || (op === '$and' ? 'true' : 'false')})`;
    if (op === '$cond')
      return `(CASE WHEN ${this.bool(ex(arg[0]))} THEN ${ex(arg[1])} ELSE ${ex(arg[2])} END)`;
    if (op === '$convert')
      return `to_jsonb(COALESCE(${this.text(`sk_scalar(${ex(arg.input)})`)}, ''::text))`;
    if (op === '$concat') return `to_jsonb(${arg.map((part) => this.text(ex(part))).join(' || ')})`;
    if (op === '$regexMatch')
      return `to_jsonb(COALESCE(${this.text(ex(arg.input))}, '') ${arg.options === 'i' ? '~*' : '~'} ${this.param(arg.regex, 'text')})`;
    if (op === '$dateToString')
      return `to_jsonb(substring(${this.text(`sk_scalar(${ex(arg.date)})`)} from 1 for 10))`;
    if (op === '$dateFromString')
      return `jsonb_build_object('$date', ${this.text(ex(arg.dateString))} || 'T00:00:00.000Z')`;
    if (op === '$dateAdd') {
      const unit = { day: 86400, minute: 60 }[arg.unit];
      if (!unit) throw new Error('Unsupported date unit');
      return `jsonb_build_object('$date', to_char((${this.text(`sk_scalar(${ex(arg.startDate)})`)}::timestamptz + (${this.text(ex(arg.amount))}::double precision * ${unit}) * interval '1 second') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))`;
    }
    if (op === '$indexOfArray')
      return `to_jsonb(COALESCE(array_position(${this.param(arg[0], 'text[]')}, ${this.text(ex(arg[1]))}) - 1, -1))`;
    if (op === '$add')
      return `to_jsonb(${arg.map((v) => `${this.text(ex(v))}::numeric`).join(' + ')})`;
    if (op === '$max') return `GREATEST(${arg.map(ex).join(',')})`;
    throw new Error(`Unsupported persistence expression: ${op}`);
  }
  filter(filter = {}, doc = 'data') {
    return (
      Object.entries(filter)
        .map(([field, value]) => {
          if (field === '$or' || field === '$and')
            return `(${value.map((v) => this.filter(v, doc)).join(field === '$or' ? ' OR ' : ' AND ') || (field === '$or' ? 'false' : 'true')})`;
          if (field === '$expr') return this.bool(this.expression(value, doc));
          if (field.startsWith('$')) throw new Error(`Unsupported filter: ${field}`);
          if (value?.$in?.length === 0) return 'false';
          if (value?.$nin?.length === 0 && Object.keys(value).length === 1) return 'true';
          let candidatesSql;
          const candidates = () =>
            (candidatesSql ??= `sk_values(${doc}, ${this.param(this.path(field), 'text[]')})`);
          const match = (condition) =>
            `EXISTS (SELECT 1 FROM ${candidates()} AS candidate(value) WHERE ${condition})`;
          const equal = (v) => {
            if (v === null)
              return `(NOT EXISTS (SELECT 1 FROM ${candidates()}) OR ${match("value = 'null'::jsonb")})`;
            if (
              [
                '_id',
                'workspaceId',
                'userId',
                'monitorId',
                'incidentId',
                'recordId',
                'email',
                'demoBatchId',
              ].includes(field)
            )
              return `COALESCE(${this.field(field, doc)} = sk_scalar(${this.param(v)}), false)`;
            return match(`sk_scalar(value) = sk_scalar(${this.param(v)})`);
          };
          if (
            !value ||
            typeof value !== 'object' ||
            value instanceof Date ||
            value._bsontype ||
            Array.isArray(value) ||
            !Object.keys(value).some((k) => k.startsWith('$'))
          )
            return equal(value);
          return (
            '(' +
            Object.entries(value)
              .map(([op, arg]) => {
                if (op === '$elemMatch') {
                  const raw = this.raw(field, doc),
                    alias = `matched_element_${++this.elementSequence}`;
                  return `EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(${raw}) = 'array' THEN ${raw} ELSE '[]'::jsonb END) AS ${alias}(value) WHERE ${this.filter(arg, `${alias}.value`)})`;
                }
                if (op === '$options') return 'true';
                if (op === '$eq') return equal(arg);
                if (op === '$ne') return `NOT (${equal(arg)})`;
                if (op === '$in' || op === '$nin') {
                  const condition = arg.map(equal).join(' OR ') || 'false';
                  return op === '$in' ? `(${condition})` : `NOT (${condition})`;
                }
                if (op === '$exists')
                  return `${arg ? '' : 'NOT '}EXISTS (SELECT 1 FROM ${candidates()})`;
                if (op === '$type')
                  return match(`jsonb_typeof(value) = ${this.param(arg, 'text')}`);
                if (op === '$regex')
                  return match(
                    `${this.text('sk_scalar(value)')} ${value.$options === 'i' ? '~*' : '~'} ${this.param(arg, 'text')}`,
                  );
                if (['$lt', '$lte', '$gt', '$gte'].includes(op))
                  return match(
                    `sk_scalar(value) ${{ $lt: '<', $lte: '<=', $gt: '>', $gte: '>=' }[op]} sk_scalar(${this.param(arg)})`,
                  );
                throw new Error(`Unsupported persistence operator: ${op}`);
              })
              .join(' AND ') +
            ')'
          );
        })
        .join(' AND ') || 'true'
    );
  }
  sort(sort = {}, doc = 'data') {
    return Object.entries(sort)
      .map(
        ([field, direction]) =>
          `${this.field(field, doc)} ${direction === -1 ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`,
      )
      .join(',');
  }
  project(projection, doc = 'data') {
    if (!projection || !Object.keys(projection).length) return doc;
    const include = Object.values(projection).some((v) => v !== 0);
    if (!include) return `(${doc} - ${this.param(Object.keys(projection), 'text[]')})`;
    const fields = { _id: 1, ...projection };
    return `jsonb_strip_nulls(jsonb_build_object(${Object.entries(fields)
      .filter(([, v]) => v !== 0)
      .flatMap(([k, v]) => [
        this.param(k, 'text'),
        v === 1 ? this.raw(k, doc) : this.expression(v, doc),
      ])
      .join(',')}))`;
  }
}
