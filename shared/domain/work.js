import { tableSearch } from './table-search.js';
import { choice, identifier, invalid, text } from '../validation/fields.js';
import { TASK_STATUSES, ARTICLE_STATUSES } from '../forms/work-options.js';
import { taskLaneFilter } from './task-board.js';

/** Validate a complete task/article without accepting ownership or query operators. */
export function validateWork(body, kind, schema = null) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    invalid('title', 'Send a JSON object.');
  const task = kind === 'tasks';
  const result = {
    title: text(
      body.title ?? '',
      'title',
      160,
      schema
        ? schema.some((field) => field.id === 'title' && field.required && !field.archived)
        : true,
    ),
    status: choice(
      body.status ?? (task ? 'todo' : 'draft'),
      task ? TASK_STATUSES : ARTICLE_STATUSES,
      'status',
    ),
    serviceId: body.serviceId ? identifier(body.serviceId, 'serviceId') : null,
  };
  if (task) {
    result.projectId = body.projectId ? identifier(body.projectId, 'projectId') : null;
    result.description = text(body.description ?? '', 'description', 5000, false);
    result.priority = choice(body.priority ?? 'medium', ['low', 'medium', 'high'], 'priority');
    result.incidentId = body.incidentId ? identifier(body.incidentId, 'incidentId') : null;
    result.assignmentGroupId = body.assignmentGroupId
      ? identifier(body.assignmentGroupId, 'assignmentGroupId')
      : null;
    result.assigneeId = body.assigneeId ? identifier(body.assigneeId, 'assigneeId') : null;
    result.dueDate = body.dueDate ?? '';
    if (
      typeof result.dueDate !== 'string' ||
      (result.dueDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(result.dueDate) ||
          !Number.isFinite(Date.parse(result.dueDate)) ||
          new Date(result.dueDate).toISOString().slice(0, 10) !== result.dueDate))
    )
      invalid('dueDate', 'Enter a valid due date.');
  } else {
    result.articleType = choice(
      body.articleType ?? 'article',
      ['article', 'runbook'],
      'articleType',
    );
    result.steps = [];
    if (result.articleType === 'runbook') {
      if (!Array.isArray(body.steps) || !body.steps.length || body.steps.length > 30)
        invalid('steps', 'Add between 1 and 30 runbook steps.');
      result.steps = body.steps.map((step) => {
        if (
          !step ||
          typeof step !== 'object' ||
          Array.isArray(step) ||
          Object.keys(step).some((key) => !['title', 'instructions'].includes(key))
        )
          invalid('steps', 'Use a title and instructions for each step.');
        return {
          title: text(step.title ?? '', 'steps', 160),
          instructions: text(step.instructions ?? '', 'steps', 5000),
        };
      });
    }
    result.content = text(
      body.content ?? '',
      'content',
      30000,
      result.articleType === 'article' &&
        (schema ? schema.some((field) => field.id === 'content' && field.required) : true),
    );
    if (result.articleType === 'runbook')
      result.content = text(
        [
          result.content,
          ...result.steps.map((step, index) => `${index + 1}. ${step.title}\n${step.instructions}`),
        ]
          .filter(Boolean)
          .join('\n\n'),
        'content',
        30000,
      );
    result.knowledgeBaseId = body.knowledgeBaseId
      ? identifier(body.knowledgeBaseId, 'knowledgeBaseId')
      : null;
    result.summary = text(body.summary ?? '', 'summary', 500, false);
  }
  return result;
}

/** Use the same workspace-scoped filters for table pages and full CSV exports. */
export function workQuery(query, workspaceId, kind) {
  const task = kind === 'tasks';
  const filter = { workspaceId };
  Object.assign(
    filter,
    tableSearch(query, {
      title: '$title',
      status: { $ifNull: ['$statusLabel', '$status'] },
      service: { $ifNull: ['$serviceName', 'Unassigned'] },
      updatedAt: '$updatedAt',
      ...(task
        ? {
            priority: { $ifNull: ['$priorityLabel', '$priority'] },
            dueDate: '$dueDate',
            projectName: { $ifNull: ['$projectName', 'Unassigned'] },
            assignmentGroupName: { $ifNull: ['$assignmentGroupName', 'Unassigned'] },
            assignee: { $ifNull: ['$assigneeName', 'Unassigned'] },
          }
        : { knowledgeBaseTitle: { $ifNull: ['$knowledgeBaseTitle', 'Unassigned'] } }),
    }),
  );
  if (query.status)
    filter.status = choice(query.status, task ? TASK_STATUSES : ARTICLE_STATUSES, 'status');
  else filter.status = { $ne: 'archived' };
  if (task && query.statusOption) {
    const option = TASK_STATUSES.includes(query.statusOption)
      ? query.statusOption
      : identifier(query.statusOption, 'statusOption');
    const lane = taskLaneFilter(option, query.status || option);
    filter.$and = [...(filter.$and || []), lane];
  }
  if (!task && query.knowledgeBaseId)
    filter.knowledgeBaseId = identifier(query.knowledgeBaseId, 'knowledgeBaseId');
  if (query.serviceId) filter.serviceId = identifier(query.serviceId, 'serviceId');
  if (task && query.projectId)
    filter.projectId =
      query.projectId === 'unassigned' ? null : identifier(query.projectId, 'projectId');
  if (query.incidentId && task) filter.incidentId = identifier(query.incidentId, 'incidentId');
  const sortBy = choice(
    query.sortBy ?? 'updatedAt',
    task
      ? [
          'number',
          'title',
          'status',
          'priority',
          'dueDate',
          'createdAt',
          'updatedAt',
          'assignmentGroupName',
          'boardRank',
        ]
      : ['number', 'title', 'status', 'createdAt', 'updatedAt'],
    'sortBy',
  );
  const order = choice(query.order ?? 'desc', ['asc', 'desc'], 'order');
  const page = Number(query.page ?? 1),
    pageSize = Number(query.pageSize ?? 10);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || ![10, 25, 50].includes(pageSize))
    invalid('page', 'Choose a valid page and 10, 25, or 50 rows.');
  return { filter, sort: { [sortBy]: order === 'asc' ? 1 : -1, _id: -1 }, page, pageSize };
}
