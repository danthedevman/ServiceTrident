/* eslint-disable no-control-regex -- Explicitly reject unsafe control bytes at input boundaries. */
/** Return all field errors together, shared by browser forms and server validation.
 * @param {'auth'|'register'|'profile'|'monitor'|'monitor-create'|'services'|'collections'|'status'} kind
 * @param {object} input @returns {Record<string, string>}
 */
export function fieldErrors(kind, input = {}) {
  const errors = {};
  const creatingMonitor = kind === 'monitor-create';
  if (creatingMonitor) kind = 'monitor';
  /** Validate trimmed text without silently accepting empty names. */
  function text(name, label, max, required = false) {
    const value = input[name];
    if (required && (typeof value !== 'string' || !value.trim()))
      errors[name] = `${label} is required.`;
    else if (
      typeof value === 'string' &&
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    )
      errors[name] = `${label} contains unsupported control characters.`;
    else if (value !== undefined && (typeof value !== 'string' || value.trim().length > max))
      errors[name] = `${label} must be ${max} characters or fewer.`;
  }
  if (kind === 'auth' || kind === 'register') {
    if (typeof input.email !== 'string' || !input.email.trim())
      errors.email = 'Email address is required.';
    else if (
      input.email.trim().length > 254 ||
      /[\u0000-\u001f\u007f]/.test(input.email) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())
    )
      errors.email = 'Enter a valid email address, such as you@example.com.';
    if (typeof input.password !== 'string' || !input.password)
      errors.password = 'Password is required.';
    else if (input.password.length < 12 || input.password.length > 128)
      errors.password = 'Password must contain 12 to 128 characters.';
  }
  if (kind === 'register') text('displayName', 'Name', 80, true);
  if (kind === 'profile') {
    const accountErrors = fieldErrors('auth', {
      email: input.email,
      password: input.currentPassword,
    });
    if (accountErrors.email) errors.email = accountErrors.email;
    if (accountErrors.password)
      errors.currentPassword = 'Enter your current password (12–128 characters).';
    text('displayName', 'Name', 80, true);
    if (
      input.newPassword !== undefined &&
      input.newPassword !== '' &&
      (typeof input.newPassword !== 'string' ||
        input.newPassword.length < 12 ||
        input.newPassword.length > 128)
    )
      errors.newPassword = 'New password must contain 12 to 128 characters.';
  }
  if (['monitor', 'services', 'collections'].includes(kind))
    text(
      'name',
      kind === 'monitor'
        ? 'Monitor name'
        : kind === 'services'
          ? 'Service name'
          : 'Collection name',
      80,
      true,
    );
  if (kind === 'monitor') {
    if (creatingMonitor && (typeof input.serviceId !== 'string' || !input.serviceId.trim()))
      errors.serviceId = 'Service is required.';
    if (typeof input.url !== 'string' || !input.url.trim())
      errors.url = 'Endpoint URL is required.';
    else if (input.url.length > 2048)
      errors.url = 'Endpoint URL must be 2,048 characters or fewer.';
    else {
      try {
        const url = new URL(input.url);
        if (!['http:', 'https:'].includes(url.protocol))
          errors.url = 'Use a complete http:// or https:// URL.';
        else if (url.username || url.password)
          errors.url = 'Remove usernames and passwords from the URL.';
        else if (url.port) errors.url = 'Use the standard HTTP (80) or HTTPS (443) port.';
        else if (!url.hostname.includes('.') && !url.hostname.startsWith('['))
          errors.url = 'Use a public endpoint hostname.';
      } catch {
        errors.url = 'Enter a complete URL, such as https://example.com.';
      }
    }
    if (
      typeof input.intervalMinutes !== 'number' ||
      !Number.isInteger(input.intervalMinutes) ||
      input.intervalMinutes < 1 ||
      input.intervalMinutes > 1440
    )
      errors.intervalMinutes =
        input.intervalUnit === 'hours'
          ? 'Use 1 minute to 24 hours in whole-minute increments, such as 1.5 hours.'
          : 'Check interval must be a whole number from 1 to 1,440 minutes.';
    if (!['GET', 'HEAD'].includes(input.method === undefined ? 'GET' : input.method))
      errors.method = 'Choose GET or HEAD.';
    if (typeof (input.followRedirects ?? false) !== 'boolean' || input.followRedirects === null)
      errors.followRedirects = 'Choose whether redirects are enabled or disabled.';
    text('component', 'Component name', 80);
    if (input.component && !input.serviceId)
      errors.component = 'Choose a service before assigning a component.';
  }
  if (kind === 'services') {
    text('description', 'Description', 1000);
  }
  for (const name of kind === 'services'
    ? ['dependencyIds', 'collectionIds', 'componentIds']
    : kind === 'collections'
      ? ['serviceIds']
      : []) {
    const values = input[name];
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.length > 50 ||
        values.some((value) => typeof value !== 'string') ||
        new Set(values).size !== values.length)
    )
      errors[name] = 'Choose up to 50 distinct items from the available options.';
  }
  if (kind === 'status' && !['private', 'public'].includes(input.visibility))
    errors.visibility = 'Choose Private or Public.';
  return errors;
}

/** Validate optional UTC date filters without silently rolling impossible dates forward. */
export function dateRangeErrors(from, to) {
  const errors = {};
  for (const [field, value] of Object.entries({ from, to })) {
    if (!value) continue;
    const date = new Date(`${value}T00:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      errors[field] = 'Enter a valid calendar date in YYYY-MM-DD format.';
  }
  if (!Object.keys(errors).length && from && to && from > to)
    errors.to = 'Through date must be on or after the From date.';
  return errors;
}

/** Basic input rules shared by form controls, independent of browser validation bubbles. */
export function controlError({
  label = 'This field',
  value = '',
  type = 'text',
  required = false,
  checked = false,
  maxLength = -1,
}) {
  const text = String(value).trim();
  if (required && (type === 'checkbox' ? !checked : !text)) return `${label} is required.`;
  if (!text || ['checkbox', 'radio'].includes(type)) return '';
  if (type !== 'password' && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(String(value)))
    return `${label} contains unsupported control characters.`;
  if (
    type === 'email' &&
    (text.length > 254 ||
      /[\u0000-\u001f\u007f]/.test(text) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
  )
    return 'Enter a valid email address, such as you@example.com.';
  if (type === 'url') {
    try {
      const url = new URL(text);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    } catch {
      return 'Enter a complete URL, such as https://example.com.';
    }
  }
  if (maxLength >= 0 && String(value).length > maxLength)
    return `${label} must be ${maxLength} characters or fewer.`;
  return '';
}
