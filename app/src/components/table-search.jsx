import React from 'react';

/** Search all table columns; the server applies the query across the full dataset. */
export function TableSearch({ search, onSearch }) {
  return (
    <label className="field-label table-filter-search min-w-0">
      Filter rows
      <input
        type="search"
        value={search}
        maxLength={100}
        placeholder="Search all columns"
        onChange={(event) => onSearch(event.target.value)}
      />
    </label>
  );
}
