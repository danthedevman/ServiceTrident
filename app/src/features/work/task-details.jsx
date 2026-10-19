import React from 'react';
import { RecordFieldsReadOnly } from '../../components/forms/record-field-layout.jsx';
import { workBuiltinFields } from '../../../../shared/forms/form-options.js';

/** Shared field layout keeps board dialogs and record editors aligned. */
export function TaskDetails({ item, visibleFields = [], schema, layout }) {
  const fields = schema || [...workBuiltinFields('tasks'), ...visibleFields];
  return (
    <article className="record-details">
      <RecordFieldsReadOnly
        fields={fields}
        layout={layout}
        item={item}
        renderValue={(field) =>
          field.id === 'projectId' ? item.projectName || 'Unassigned' : undefined
        }
      />
    </article>
  );
}
