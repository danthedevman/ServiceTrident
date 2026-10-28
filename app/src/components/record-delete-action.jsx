import { useForgetRecordTab } from './record-navigation.jsx';
import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrashIcon } from '@heroicons/react/24/outline';
import { AuthContext } from '../auth/auth-context.js';
import { ConfirmDeleteButton } from './confirm-delete-button.jsx';
import { writeApi } from '../data/query-client.js';

const supported = new Set(['incidents', 'tasks', 'knowledge', 'rcas']);

/** Only endpoints with admin-only record deletion belong in this shared action. */
export function RecordDeleteAction({ kind, item }) {
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const forgetRecord = useForgetRecordTab();
  if (user?.role !== 'admin' || !item?.id || !supported.has(kind)) return null;
  const label = item.title || item.name || 'Selected record';
  const consequence =
    kind === 'incidents'
      ? 'Its attachments, comments and notification deliveries will be removed. Linked tasks will be retained without this incident.'
      : kind === 'knowledge'
        ? 'Its attachments will be removed and it will be unlinked from incidents.'
        : 'Its attachments will also be removed. Related records will be retained.';
  return (
    <ConfirmDeleteButton
      className="text-rose-700 dark:text-rose-300"
      title="Delete Record"
      confirmation={`Delete “${label}”? ${consequence} This cannot be undone.`}
      onConfirm={async () => {
        await writeApi(`/${kind}/${encodeURIComponent(item.id)}`, {
          method: 'DELETE',
          body: { revision: item.revision },
        });
        forgetRecord?.(`/${kind}/${item.id}`);
        navigate(`/${kind}`, { replace: true });
      }}
    >
      <TrashIcon className="h-5 w-5" aria-hidden="true" />
      Delete Record
    </ConfirmDeleteButton>
  );
}
