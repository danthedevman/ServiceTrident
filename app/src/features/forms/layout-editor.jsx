import React from 'react';
import { Select } from '../../components/forms/select.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { newId } from '../../lib/identifiers.js';
import { DEFAULT_FORM_LAYOUT } from '../../../../shared/forms/layout.js';
export function LayoutEditor({ layout = DEFAULT_FORM_LAYOUT, onChange, disabled }) {
  const sections = layout.sections || [];
  const move = (index, offset) => {
    const next = [...sections];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange({ ...layout, sections: next });
  };
  return (
    <fieldset disabled={disabled} className="panel space-y-4 p-5">
      <legend className="font-semibold">Sections and Columns</legend>
      <p className="text-sm text-slate-500">
        Arrange sections here. Select a field to choose its section; field arrows control the order
        within each section. Empty sections are omitted from records.
      </p>
      <label className="field-label block max-w-xs">
        Ungrouped Fields
        <Columns value={layout.columns} onChange={(columns) => onChange({ ...layout, columns })} />
      </label>
      {sections.map((section, index) => (
        <div
          key={section.id}
          className="grid gap-3 rounded border border-slate-200 p-4 dark:border-slate-700 sm:grid-cols-2"
        >
          <label className="field-label">
            Section Name
            <input
              aria-label={`Section ${index + 1} name`}
              maxLength={80}
              required
              value={section.label}
              onChange={(event) =>
                onChange({
                  ...layout,
                  sections: sections.map((row) =>
                    row.id === section.id ? { ...row, label: event.target.value } : row,
                  ),
                })
              }
            />
          </label>
          <label className="field-label">
            Columns
            <Columns
              value={section.columns}
              onChange={(columns) =>
                onChange({
                  ...layout,
                  sections: sections.map((row) =>
                    row.id === section.id ? { ...row, columns } : row,
                  ),
                })
              }
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={section.showName !== false}
              onChange={(event) =>
                onChange({
                  ...layout,
                  sections: sections.map((row) =>
                    row.id === section.id ? { ...row, showName: event.target.checked } : row,
                  ),
                })
              }
            />
            Show section name
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Move section ${section.label} up`}
              disabled={disabled || index === 0}
              onClick={() => move(index, -1)}
            >
              Move Up
            </button>
            <button
              type="button"
              className="btn-secondary"
              aria-label={`Move section ${section.label} down`}
              disabled={disabled || index === sections.length - 1}
              onClick={() => move(index, 1)}
            >
              Move Down
            </button>
            <ConfirmDeleteButton
              className="btn-secondary"
              confirmation={`Remove the ${section.label} section? Its fields become ungrouped; their values are retained.`}
              onConfirm={() =>
                onChange({
                  ...layout,
                  sections: sections.filter((row) => row.id !== section.id),
                  assignments: Object.fromEntries(
                    Object.entries(layout.assignments).filter(([, id]) => id !== section.id),
                  ),
                })
              }
            >
              Remove Section
            </ConfirmDeleteButton>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled || sections.length >= 12}
        onClick={() =>
          onChange({
            ...layout,
            sections: [
              ...sections,
              { id: newId(), label: 'New Section', columns: 2, showName: true },
            ],
          })
        }
      >
        Add Section
      </button>
    </fieldset>
  );
}
function Columns({ value, onChange }) {
  return (
    <Select
      aria-label="Columns"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    >
      <option value={1}>Single Column</option>
      <option value={2}>Split Columns</option>
    </Select>
  );
}
