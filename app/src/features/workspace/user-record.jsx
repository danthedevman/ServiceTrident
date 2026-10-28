import { ProfilePhotoEditor, ProfileAvatar } from '../../components/profile-photo.jsx';
import { StaticRecordFields } from '../../components/forms/record-field-layout.jsx';
import { useResource } from '../../data/use-resource.js';
import { ValidatedForm } from '../../components/forms/validated-form.jsx';
import { Link } from 'react-router-dom';
import { notify } from '../../data/toast.js';
import { timeZoneOptions } from '../../lib/time-zones.js';
import { Select } from '../../components/forms/select.jsx';
import { ReferenceField } from '../../components/forms/reference-field.jsx';
import { Toggle } from '../../components/forms/toggle.jsx';
import React, { useContext, useState } from 'react';
import { AuthContext } from '../../auth/auth-context.js';
import { PrivateProfileSettings } from '../../auth/private-profile-settings.jsx';
import { RecordWorkspace, RecordMetadata } from '../../components/record-workspace.jsx';
import { RecordActions } from '../../components/record-actions.jsx';
import { Field, Notice } from '../../components/forms/fields.jsx';
import { useSave } from '../../data/use-save.js';
import { displayValue } from '../../lib/display-value.js';
import { USER_DETAIL_FIELDS, userDetails } from '../../../../shared/domain/user-details.js';

/** One directory record layout for profiles and workspace members; private controls are self-only. */
export function UserRecord({ member }) {
  const { user } = useContext(AuthContext);
  const own = member.id === user?.id;
  const [editing, setEditing] = useState(false);
  return (
    <RecordWorkspace
      item={member}
      kind="workspace"
      onEdit={!editing && (own || user?.role === 'admin') ? () => setEditing(true) : undefined}
      sidebar={<RecordMetadata item={member} />}
      secondaryActions={
        user?.role === 'admin' && !own && !member.owner && !member.demoBatchId ? (
          <Link className="btn-secondary" to={`/workspace/${member.id}/password`}>
            Reset password
          </Link>
        ) : null
      }
    >
      {own || user?.role === 'admin' ? (
        <ProfilePhotoEditor member={member} own={own} />
      ) : (
        <ProfileAvatar member={member} className="profile-photo-large" />
      )}
      <UserDetailsForm
        key={`${member.id}-${editing ? 'edit' : member.revision}`}
        readOnly={!editing || !(own || user?.role === 'admin')}
        member={member}
        own={own}
        onClose={() => setEditing(false)}
      />
      <p className="text-sm text-slate-500">
        Your time zone controls personal timestamp displays and helps coordinate coverage. Schedules
        and status-history days remain in UTC; adding a phone number does not enable SMS or voice
        notifications.
      </p>
      {own && !editing && (
        <section className="mt-8 space-y-5 border-t border-slate-200 pt-6 dark:border-slate-700">
          <PrivateProfileSettings member={member} />
        </section>
      )}
    </RecordWorkspace>
  );
}

/** Validate shared contact fields on both client and server while keeping access controls separate. */
function UserDetailsForm({ member, own, onClose, readOnly = false }) {
  const communication = useResource('/communication-options', 30000);
  const { user } = useContext(AuthContext);
  const admin = user?.role === 'admin';
  const save = useSave();
  const [value, setValue] = useState(member);
  const [errors, setErrors] = useState({});
  return (
    <ValidatedForm
      className="form-body"
      onSubmit={(event) => {
        event.preventDefault();
        if (readOnly) return;
        try {
          const details = userDetails(value);
          if (admin && (value.groupIds?.length ?? 0) > 100) {
            setErrors({ groupIds: 'Choose up to 100 groups.' });
            notify('Choose up to 100 groups.', 'error');
            return;
          }
          setErrors({});
          save.run(
            own && !admin ? '/auth/details' : `/members/${member.id}`,
            'PATCH',
            own && !admin
              ? details
              : {
                  ...details,
                  role: value.role,
                  disabled: !!value.disabled,
                  groupIds: value.groupIds ?? [],
                  groupsRevision: value.groupsRevision,
                },
            onClose,
          );
        } catch (error) {
          setErrors(error.fields ?? {});
          notify(error.message, 'error');
        }
      }}
    >
      <Notice error={save.error || Object.values(errors)[0]} />
      <StaticRecordFields readOnly={readOnly}>
        {USER_DETAIL_FIELDS.filter(
          (field) => !field.communication || communication.data?.[field.communication],
        ).map((field) => (
          <Field
            key={field.key}
            name={field.key}
            label={`${field.label}${field.required ? ' *' : ''}`}
            errors={{ ...save.fields, ...errors }}
          >
            {field.key === 'timeZone' ? (
              <Select
                searchLabel="Search time zones"
                name="timeZone"
                value={value.timeZone ?? ''}
                onChange={(event) => setValue({ ...value, timeZone: event.target.value })}
              >
                <option value="">Use browser time zone</option>
                {timeZoneOptions(value.timeZone).map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </Select>
            ) : (
              <input
                name={field.key}
                type={field.type || 'text'}
                required={field.required}
                maxLength={field.max}
                placeholder={field.placeholder}
                value={value[field.key] ?? ''}
                onChange={(event) => setValue({ ...value, [field.key]: event.target.value })}
              />
            )}
          </Field>
        ))}
        <Field name="email" label="Email">
          <input type="email" value={member.email} readOnly />
        </Field>
        {admin && (
          <ReferenceField
            label="Groups"
            name="groupIds"
            referenceType="groups"
            multiple
            value={value.groupIds ?? []}
            onChange={(groupIds) => setValue({ ...value, groupIds })}
            error={errors.groupIds || save.fields.groupIds}
            disabled={save.busy}
          />
        )}
        {!own && (
          <>
            <label className="field-label">
              Role
              <Select
                value={value.role}
                disabled={member.owner}
                onChange={(event) => setValue({ ...value, role: event.target.value })}
              >
                {['admin', 'responder', 'user', 'viewer'].map((role) => (
                  <option key={role} value={role}>
                    {displayValue(role)}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2">
              <Toggle
                checked={!value.disabled}
                disabled={member.owner || !!member.demoBatchId}
                onChange={(event) => setValue({ ...value, disabled: !event.target.checked })}
              />
              Account enabled
            </label>
            <p className="text-sm text-slate-500">
              Saving signs this teammate out of existing sessions.
            </p>
          </>
        )}
      </StaticRecordFields>
      {!readOnly && (
        <RecordActions>
          <button type="button" className="btn-secondary" disabled={save.busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" disabled={save.busy}>
            {save.busy ? 'Saving…' : 'Save'}
          </button>
        </RecordActions>
      )}
    </ValidatedForm>
  );
}
