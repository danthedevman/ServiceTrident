import React from 'react';
import { COLOR_SCHEMES } from '../../../shared/domain/color-schemes.js';
import { useUiPreferences } from './ui-preferences.jsx';
import { ThemeToggle, useTheme } from './theme.jsx';
import { Toggle } from '../components/forms/toggle.jsx';
import { Select } from '../components/forms/select.jsx';

/** Native radios make palette cards usable with a keyboard and expose selected state. */
export function ThemeSettings() {
  const preferences = useUiPreferences();
  const { setAppearance } = useTheme();
  return (
    <section className="space-y-5" aria-labelledby="theme-settings-title">
      <header className="flex items-center justify-between gap-3">
        <h2 id="theme-settings-title" className="text-lg font-semibold">
          Theme
        </h2>
        <ThemeToggle />
      </header>
      <p className="text-sm text-slate-500">
        Default and Light are the primary neutral themes. Choose colors for backgrounds, navigation,
        links, and controls. Each scheme supports light and dark mode.
      </p>
      <fieldset>
        <legend className="field-label mb-3">Color Scheme</legend>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {COLOR_SCHEMES.map((scheme) => (
            <label
              key={scheme.id}
              className={`theme-choice panel cursor-pointer p-3 ${preferences.colorScheme === scheme.id ? 'theme-choice-selected' : ''}`}
            >
              <span
                className="mb-3 flex h-12 overflow-hidden rounded"
                style={{ background: scheme.mode === 'dark' ? scheme.dark : scheme.background }}
                aria-hidden="true"
              >
                <span className="w-1/3" style={{ background: `hsl(${scheme.hue} 62% 28%)` }} />
                <span className="m-2 flex-1 rounded bg-white" />
              </span>
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="colorScheme"
                  value={scheme.id}
                  checked={preferences.colorScheme === scheme.id}
                  onChange={() => {
                    preferences.setPreference('colorScheme', scheme.id);
                    if (scheme.mode) setAppearance(scheme.mode);
                  }}
                />
                <span className="text-sm font-medium">{scheme.name}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Accessibility</legend>
        <label className="field-label flex items-center justify-between gap-3">
          Higher Contrast
          <Toggle
            checked={preferences.highContrast}
            onChange={(event) => preferences.setPreference('highContrast', event.target.checked)}
          />
        </label>
        <label className="field-label flex items-center justify-between gap-3">
          Reduce Motion
          <Toggle
            checked={preferences.reduceMotion}
            onChange={(event) => preferences.setPreference('reduceMotion', event.target.checked)}
          />
        </label>
        <label className="field-label block">
          Text Size
          <Select
            aria-label="Text Size"
            value={preferences.textScale}
            onChange={(event) => preferences.setPreference('textScale', event.target.value)}
          >
            <option value="standard">Standard</option>
            <option value="large">Large</option>
            <option value="larger">Larger</option>
          </Select>
        </label>
        <p className="text-sm text-slate-500">
          Your device’s reduced-motion preference is always respected. Health and error indicators
          retain distinct colors and text labels.
        </p>
      </fieldset>
      {preferences.error && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">
          {preferences.error}
        </p>
      )}
    </section>
  );
}
