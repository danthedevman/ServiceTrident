import React, { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  UserGroupIcon,
  PencilSquareIcon,
  CameraIcon,
  ArrowUpRightIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { AuthContext } from '../../auth/auth-context.js';
import { ActionMenu } from '../../components/action-menu.jsx';
import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { StateBadge } from '../../components/state-badge.jsx';
import { ProfileAvatar, ProfilePhotoEditor } from '../../components/profile-photo.jsx';
import { Modal } from '../../components/modal.jsx';
import { displayValue } from '../../lib/display-value.js';
import { writeApi } from '../../data/query-client.js';

/** A single directory surface keeps identities and per-record actions aligned without table controls. */
export function SettingsDirectoryRows({ section, rows, refresh }) {
  const { user } = useContext(AuthContext);
  const [photo, setPhoto] = useState(null);
  const people = section === 'users',
    admin = user?.role === 'admin';
  return (
    <>
      <div
        className={`settings-directory panel ${people ? 'settings-directory-users' : 'settings-directory-groups'}`}
      >
        <div className="settings-directory-columns" aria-hidden="true">
          <span>Name</span>
          <span>{people ? 'Role' : 'Members'}</span>
          <span>{people ? 'Access' : 'Description'}</span>
          <span />
        </div>
        <ul>
          {rows.map((row) => {
            const label = people
              ? row.displayName || row.email || 'Selected user'
              : row.name || 'Selected group';
            const href = `${people ? '/workspace' : '/groups'}/${row.id}`;
            return (
              <li key={row.id} className="settings-directory-row">
                <div className="settings-directory-identity">
                  {people ? (
                    <ProfileAvatar member={row} />
                  ) : (
                    <span className="profile-photo">
                      <UserGroupIcon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <Link className="settings-directory-name" to={href}>
                      {label}
                    </Link>
                    <p className="settings-directory-secondary">
                      {people ? row.email : 'Workspace group'}
                    </p>
                  </div>
                </div>
                <div className="settings-directory-meta">
                  <span className="sr-only">{people ? 'Role: ' : 'Members: '}</span>
                  {people ? (
                    <span className="settings-directory-tag">
                      {row.owner ? 'Admin (owner)' : displayValue(row.role)}
                    </span>
                  ) : (
                    <span className="break-words text-sm">{row.members || 'No members'}</span>
                  )}
                </div>
                <div className="settings-directory-meta">
                  {people ? (
                    <StateBadge status={row.disabled ? 'disabled' : 'active'} />
                  ) : (
                    <p className="settings-directory-secondary">
                      {row.description || 'No description added.'}
                    </p>
                  )}
                </div>
                <div className="settings-directory-actions">
                  <ActionMenu label={`Actions for ${label}`} borderless>
                    <Link to={href}>
                      <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
                      View Record
                    </Link>
                    {admin && !row.owner && (
                      <Link to={`${href}/edit`}>
                        <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                        Edit
                      </Link>
                    )}
                    {people && (admin || row.id === user.id) && !row.demoBatchId && (
                      <button type="button" onClick={() => setPhoto(row)}>
                        <CameraIcon className="h-4 w-4" aria-hidden="true" />
                        Change Photo
                      </button>
                    )}
                    {admin && !row.owner && row.id !== user.id && (
                      <ConfirmDeleteButton
                        className="text-rose-700 dark:text-rose-300"
                        title="Delete Record"
                        confirmation={`Delete “${label}”? This cannot be undone.${people ? ' Remove service ownership, group membership and on-call coverage first.' : ' Remove service ownership and record assignments first.'}`}
                        onConfirm={async () => {
                          await writeApi(`${people ? '/members' : '/groups'}/${row.id}`, {
                            method: 'DELETE',
                            body: { revision: row.revision },
                          });
                          await refresh();
                        }}
                      >
                        <TrashIcon className="h-4 w-4" aria-hidden="true" />
                        Delete
                      </ConfirmDeleteButton>
                    )}
                  </ActionMenu>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {photo && (
        <Modal
          title={`Profile Photo: ${photo.displayName || photo.email || 'Selected user'}`}
          onClose={() => setPhoto(null)}
          footer={
            <button type="button" className="btn-secondary" onClick={() => setPhoto(null)}>
              Done
            </button>
          }
        >
          <ProfilePhotoEditor member={photo} own={photo.id === user.id} />
        </Modal>
      )}
    </>
  );
}
