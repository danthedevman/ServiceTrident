import React, { useEffect, useId, useRef, useState } from 'react';
import { CameraIcon } from '@heroicons/react/24/outline';
import { ConfirmDeleteButton } from './confirm-delete-button.jsx';
import { writeApi } from '../data/query-client.js';

export function ProfileAvatar({ member, className = '' }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [member.id, member.photoVersion]);
  const label = member.displayName || member.email || 'User';
  const initials = label
    .trim()
    .split(/\s+/)
    .slice(0, 2)
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
    canvas.width = canvas.height = 256;
    const size = Math.min(bitmap.width, bitmap.height);
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
        256,
        256,
      );
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob || blob.size > 102400)
      throw new Error('Choose a simpler image; the resized photo must be no larger than 100 KB.');
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
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              aria-label="Upload Profile Photo"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setBusy(true);
                setError('');
                try {
                  const base64 = await normalizedPhoto(file);
                  const result = await writeApi(path, { method: 'PUT', body: { base64 } });
                  setVersion(result.photoVersion);
                } catch (failure) {
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
