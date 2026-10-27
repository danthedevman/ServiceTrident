/** Stable opaque layout tokens; never store record URLs, titles, contents or drafts as preferences.
 * These fingerprints are ordering keys only, not authorization or cryptographic identifiers. */
export function recordTabToken(key) {
  return [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => {
      let hash = seed;
      for (let index = 0; index < key.length; index++)
        hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
      return (hash >>> 0).toString(16).padStart(8, '0');
    })
    .join('');
}
/** Unknown/new records append in opening order; sorting never mutates the chronology or tab objects. */
export function orderedRecordTabs(tabs, order = []) {
  const ranks = new Map(order.map((token, index) => [token, index]));
  return [...tabs].sort(
    (a, b) =>
      (ranks.get(recordTabToken(a.key)) ?? ranks.size) -
      (ranks.get(recordTabToken(b.key)) ?? ranks.size),
  );
}
export function moveRecordTab(tabs, from, to) {
  const start = tabs.findIndex((tab) => tab.key === from),
    end = tabs.findIndex((tab) => tab.key === to);
  if (start < 0 || end < 0 || start === end) return tabs;
  const next = [...tabs];
  next.splice(end, 0, next.splice(start, 1)[0]);
  return next;
}
