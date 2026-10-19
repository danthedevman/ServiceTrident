import test from 'node:test';
import assert from 'node:assert/strict';
import { formSections, validateFormLayout } from '../shared/forms/layout.js';
const fields = [{ id: 'title' }, { id: 'status' }, { id: 'old', archived: true }];
const section = { id: '123456789012345678901234', label: 'Response', columns: 2 };
test('form sections preserve field order, exclude archived fields and omit empty containers', () => {
  const value = validateFormLayout(
    {
      columns: 1,
      sections: [section, { ...section, id: '223456789012345678901234' }],
      assignments: { title: section.id, status: section.id },
    },
    fields,
  );
  assert.deepEqual(
    formSections(fields, value).map((row) => [row.id, row.fields.map((field) => field.id)]),
    [[section.id, ['title', 'status']]],
  );
  assert.deepEqual(
    formSections([...fields].reverse(), value)[0].fields.map((row) => row.id),
    ['status', 'title'],
  );
});
test('form layouts reject foreign fields, unknown sections, malformed columns and excess containers', () => {
  for (const value of [
    { columns: 3, sections: [], assignments: {} },
    { columns: 1, sections: [section, section], assignments: {} },
    { columns: 1, sections: [section], assignments: { workspaceId: section.id } },
    { columns: 1, sections: [], assignments: { title: section.id } },
    { columns: 1, sections: [{ ...section, columns: '2' }], assignments: {} },
    { columns: 1, sections: Array.from({ length: 13 }, () => section), assignments: {} },
  ])
    assert.throws(() => validateFormLayout(value, fields));
});

test('section names show by default and can be hidden without dropping fields', () => {
  const layout = (row) =>
    validateFormLayout({ columns: 2, sections: [row], assignments: { title: section.id } }, fields);
  assert.equal(layout(section).sections[0].showName, true);
  const hidden = layout({ ...section, showName: false });
  assert.equal(formSections(fields, hidden).find((row) => row.id === section.id).showName, false);
  assert.equal(
    formSections(fields, hidden).find((row) => row.id === section.id).fields[0].id,
    'title',
  );
  assert.throws(() => layout({ ...section, showName: 'false' }));
});
