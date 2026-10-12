import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import React, { createContext, useContext, useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext(null);

/** Share appearance across routes without storing any account information.
 * @param {{children: React.ReactNode}} props
 */
export function ThemeProvider({ children }) {
  const publicStatus = useLocation().pathname.startsWith('/status/public/');
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('servicetrident-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      /* Browser storage may be disabled. */
    }
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  });
  const [pageAppearance, setPageAppearance] = useState(null);
  useLayoutEffect(() => {
    const appearance = pageAppearance || (publicStatus ? 'light' : theme);
    document.documentElement.dataset.theme = appearance;
    document.documentElement.style.backgroundColor = 'var(--app-background)';
    document.documentElement.style.colorScheme = appearance;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', appearance === 'dark' ? '#020617' : '#1d4ed8');
  }, [theme, publicStatus, pageAppearance]);

  /** Persist an explicit preference; the toggle still works if storage is unavailable. */
  function setAppearance(next) {
    try {
      localStorage.setItem('servicetrident-theme', next);
    } catch {
      /* Keep this session's choice. */
    }
    setTheme(next);
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setAppearance,
        setPageAppearance,
        toggleTheme: () => setAppearance(theme === 'dark' ? 'light' : 'dark'),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

/** Keyboard-accessible appearance switch available before and after sign-in. */
export function ThemeToggle({ menu = false }) {
  const { theme, toggleTheme } = useContext(ThemeContext);
  return (
    <button
      type="button"
      className={
        menu
          ? 'profile-menu-item'
          : 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
      }
      onClick={toggleTheme}
      aria-label={menu ? undefined : 'Dark mode'}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <MoonIcon className={menu ? 'h-5 w-5 shrink-0' : 'h-4 w-4'} aria-hidden="true" />
      ) : (
        <SunIcon className={menu ? 'h-5 w-5 shrink-0' : 'h-4 w-4'} aria-hidden="true" />
      )}
      {menu && <span>Dark mode</span>}
      {menu && (
        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {theme === 'dark' ? 'On' : 'Off'}
        </span>
      )}
    </button>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
