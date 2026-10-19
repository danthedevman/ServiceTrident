import { InputError } from '../validation/input-error.js';
const recordPath =
  /^\/(?:incidents|tasks|knowledge|rcas|services|collections|groups|workspace|integrations|monitors|events|alerts|on-call|projects|project-milestones)\/[a-f\d]{24}$/i;
export const PIN_SCOPE_KEYS = [
  'recordId',
  'recordKind',
  'monitorId',
  'eventId',
  'headerSet',
  'projectId',
];
export function pinPath(path) {
  if (typeof path !== 'string' || path.length > 700 || path.includes('#') || path.includes('\\'))
    return false;
  const [pathname, query, ...extra] = path.split('?');
  if (extra.length) return false;
  const scoped =
    /^\/records\/(?:audit|activity|comments|deliveries|invitations|inquiries|attachments|headers|demo|project-activity)\/[a-z\d_%.-]{1,120}$/i.test(
      pathname,
    );
  if (!(
    recordPath.test(pathname) ||
    /^\/knowledge\/bases\/[a-f\d]{24}$/i.test(pathname) ||
    /^\/settings\/service-accounts\/[a-f\d]{24}$/i.test(pathname) ||
    /^\/monitors\/[a-f\d]{24}\/events\/[a-f\d]{24}$/i.test(pathname) ||
    scoped
  ))
    return false;
  if (!query) return true;
  if (!scoped) return false;
  const params = new URLSearchParams(query);
  const keys = [...params.keys()];
  return (
    keys.length <= PIN_SCOPE_KEYS.length &&
    new Set(keys).size === keys.length &&
    [...params].every(
      ([key, value]) => PIN_SCOPE_KEYS.includes(key) && /^[a-z\d_-]{1,40}$/i.test(value),
    )
  );
}
export const emptyPins = () => ({ groups: [{ id: 'general', name: 'General' }], items: [] });
export function validatePins(body) {
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !['revision', 'groups', 'items'].includes(key)) ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 0
  )
    throw new InputError('Send a valid pinned collection revision.');
  const { groups, items } = body;
  const label = (s, max) =>
    typeof s === 'string' &&
    s.trim().length > 0 &&
    s.length <= max &&
    Array.from(s).every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127);
  if (
    !Array.isArray(groups) ||
    groups.length < 1 ||
    groups.length > 20 ||
    groups.some(
      (g) =>
        !g ||
        typeof g !== 'object' ||
        Object.keys(g).some((k) => !['id', 'name'].includes(k)) ||
        typeof g.id !== 'string' ||
        !/^[-a-z0-9]{1,40}$/i.test(g.id) ||
        !label(g.name, 80),
    ) ||
    new Set(groups.map((g) => g.id)).size !== groups.length
  )
    throw new InputError('Use 1–20 named pin groups.');
  if (
    !Array.isArray(items) ||
    items.length > 200 ||
    items.some(
      (p) =>
        !p ||
        typeof p !== 'object' ||
        Object.keys(p).some(
          (k) => !['path', 'label', 'groupId', 'number', 'context'].includes(k),
        ) ||
        !pinPath(p.path) ||
        !label(p.label, 160) ||
        (p.number !== undefined &&
          (typeof p.number !== 'string' || !/^[A-Z]{1,12}\d{7,16}$/.test(p.number))) ||
        (p.context !== undefined && !label(p.context, 160)) ||
        !groups.some((g) => g.id === p.groupId),
    ) ||
    new Set(items.map((p) => p.path)).size !== items.length
  )
    throw new InputError('Pin up to 200 distinct record links in available groups.');
  return {
    groups: groups.map((g) => ({ id: g.id, name: g.name.trim() })),
    items: items.map((p) => ({
      path: p.path,
      label: p.label.trim(),
      groupId: p.groupId,
      ...(p.number ? { number: p.number } : {}),
      ...(p.context ? { context: p.context.trim() } : {}),
    })),
  };
}
