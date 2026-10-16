import React from 'react';

/** Search all table columns; the server applies the query across the full dataset. */
export function TableSearch({ search, onSearch }) {
  return (
    <label className="field-label block min-w-0">
      <span className="sr-only">Search list</span>
      <input
        type="search"
        aria-label="Search list"
        className="!mt-0"
        value={search}
        maxLength={100}
        placeholder="Search all columns"
        onChange={(event) => onSearch(event.target.value)}
      />
    </label>
  );
}
