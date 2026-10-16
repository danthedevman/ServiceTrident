import { validListFilters } from './list-filters.js';
import { colorSchemeIds } from './color-schemes.js';
import { InputError } from '../validation/input-error.js';

export const DEFAULT_UI_PREFERENCES = Object.freeze({
  leftCollapsed: false,
  rightCollapsed: false,
  rightPanelWidth: 320,
  filtersOpen: false,
  compactTables: false,
  tableLayouts: {},
  listFilters: {},
  dashboardTab: 'overview',
  dashboardGreeting: 'Welcome, {firstName}',
  colorScheme: 'black',
  highContrast: false,
  reduceMotion: false,
  textScale: 'standard',
  timeFormat: 'locale',
  dateFormat: 'locale',
  aiChat: true,
  aiSummaries: true,
  aiDrafting: true,
  aiKnowledgeAnswers: true,
});

/** Store only bounded column identifiers, never row data or arbitrary user properties. */
function validTableLayouts(value) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([key, layout]) =>
        /^[a-zA-Z0-9/_:-]{1,200}$/.test(key) &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        layout &&
        typeof layout === 'object' &&
        !Array.isArray(layout) &&
        Object.keys(layout).length === 2 &&
        ['order', 'hidden'].every(
          (property) =>
            Array.isArray(layout[property]) &&
            layout[property].length <= 100 &&
            new Set(layout[property]).size === layout[property].length &&
            layout[property].every(
              (column) => typeof column === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(column),
            ),
        ),
    )
  );
}

/** Validate the small allowlist of supported preference values. */
function validPreference(key, value) {
  if (key === 'rightPanelWidth') return Number.isInteger(value) && value >= 240 && value <= 560;
  if (key === 'dashboardGreeting')
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= 120 &&
      Array.from(value).every(
        (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
      )
    );
  if (key === 'timeFormat') return ['locale', '12', '24'].includes(value);
  if (key === 'dateFormat') return ['locale', 'iso', 'dmy', 'mdy', 'long'].includes(value);
  if (key === 'colorScheme') return colorSchemeIds.includes(value);
  if (key === 'textScale') return ['standard', 'large', 'larger'].includes(value);
  if (key === 'listFilters') return validListFilters(value);
  if (key === 'tableLayouts') return validTableLayouts(value);
  if (key === 'dashboardTab')
    return ['overview', 'incidents', 'tasks', 'services', 'events'].includes(value);
  return typeof value === 'boolean';
}

/** Normalize validated account preferences; shared first-paint caches must omit list filters. */
export function uiPreferences(value) {
  return Object.fromEntries(
    Object.entries(DEFAULT_UI_PREFERENCES).map(([key, fallback]) => [
      key,
      validPreference(key, value?.[key]) ? value[key] : fallback,
    ]),
  );
}

/** Validate partial updates without allowing arbitrary user-document fields. */
export function preferencePatch(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Object.keys(value).length ||
    Object.entries(value).some(
      ([key, entry]) => !Object.hasOwn(DEFAULT_UI_PREFERENCES, key) || !validPreference(key, entry),
    )
  ) {
    throw new InputError('Choose a valid layout preference.');
  }
  return value;
}
