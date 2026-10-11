import test from 'node:test';
import assert from 'node:assert/strict';
import { tableRecordLink } from '../app/src/lib/table-record-link.js';

test('table launch links resolve known records and do not invent detail pages', () => {
  assert.equal(tableRecordLink('members', '/members', { id: 'person' }), '/workspace/person');
  assert.equal(
    tableRecordLink('monitors?serviceId=service', undefined, { id: 'check' }),
    '/monitors/check',
  );
  assert.equal(tableRecordLink(undefined, '/incidents', { id: 'incident' }), '/incidents/incident');
  assert.equal(
    tableRecordLink('incident-knowledge?recordId=incident', undefined, { id: 'article' }),
    '/knowledge/article',
  );
  assert.equal(tableRecordLink('headers', undefined, { id: 'header' }), '/records/headers/header');
  assert.equal(
    tableRecordLink('inquiries', '/settings/marketing/inquiries', { id: 'inquiry' }),
    '/records/inquiries/inquiry',
  );
  assert.equal(tableRecordLink('services', undefined, {}), null);
  assert.equal(tableRecordLink('services', undefined, { id: '../other' }), '/services/..%2Fother');
});

test('history launch links retain only parent authorization parameters', () => {
  assert.equal(
    tableRecordLink('activity?recordId=incident&search=private&workspaceId=other', null, {
      id: '0',
    }),
    '/records/activity/0?recordId=incident',
  );
  assert.equal(
    tableRecordLink('incident-monitor-events?recordId=incident', null, {
      id: 'event',
      monitorId: 'monitor',
    }),
    '/monitors/monitor/events/event',
  );
  assert.equal(tableRecordLink('unknown', null, { id: 'row' }), null);
});
