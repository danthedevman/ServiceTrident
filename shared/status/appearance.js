import { InputError } from '../validation/input-error.js';

/** Status pages use only administrator-selected fixed appearance modes. */
export function statusTheme(value) {
  if (!['light', 'dark'].includes(value))
    throw new InputError('Choose Light or Dark.', 400, { statusTheme: 'Choose Light or Dark.' });
  return value;
}
