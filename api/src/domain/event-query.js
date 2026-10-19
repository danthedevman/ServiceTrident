import { InputError } from '@servicetrident/shared/validation/validation';

/** Parse an optional UTC calendar date without accepting rollover dates or arrays.
 * @param {unknown} value @returns {Date | null}
 */
function dateFilter(value) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new InputError('Use YYYY-MM-DD dates.');
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    throw new InputError('Invalid calendar date.');
  return date;
}

/** Validate history controls against fixed sort fields and bounded pagination.
 * @param {object} query @returns {object}
 */
export function eventQuery(query) {
  const sortBy = query.sortBy ?? 'checkedAt';
  const order = query.order ?? 'desc';
  if (
    !['number', 'checkedAt', 'durationMs', 'statusCode'].includes(sortBy) ||
    !['asc', 'desc'].includes(order)
  )
    throw new InputError('Invalid event sort.');
  const rawPage = query.page ?? '1';
  if (typeof rawPage !== 'string' || !/^[1-9]\d{0,4}$/.test(rawPage))
    throw new InputError('Invalid page number.');
  const rawSize = query.pageSize ?? '10';
  if (!['10', '25', '50'].includes(rawSize))
    throw new InputError('Page size must be 10, 25, or 50.');
  const from = dateFilter(query.from);
  const to = dateFilter(query.to);
  if (from && to && from > to) throw new InputError('Start date must be on or before end date.');
  const filter = {
    checkedAt: { $gte: new Date(Math.max(Date.now() - 30 * 86400000, from?.getTime() ?? 0)) },
  };
  if (to) filter.checkedAt.$lt = new Date(to.getTime() + 86400000);
  if (query.status !== undefined) {
    if (!['up', 'down'].includes(query.status)) throw new InputError('Status must be up or down.');
    filter.status = query.status;
  }
  const direction = order === 'asc' ? 1 : -1;
  return {
    filter,
    sort: { [sortBy]: direction, _id: direction },
    page: Number(rawPage),
    pageSize: Number(rawSize),
  };
}
