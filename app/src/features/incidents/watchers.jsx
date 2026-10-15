import React, { useState } from 'react';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { useSave } from '../../data/use-save.js';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Notice } from '../../components/forms/fields.jsx';

export function IncidentWatchers({ incidentId, data, refresh }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="space-y-3 border-b border-slate-200 pb-5 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Watchers</h2>
        <button
          type="button"
          className="text-sm text-blue-700 dark:text-blue-300"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Cancel' : 'Edit watchers'}
        </button>
      </div>
      {editing ? (
        <WatcherForm
          key={data.revision}
          incidentId={incidentId}
          data={data}
          onSaved={() => {
            setEditing(false);
            void refresh();
          }}
        />
      ) : (
        <p className="text-sm text-slate-500">
          {[
            ...data.watcherUserIds.map(
              (id) => data.members.find((member) => member.id === id)?.label,
            ),
            ...data.watcherGroupIds.map(
              (id) => data.groups.find((group) => group.id === id)?.label,
            ),
          ]
            .filter(Boolean)
            .join(', ') || 'No watchers'}
        </p>
      )}
    </section>
  );
}
function WatcherForm({ incidentId, data, onSaved }) {
  const [users, setUsers] = useState(data.watcherUserIds),
    [groups, setGroups] = useState(data.watcherGroupIds);
  const save = useSave();
  return (
    <ValidatedForm
      noValidate
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.run(
          `/incidents/${incidentId}/watchers`,
          'PUT',
          { watcherUserIds: users, watcherGroupIds: groups, revision: data.revision },
          onSaved,
        );
      }}
    >
      <Notice error={save.error} />
      <ReferenceField
        label="Watcher users"
        name="watcherUserIds"
        options={data.members}
        value={users}
        onChange={setUsers}
        multiple
        disabled={save.busy}
        error={save.fields.watcherUserIds}
      />
      <ReferenceField
        label="Watcher groups"
        name="watcherGroupIds"
        options={data.groups}
        value={groups}
        onChange={setGroups}
        multiple
        disabled={save.busy}
        error={save.fields.watcherGroupIds}
      />
      <p className="text-xs text-slate-500">
        Watchers receive comment alerts only while they can access the incident. Internal notes
        notify authorized staff only.
      </p>
      <button className="btn-primary" disabled={save.busy}>
        Save
      </button>
    </ValidatedForm>
  );
}
