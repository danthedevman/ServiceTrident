import { AuthContext } from '../auth/auth-context.js';
import React, { useContext, useEffect, useId, useRef, useState } from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';
import { ConfirmDeleteButton } from './confirm-delete-button.jsx';
import { writeApi } from '../data/query-client.js';

export function ProfileAvatar({ member, className = '', initialsCount = 2 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [member.id, member.photoVersion]);
  const label = member.displayName || member.email || 'User';
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, initialsCount)
    .map((value) => value[0])
    .join('')
    .toUpperCase();
  const photo =
    typeof member.photoVersion === 'string' && /^[a-f0-9-]{36}$/.test(member.photoVersion);
  return (
    <span className={`profile-photo ${className}`} aria-hidden="true">
      {photo && !failed ? (
        <img
          src={`/api/member-photos/${encodeURIComponent(member.id)}?v=${encodeURIComponent(member.photoVersion)}`}
          alt=""
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}

/** Decode a bounded raster locally and discard its metadata by exporting a small square PNG. */
async function normalizedPhoto(file) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error('Choose a PNG, JPEG or WebP image up to 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error('Choose an image no larger than 8192 pixels on either side.');
    const canvas = document.createElement('canvas');
    const size = Math.min(bitmap.width, bitmap.height);
    let blob;
    // Photographs may need a smaller raster to stay within the server's byte budget.
    for (const edge of [256, 192, 128]) {
      canvas.width = canvas.height = edge;
      canvas
        .getContext('2d')
        .drawImage(
          bitmap,
          (bitmap.width - size) / 2,
          (bitmap.height - size) / 2,
          size,
          size,
          0,
          0,
          edge,
          edge,
        );
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob && blob.size <= 102400) break;
    }
    if (!blob || blob.size > 102400)
      throw new Error('This image could not be resized. Choose another image.');
    const data = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return data.split(',')[1];
  } finally {
    bitmap.close();
  }
}

export function ProfilePhotoEditor({ member, own = false }) {
  const { user } = useContext(AuthContext);
  const actor = `${user?.id}:${user?.workspaceId}:${user?.role}`;
  const owner = useRef(actor),
    pending = useRef(null);
  owner.current = actor;
  useEffect(() => () => pending.current?.abort(), [actor]);
  const id = useId();
  const fileInput = useRef(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [version, setVersion] = useState(member.photoVersion || '');
  useEffect(() => setVersion(member.photoVersion || ''), [member.photoVersion]);
  const path = own ? '/auth/photo' : `/member-photos/${encodeURIComponent(member.id)}`;
  return (
    <section className="profile-photo-editor space-y-3" aria-label="Profile Photo" aria-busy={busy}>
      <div className="flex flex-wrap items-center gap-4">
        <ProfileAvatar
          member={{ ...member, photoVersion: version }}
          className="profile-photo-large"
        />
        <div className="space-y-2">
          <h2 className="font-semibold">Profile Photo</h2>
          <p className="text-xs text-slate-500">
            PNG, JPEG or WebP, up to 5 MB. Photos save immediately.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-secondary inline-flex items-center gap-2"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <CameraIcon className="h-4 w-4" aria-hidden="true" />
              Upload Photo
            </button>
            <input
              id={id}
              ref={fileInput}
              hidden
              className="hidden"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              aria-label="Upload Profile Photo"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const controller = new AbortController();
                pending.current = controller;
                const uploader = actor;
                setBusy(true);
                setError('');
                try {
                  const base64 = await normalizedPhoto(file);
                  if (controller.signal.aborted || owner.current !== uploader) return;
                  const result = await writeApi(path, {
                    method: 'PUT',
                    body: { base64 },
                    signal: controller.signal,
                  });
                  setVersion(result.photoVersion);
                } catch (failure) {
                  if (controller.signal.aborted) return;
                  setError(
                    failure.message || 'The image could not be uploaded. Choose another image.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
            {version && (
              <ConfirmDeleteButton
                className="text-sm text-rose-700 dark:text-rose-300"
                disabled={busy}
                title="Remove Profile Photo"
                confirmation={`Remove the profile photo for “${member.displayName || member.email || 'Selected user'}”? Initials will be shown instead.`}
                onConfirm={async () => {
                  await writeApi(path, { method: 'DELETE', body: {} });
                  setVersion('');
                }}
              >
                Remove Photo
              </ConfirmDeleteButton>
            )}
          </div>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}
