import { choice, text, identifier, invalid } from '../validation/fields.js';

export const RCA_STATUSES = {
  draft: 'Draft',
  in_review: 'In Review',
  completed: 'Completed',
  archived: 'Archived',
};
export const RCA_SECTIONS = {
  summary: 'Summary',
  impact: 'Impact',
  timeline: 'Timeline',
  rootCause: 'Root Cause',
  contributingFactors: 'Contributing Factors',
  correctiveActions: 'Corrective Actions',
  lessonsLearned: 'Lessons Learned',
};
export const RCA_FIELDS = Object.entries({
  title: 'Title',
  status: 'Status',
  ...RCA_SECTIONS,
  incidentIds: 'Related Incidents',
  taskIds: 'Corrective Action Tasks',
}).map(([id, label]) => ({
  id,
  label,
  type: 'builtin',
  required: id === 'title',
  archived: false,
  options: [],
}));

/** Bounded inputs; ownership, revision, numbers and attribution remain server-owned. */
export function validateRca(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) =>
        ![
          'title',
          'status',
          'incidentIds',
          'taskIds',
          'revision',
          'custom',
          ...Object.keys(RCA_SECTIONS),
        ].includes(key),
    )
  )
    invalid('title', 'Send only editable RCA fields.');
  const result = {
    title: text(body.title, 'title', 160),
    status: choice(body.status ?? 'draft', Object.keys(RCA_STATUSES), 'status'),
  };
  for (const key of Object.keys(RCA_SECTIONS))
    result[key] = text(
      body[key] ?? '',
      key,
      10000,
      result.status === 'completed' && ['summary', 'rootCause', 'correctiveActions'].includes(key),
    );
  for (const key of ['incidentIds', 'taskIds']) {
    const values = body[key] ?? [];
    if (!Array.isArray(values) || values.length > 50 || new Set(values).size !== values.length)
      invalid(key, 'Choose up to 50 distinct records.');
    result[key] = values.map((value) => identifier(value, key));
  }
  return result;
}
