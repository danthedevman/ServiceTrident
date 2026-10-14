import { ObjectId } from 'mongodb';
import { InputError } from '@servicetrident/shared/validation/input-error';
import { tableSearch } from '@servicetrident/shared/domain/table-search';
import { dateRangeErrors } from '@servicetrident/shared/validation/form-validation';

/** Validate all table parameters before applying them to an allowlisted server-owned source. */
export function tableQuery(query, columns, dateColumn) {
  const page = Number(query.page ?? 1),
    pageSize = Number(query.pageSize ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || ![10, 25, 50].includes(pageSize))
    throw new InputError('Choose a valid page and 10, 25, or 50 rows.');
  const search = String(query.search ?? '').trim(),
    searchColumn = String(query.searchColumn ?? '');
  if (search.length > 100 || (searchColumn && !columns.includes(searchColumn)))
    throw new InputError('Choose a valid search column and at most 100 characters.');
  const sortBy = String(query.sortBy || columns[0]),
    order = query.order || 'asc';
  if (!columns.includes(sortBy) || !['asc', 'desc'].includes(order))
    throw new InputError('Choose a valid sort column and order.');
  const from = String(query.from ?? ''),
    to = String(query.to ?? '');
  if ((from || to) && (!dateColumn || Object.keys(dateRangeErrors(from, to)).length))
    throw new InputError('Choose a valid date range.');
  return { page, pageSize, search, searchColumn, sortBy, order, from, to, dateColumn };
}

/** SQL/Mongo filtering precedes pagination. Export uses this exact same predicate and ordering. */
export function databaseTable(db, name, base, fields, view, dateColumn) {
  if (['incidents', 'tasks', 'articles', 'monitors', 'users', 'knowledgeBases'].includes(name))
    fields = { number: 'number', ...fields };
  return {
    fields: Object.keys(fields),
    dateColumn,
    async record(rawId) {
      const _id = /^[a-f\d]{24}$/i.test(rawId) ? new ObjectId(rawId) : rawId;
      const projection = Object.fromEntries(Object.values(fields).map((field) => [field, 1]));
      const row = await db.collection(name).findOne({ $and: [base, { _id }] }, { projection });
      return row ? view(row) : null;
    },
    async read(query, all = false) {
      const search = tableSearch(
        query,
        Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, `$${v}`])),
      );
      const filter = { $and: [base, search] };
      if (query.from || query.to)
        filter.$and.push({
          [fields[dateColumn]]: {
            ...(query.from ? { $gte: new Date(query.from) } : {}),
            ...(query.to ? { $lt: new Date(+new Date(query.to) + 86400000) } : {}),
          },
        });
      const projection = Object.fromEntries(
        [...new Set([...Object.values(fields), 'revision'])].map((field) => [field, 1]),
      );
      const cursor = db
        .collection(name)
        .find(filter, { projection })
        .sort({ [fields[query.sortBy]]: query.order === 'desc' ? -1 : 1, _id: 1 });
      const total = all ? undefined : await db.collection(name).countDocuments(filter);
      if (!all) cursor.skip((query.page - 1) * query.pageSize).limit(query.pageSize);
      return { total, cursor, view };
    },
  };
}

/** Bounded embedded configuration is filtered on the server, never in the browser. */
export function embeddedTable(rows, fields, dateColumn) {
  if (rows.some((row) => row.number) && !fields.includes('number')) fields = ['number', ...fields];
  return {
    fields,
    dateColumn,
    async record(rawId) {
      const row = rows.find((item) => String(item.id) === rawId);
      // Detail pages use only the same allowlisted columns as their source table.
      return row
        ? { id: String(row.id), ...Object.fromEntries(fields.map((field) => [field, row[field]])) }
        : null;
    },
    async read(query, all = false) {
      const needle = query.search.toLocaleLowerCase();
      const matches = rows.filter((row) => {
        const day = String(row[dateColumn] ?? '').slice(0, 10);
        return (
          (!query.from || day >= query.from) &&
          (!query.to || day <= query.to) &&
          (!needle ||
            (query.searchColumn ? [query.searchColumn] : fields).some((f) =>
              String(row[f] ?? '')
                .toLocaleLowerCase()
                .includes(needle),
            ))
        );
      });
      matches.sort((a, b) => {
        const left = a[query.sortBy],
          right = b[query.sortBy];
        const result =
          typeof left === 'number' && typeof right === 'number'
            ? left - right
            : String(left ?? '').localeCompare(String(right ?? ''), undefined, { numeric: true });
        return (
          (query.order === 'desc' ? -result : result) ||
          String(a.id ?? '').localeCompare(String(b.id ?? ''))
        );
      });
      return {
        total: matches.length,
        cursor: all
          ? matches
          : matches.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        view: (row) => row,
      };
    },
  };
}
