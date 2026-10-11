import { InputError } from '../validation/input-error.js';

/** Only a six-digit color is persisted; empty restores the default background. */
export function statusBackground(value) {
  if (value === '' || value === null) return null;
  if (typeof value !== 'string' || !/^#[a-f0-9]{6}$/i.test(value))
    throw new InputError('Choose a six-digit background color.', 400, {
      backgroundColor: 'Use a color such as #f4f7fb.',
    });
  return value.toLowerCase();
}
/** Pick the higher-contrast text color for a user-selected background. */
export function backgroundInk(value) {
  if (!value) return undefined;
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(value.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}
