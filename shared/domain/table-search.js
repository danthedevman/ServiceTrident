import { choice, text } from '../validation/fields.js';

/** Literal global search and an independent, allowlisted column condition share server predicates. */
export function tableSearch(query, columns) {
  const column = choice(query.searchColumn || '', ['', ...Object.keys(columns)], 'searchColumn');
  const search = text(query.search ?? '', 'search', 100, false).trim();
  const separateColumn = query.columnSearch !== undefined;
  const columnSearch = text(query.columnSearch ?? '', 'columnSearch', 100, false).trim();
  const match = (value, fields) => ({
    $or: fields.map((field) => ({
      $regexMatch: {
        input: { $convert: { input: field, to: 'string', onError: '', onNull: '' } },
        regex: value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        options: 'i',
      },
    })),
  });
  const conditions = [];
  if (search)
    conditions.push(
      match(search, !separateColumn && column ? [columns[column]] : Object.values(columns)),
    );
  if (separateColumn && columnSearch && column)
    conditions.push(match(columnSearch, [columns[column]]));
  if (!conditions.length) return {};
  return { $expr: conditions.length === 1 ? conditions[0] : { $and: conditions } };
}
