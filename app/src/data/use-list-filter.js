import { useContext } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../auth/auth-context.js';
import { useUiPreferences } from '../preferences/ui-preferences.jsx';

/** Restore controls and query values from the same per-user, per-list preference. */
export function useListFilter(field, initial, scope) {
  const { pathname } = useLocation(),
    [params, setParams] = useSearchParams();
  const { user } = useContext(AuthContext),
    preferences = useUiPreferences();
  const key = `${pathname}:${scope}:${params.get('view') || 'default'}:${user?.role || 'user'}`;
  const saved = (preferences.ready ? preferences.listFilters : user?.uiPreferences?.listFilters)?.[
    key
  ];
  const fallback = typeof initial === 'function' ? initial() : initial;
  const explicit = params.has(field) && typeof fallback === 'string';
  const value = explicit
    ? params.get(field)
    : saved && Object.hasOwn(saved, field)
      ? saved[field]
      : fallback;
  function setValue(next) {
    const resolved = typeof next === 'function' ? next(value) : next;
    if (explicit && params.get(field) !== String(resolved))
      setParams(
        (previous) => {
          const updated = new URLSearchParams(previous);
          if (resolved) updated.set(field, String(resolved));
          else updated.delete(field);
          return updated;
        },
        { replace: true },
      );
    preferences.setListFilter(key, field, resolved, fallback);
  }
  return [value, setValue];
}
