import { COLOR_SCHEMES } from '../../../shared/domain/color-schemes.js';
import { useLocation } from 'react-router-dom';
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { AuthContext } from '../auth/auth-context.js';
import { api } from '../data/api.js';
import { uiPreferences, preferencePatch } from '../../../shared/domain/ui-preferences.js';

const PreferencesContext = createContext(null);
const previewKey = 'servicetrident-layout';
const accountKey = (id) => `servicetrident-layout:${id}`;
/** Cache only non-sensitive layout preferences; blocked storage falls back to memory. */
function read(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? uiPreferences(JSON.parse(value)) : null;
  } catch {
    return null;
  }
}
function pending(key) {
  try {
    return JSON.parse(localStorage.getItem(key))?.pending === true;
  } catch {
    return false;
  }
}
function persist(key, values, pending = false) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...uiPreferences(values), pending }));
  } catch {
    /* Layout still works without browser storage. */
  }
}
function initialLayout() {
  const cached = read(previewKey);
  if (cached) return cached;
  try {
    return uiPreferences({
      leftCollapsed: localStorage.getItem('servicetrident-sidebar') === 'collapsed',
    });
  } catch {
    return uiPreferences();
  }
}

/** Restore layout before paint and serialize authenticated preference writes to preserve toggle order. */
export function PreferencesProvider({ children }) {
  const pathname = useLocation().pathname;
  const publicStatus = pathname.startsWith('/status/public/');
  const { user } = useContext(AuthContext);
  const [resolvedAccount, setResolvedAccount] = useState(null);
  const [values, setValues] = useState(initialLayout),
    [error, setError] = useState('');
  useLayoutEffect(() => {
    const appearance = publicStatus ? { ...uiPreferences(), colorScheme: 'white' } : values;
    const root = document.documentElement;
    const palette =
      COLOR_SCHEMES.find((scheme) => scheme.id === appearance.colorScheme) ?? COLOR_SCHEMES[0];
    root.dataset.colorScheme = palette.id;
    root.dataset.contrast = appearance.highContrast ? 'high' : 'standard';
    root.dataset.reduceMotion = String(appearance.reduceMotion);
    root.dataset.textScale = appearance.textScale;
    root.style.setProperty('--app-background-light', palette.background);
    root.style.setProperty('--app-background-dark', palette.dark);
    root.style.setProperty(
      '--app-surface-light',
      `hsl(${palette.neutral} ${palette.neutralSaturation ?? 12}% 99%)`,
    );
    for (const [shade, lightness] of [
      [50, 97],
      [100, 94],
      [200, 88],
      [300, 79],
      [400, 66],
      [500, 48],
      [600, 38],
      [700, 28],
      [800, 22],
      [900, 15],
      [950, 9],
    ]) {
      root.style.setProperty(`--color-blue-${shade}`, `hsl(${palette.hue} 62% ${lightness}%)`);
      root.style.setProperty(
        `--color-slate-${shade}`,
        shade === 500 || shade === 400
          ? `light-dark(hsl(${palette.neutral} ${palette.neutralSaturation ?? 12}% ${shade === 500 ? 40 : 42}%), hsl(${palette.neutral} ${palette.neutralSaturation ?? 12}% ${shade === 500 ? 68 : 79}%))`
          : `hsl(${palette.neutral} ${palette.neutralSaturation ?? 12}% ${lightness}%)`,
      );
    }
  }, [
    values.colorScheme,
    values.highContrast,
    values.reduceMotion,
    values.textScale,
    publicStatus,
  ]);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty(
      '--record-rail-width',
      `${values.rightCollapsed ? 64 : values.rightPanelWidth}px`,
    );
  }, [values.rightCollapsed, values.rightPanelWidth]);
  const current = useRef(values),
    identity = useRef(user?.id),
    queue = useRef(Promise.resolve());
  const controller = useRef(null);
  identity.current = user?.id;
  useLayoutEffect(() => {
    controller.current?.abort();
    controller.current = new AbortController();
    if (!user) {
      setResolvedAccount(null);
      return;
    }
    const unsynced = pending(accountKey(user.id));
    const next = unsynced
      ? read(accountKey(user.id)) || initialLayout()
      : user.uiPreferences
        ? uiPreferences(user.uiPreferences)
        : read(accountKey(user.id)) || initialLayout();
    current.current = next;
    setValues(next);
    setResolvedAccount(user.id);
    setError('');
    persist(accountKey(user.id), next, unsynced);
    persist(previewKey, next);
    return () => controller.current?.abort();
  }, [user?.id]);
  useEffect(() => {
    const sync = (event) => {
      if (user && event.key === accountKey(user.id)) {
        const next = read(event.key);
        if (next) {
          current.current = next;
          setValues(next);
          persist(previewKey, next);
        }
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [user?.id]);
  function setPreference(key, value) {
    if (!user) return;
    try {
      preferencePatch({ [key]: value });
    } catch {
      return;
    }
    const next = { ...current.current, [key]: value },
      account = user.id,
      signal = controller.current.signal;
    current.current = next;
    setValues(next);
    setError('');
    persist(accountKey(account), next, true);
    persist(previewKey, next);
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        if (identity.current !== account || signal.aborted) return;
        try {
          await api('/auth/preferences', { method: 'PATCH', body: next, signal });
          if (identity.current !== account || signal.aborted) return;
          if (Object.keys(next).every((key) => current.current[key] === next[key])) {
            persist(accountKey(account), next);
            setError('');
          }
        } catch (failure) {
          if (!signal.aborted && identity.current === account)
            setError(
              'Preferences saved in this browser, but account sync failed. Change a setting to retry.',
            );
        }
      });
  }
  /** Update one view using the latest preferences so rapid changes do not overwrite other tables. */
  function setTableLayout(key, update) {
    const layouts = { ...current.current.tableLayouts };
    if (update === null) delete layouts[key];
    else
      layouts[key] =
        typeof update === 'function' ? update(layouts[key] ?? { order: [], hidden: [] }) : update;
    setPreference('tableLayouts', layouts);
  }
  return (
    <PreferencesContext.Provider
      value={{
        ...values,
        ready: !!user && resolvedAccount === user.id,
        setPreference,
        setTableLayout,
        error,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

/** Consume shared preferences without remounting record forms when the layout changes. */
export function useUiPreferences() {
  return useContext(PreferencesContext);
}
