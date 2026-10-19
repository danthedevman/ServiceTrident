import { invalid, identifier, text } from '../validation/fields.js';

export const DEFAULT_FORM_LAYOUT = Object.freeze({ columns: 2, sections: [], assignments: {} });
/** Layout is presentation only; field identities, validation and authorization remain authoritative. */
export function validateFormLayout(value, fields) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !['columns', 'sections', 'assignments'].includes(key))
  )
    invalid('layout', 'Use sections, field assignments and a column layout.');
  if (
    ![1, 2].includes(value.columns) ||
    !Array.isArray(value.sections) ||
    value.sections.length > 12
  )
    invalid('layout', 'Choose one or two columns and at most 12 sections.');
  const seen = new Set();
  const sections = value.sections.map((row) => {
    if (
      !row ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      Object.keys(row).some((key) => !['id', 'label', 'columns', 'showName'].includes(key))
    )
      invalid('layout', 'Use a section label and column layout.');
    const id = identifier(row.id, 'layout');
    if (seen.has(id)) invalid('layout', 'Section identifiers must be unique.');
    seen.add(id);
    if (![1, 2].includes(row.columns)) invalid('layout', 'Choose one or two columns per section.');
    if (row.showName !== undefined && typeof row.showName !== 'boolean')
      invalid('layout', 'Choose whether to show the section name.');
    return {
      showName: row.showName !== false,
      id,
      label: text(row.label, 'layout', 80),
      columns: row.columns,
    };
  });
  const assignments = value.assignments;
  if (
    !assignments ||
    typeof assignments !== 'object' ||
    Array.isArray(assignments) ||
    Object.keys(assignments).length > fields.length
  )
    invalid('layout', 'Assign existing fields to sections.');
  for (const [field, section] of Object.entries(assignments))
    if (!fields.some((row) => row.id === field) || !seen.has(section))
      invalid('layout', 'Choose an existing field and section.');
  return { columns: value.columns, sections, assignments: { ...assignments } };
}
/** Empty sections never create a heading, wrapper or gap. Field order always follows the schema. */
export function formSections(fields, layout = DEFAULT_FORM_LAYOUT) {
  const sections = Array.isArray(layout?.sections) ? layout.sections : [];
  const assignments = layout?.assignments || {};
  const visible = fields.filter((field) => !field.archived);
  return [
    {
      id: 'ungrouped',
      label: '',
      columns: layout?.columns === 1 ? 1 : 2,
      fields: visible.filter(
        (field) => !sections.some((section) => section.id === assignments[field.id]),
      ),
    },
    ...sections.map((section) => ({
      ...section,
      fields: visible.filter((field) => assignments[field.id] === section.id),
    })),
  ].filter((section) => section.fields.length);
}
