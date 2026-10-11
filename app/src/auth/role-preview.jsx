import { Select } from '../components/forms/select.jsx';
import { EyeIcon } from '@heroicons/react/24/outline';
import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from './auth-context.js';
import { writeApi, setSessionUser } from '../data/query-client.js';
import { displayValue } from '../lib/display-value.js';

/** Admin role previews use real API permissions and retain the signed-in person's identity. */
export function RolePreview({ banner = false }) {
  const { user } = useContext(AuthContext),
    navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  if ((user?.actualRole ?? user?.role) !== 'admin' || (banner && !user.impersonating)) return null;
  async function change(role) {
    if (busy || role === user.role) return;
    setBusy(true);
    setError('');
    try {
      const result = await writeApi('/auth/role', { method: 'POST', body: { role } });
      setSessionUser(result.user);
      // Other tabs discard their old role's data before loading the updated session.
      try {
        localStorage.setItem('servicetrident-role-change', String(Date.now()));
      } catch {
        /* Storage may be disabled. */
      }
      navigate('/', { replace: true });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={
        banner
          ? 'role-preview flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 p-3 text-sm dark:border-blue-900 dark:bg-blue-950'
          : 'space-y-2 px-3 py-2 text-sm'
      }
    >
      {banner ? (
        <>
          <span>Viewing as {displayValue(user.role)} · Your account identity is unchanged.</span>
          <button className="btn-secondary" disabled={busy} onClick={() => change('admin')}>
            {busy ? 'Switching…' : 'Return to Admin'}
          </button>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium">
            <span className="flex items-center gap-3">
              <EyeIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              Impersonation
            </span>
            <span className="mt-2 block">
              <Select
                className="!mt-0 !min-h-10 !py-2 !pl-3 !pr-7 !bg-slate-100 dark:!bg-slate-800"
                aria-label="Impersonate role"
                value={user.role}
                disabled={busy}
                onChange={(event) => change(event.target.value)}
              >
                {['admin', 'responder', 'viewer', 'user'].map((role) => (
                  <option key={role} value={role}>
                    {displayValue(role)}
                  </option>
                ))}
              </Select>
            </span>
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
