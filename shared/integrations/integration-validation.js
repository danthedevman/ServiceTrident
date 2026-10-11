import { integrationUrl } from './provider-url.js';
import { providers } from './providers.js';
import { providerFields } from './provider-fields.js';

/** Browser/server field validation for UI-managed communication settings; stored secrets may be retained. */
export function integrationErrors(value, { configured = false, smtpConfigured = false } = {}) {
  const errors = {};
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { name: 'Enter integration settings.' };
  for (const key of [
    'smtpHost',
    'smtpFrom',
    'smtpUser',
    'smtpPassword',
    'url',
    'username',
    'password',
    'clientId',
    'clientSecret',
    'scope',
  ])
    if (value[key] !== undefined && typeof value[key] !== 'string')
      errors[key] = 'Enter a text value.';
  if (Object.keys(errors).length) return errors;
  if (value.commentNotifications !== undefined && typeof value.commentNotifications !== 'boolean')
    errors.commentNotifications = 'Choose whether comment notifications are enabled.';
  const required = (key, label, max) => {
    if (typeof value[key] !== 'string' || !value[key].trim()) errors[key] = `${label} is required.`;
    else if (value[key].length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
  };
  required('name', 'Name', 80);
  if (!providers.some((provider) => provider.id === value.type))
    errors.type = 'Choose a supported app.';
  for (const key of ['enabled', 'recovery', 'onCall'])
    if (typeof value[key] !== 'boolean') errors[key] = 'Choose whether this option is enabled.';
  if (value.type === 'email') {
    required('recipients', 'Fallback recipients', 2500);
    const addresses =
      typeof value.recipients === 'string'
        ? value.recipients
            .split(',')
            .map((text) => text.trim())
            .filter(Boolean)
        : [];
    if (
      addresses.length > 10 ||
      addresses.some((email) => !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email))
    )
      errors.recipients = 'Enter up to 10 valid comma-separated email addresses.';
    if (
      !smtpConfigured ||
      value.smtpHost ||
      value.smtpFrom ||
      value.smtpUser ||
      value.smtpPassword
    ) {
      required('smtpHost', 'SMTP server', 253);
      required('smtpFrom', 'Sender email', 254);
      if (
        value.smtpHost &&
        (!/^[a-z0-9.-]+$/i.test(value.smtpHost) ||
          value.smtpHost.startsWith('.') ||
          value.smtpHost.endsWith('.') ||
          !value.smtpHost.includes('.'))
      )
        errors.smtpHost = 'Enter a public SMTP hostname, such as smtp.example.com.';
      if (![465, 587].includes(Number(value.smtpPort)))
        errors.smtpPort = 'Choose port 465 (TLS) or 587 (STARTTLS).';
      if (value.smtpFrom && !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(value.smtpFrom))
        errors.smtpFrom = 'Enter a valid sender email address.';
      if (value.smtpUser && !value.smtpPassword && !smtpConfigured)
        errors.smtpPassword = 'SMTP password is required when a username is supplied.';
      if (value.smtpUser?.length > 200)
        errors.smtpUser = 'SMTP username must be 200 characters or fewer.';
      if (value.smtpPassword?.length > 1000)
        errors.smtpPassword = 'SMTP password must be 1,000 characters or fewer.';
    }
  } else if (providers.some((provider) => provider.id === value.type)) {
    if (!configured || value.url) {
      try {
        integrationUrl(value.url, value.type);
      } catch {
        errors.url = 'Enter a valid public HTTPS endpoint for this provider.';
      }
    }
    if (value.type === 'servicenow' && !['basic', 'oauth'].includes(value.authType || 'basic'))
      errors.authType = 'Choose Basic Auth or OAuth.';
    const fields =
      value.type === 'servicenow'
        ? value.authType === 'oauth'
          ? [
              { key: 'clientId', label: 'Client ID', max: 512 },
              { key: 'clientSecret', label: 'Client Secret', max: 4096 },
              { key: 'scope', label: 'OAuth Scope', max: 1000, optional: true },
            ]
          : [
              { key: 'username', label: 'Integration username', max: 200 },
              { key: 'password', label: 'Integration password', max: 1000 },
            ]
        : providerFields[value.type] || [];
    for (const field of fields) {
      const input = value[field.key];
      if ((!configured && !field.optional) || input) required(field.key, field.label, field.max);
      if (input !== undefined && typeof input !== 'string')
        errors[field.key] = 'Enter a text value.';
      if (
        input &&
        (/[\r\n]/.test(input) || (field.pattern && !new RegExp(field.pattern).test(input)))
      )
        errors[field.key] = `Enter a valid ${field.label.toLowerCase()}.`;
    }
  }
  return errors;
}
