import { ConfirmDeleteButton } from '../../components/confirm-delete-button.jsx';
import { TrashIcon } from '@heroicons/react/24/outline';
import React, { useState } from 'react';
import { writeApi } from '../../data/query-client.js';

/** Re-encode uploaded raster images to a small PNG, removing metadata before upload. */
async function normalizeIcon(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024)
    throw new Error('Choose a PNG, JPEG, or WebP image up to 2 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000)
      throw new Error('Choose an image under 16 megapixels.');
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    if (base64.length > 136536)
      throw new Error('Choose a simpler image; the resized icon must be under 100 KB.');
    return base64;
  } finally {
    bitmap.close();
  }
}

/** Branding is saved explicitly and independently from visibility and announcement drafts. */
export function StatusIconUpload({ hasIcon }) {
  const [present, setPresent] = useState(hasIcon);
  const [version, setVersion] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function change(file) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (file)
        await writeApi('/status-settings/icon', {
          method: 'POST',
          body: { base64: await normalizeIcon(file) },
        });
      else await writeApi('/status-settings/icon', { method: 'DELETE' });
      setPresent(!!file);
      setNotice(file ? 'Icon updated.' : '');
      setVersion(Date.now());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Status Page Icon</h2>
      <div className="flex flex-wrap items-center gap-4">
        <img
          src={present ? `/api/status-settings/icon?v=${version}` : '/favicon.svg?v=service-nodes'}
          alt={present ? 'Custom status page icon' : 'Default ServiceTrident icon'}
          className="h-16 w-16 object-contain"
        />
        {present && (
          <ConfirmDeleteButton
            confirmation="Remove the custom status icon and restore the default icon?"
            confirmLabel="Remove"
            type="button"
            className="btn-danger gap-2"
            disabled={busy}
            onConfirm={() => change(null)}
          >
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
            Remove custom icon
          </ConfirmDeleteButton>
        )}
      </div>
      <label className="field-label">
        Upload icon
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void change(file);
            event.target.value = '';
          }}
        />
      </label>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        PNG, JPEG, or WebP · Up to 2 MB. Icon changes save immediately.
      </p>
      <p role="status" className="text-sm text-slate-500 dark:text-slate-400">
        {busy ? 'Updating icon…' : notice}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
