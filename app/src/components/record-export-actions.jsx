import React, { useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowDownTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../auth/auth-context.js';
import { useDateTime } from '../preferences/date-time.jsx';
import { api } from '../data/api.js';
import { notify } from '../data/toast.js';
import { saveCsv } from '../lib/csv-download.js';
import { recordExportRows, recordCsv, recordPdfDefinition } from '../lib/record-export.js';

const collections = {
  services: 'services',
  collections: 'collections',
  groups: 'groups',
  workspace: 'members',
  integrations: 'integrations',
  'on-call': 'shifts',
};
const paths = {
  knowledgeBases: 'knowledge-bases',
  serviceAccounts: 'settings/service-accounts',
  eventAlerts: 'event-alerts',
};
const schemas = {
  incidents: '/incident-fields',
  tasks: '/task-fields',
  knowledge: '/knowledge-fields',
  rcas: '/rca-fields',
};
/** Each download reuses the ordinary read endpoint: role, tenancy, retention and secret projections stay authoritative. */
export function RecordExportActions({ kind, item, path: explicitPath }) {
  const { user } = useContext(AuthContext),
    location = useLocation(),
    format = useDateTime();
  const owner = useRef(user);
  owner.current = user;
  const pending = useRef(null),
    [busy, setBusy] = useState(false);
  useEffect(() => () => pending.current?.abort(), []);
  if (!item?.id || !kind) return null;
  async function download(type) {
    if (pending.current) return;
    const controller = new AbortController(),
      actor = owner.current;
    pending.current = controller;
    setBusy(true);
    try {
      const path =
        explicitPath ||
        (kind === 'events'
          ? location.pathname
          : collections[kind]
            ? `/${kind === 'workspace' ? 'members' : kind}`
            : `/${paths[kind] || kind}/${encodeURIComponent(item.id)}`);
      const data = await api(
        `${path}${path.includes('?') ? '&' : '?'}recordExport=${type}&recordExportId=${encodeURIComponent(item.id)}`,
        {
          signal: controller.signal,
        },
      );
      const record = collections[kind]
        ? data[collections[kind]]?.find((row) => row.id === item.id)
        : kind === 'events'
          ? data.event
          : data.item || data.incident || data.monitor;
      if (!record) throw new Error('Record is no longer available. Refresh before exporting.');
      const schema = schemas[kind] ? await api(schemas[kind], { signal: controller.signal }) : null;
      const linked =
        kind === 'rcas'
          ? [
              ['Related Incidents', data.incidents],
              ['Corrective Action Tasks', data.tasks],
            ].map(([label, rows]) => ({
              key: label,
              label,
              value: (rows || [])
                .map((row) => `${row.number || ''} ${row.title}`.trim())
                .join('\n'),
            }))
          : [];
      const rows = recordExportRows(kind, record, schema?.fields, {
        format,
        tableFields: data.fields,
        linked,
      });
      const title =
        record.title ||
        record.name ||
        record.displayName ||
        `${kind} ${record.number || ''}`.trim();
      const filename =
        (record.number || title).replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'record';
      const stillAuthorized = () =>
        !controller.signal.aborted &&
        owner.current?.id === actor?.id &&
        owner.current?.role === actor?.role;
      let blob;
      if (type === 'csv') blob = new Blob([recordCsv(rows)], { type: 'text/csv;charset=utf-8' });
      else {
        const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
          import('pdfmake/build/pdfmake'),
          import('pdfmake/build/vfs_fonts'),
        ]);
        pdfMake.addVirtualFileSystem(fonts);
        blob = await pdfMake.createPdf(recordPdfDefinition(title, rows)).getBlob();
      }
      if (stillAuthorized()) saveCsv(blob, `${filename}.${type}`);
    } catch (error) {
      if (!controller.signal.aborted)
        notify(error.message || 'Could not export this record.', 'error');
    } finally {
      pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <button type="button" disabled={busy} onClick={() => download('csv')}>
        <ArrowDownTrayIcon className="h-5 w-5" aria-hidden="true" />
        Export CSV
      </button>
      <button type="button" disabled={busy} onClick={() => download('pdf')}>
        <DocumentTextIcon className="h-5 w-5" aria-hidden="true" />
        Export PDF
      </button>
    </>
  );
}
