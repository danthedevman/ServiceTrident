import React from 'react';
import { Select } from './forms/select.jsx';

/** One explicit column condition remains separate from the list-wide search. */
export function ColumnFilter({ columns, column, value, onColumn, onValue }) {
  return (
    <fieldset className="table-column-filter">
      <label className="field-label">
        Column
        <Select
          aria-label="Filter Column"
          value={column}
          onChange={(event) => onColumn(event.target.value)}
        >
          <option value="">Choose a column</option>
          {columns
            .filter((item) => item.sortable !== false)
            .map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
        </Select>
      </label>
      {column && (
        <label className="field-label">
          Contains
          <input
            aria-label="Column Contains"
            value={value}
            maxLength={100}
            onChange={(event) => onValue(event.target.value)}
          />
        </label>
      )}
    </fieldset>
  );
}
