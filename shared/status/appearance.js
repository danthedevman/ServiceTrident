import { InputError } from '../validation/input-error.js';

/** Status pages use only administrator-selected fixed appearance modes. */
export function statusTheme(value) {
  if (!['light', 'dark'].includes(value))
    throw new InputError('Choose Light or Dark.', 400, { statusTheme: 'Choose Light or Dark.' });
  return value;
}

/** Only fixed appearance values reach public CSS; never interpolate catalog content. */
export function publicAppearanceCss(value) {
  const appearance = value === 'dark' ? 'dark' : 'light';
  const background = appearance === 'dark' ? '#000000' : '#ffffff';
  return `html:not([data-public-status-ready]),html:not([data-public-status-ready]) body{background-color:${background}!important;color-scheme:${appearance}}`;
}
