import React from 'react';
import { RecordFieldsReadOnly } from './forms/record-field-layout.jsx';

/** Explicit entries keep immutable records consistent with forms without exposing raw API fields. */
export function RecordDetailSection({ title, entries, columns = 2 }) {
  const values = Object.fromEntries(entries);
  return (
    <section className="record-details min-w-0 space-y-4" aria-label={title}>
      <h2 className="font-semibold">{title}</h2>
      <RecordFieldsReadOnly
        fields={entries.map(([label]) => ({ id: label, label, type: 'builtin' }))}
        layout={{ columns, sections: [], assignments: {} }}
        item={values}
        renderValue={(field) => {
          const value = values[field.id];
          return typeof value === 'boolean'
            ? value
              ? 'Yes'
              : 'No'
            : value === '' || value == null
              ? '—'
              : value;
        }}
      />
    </section>
  );
}
