/** Origin is immutable server-owned metadata, independent of actor attribution. */
export const INCIDENT_SOURCES = {
  manual: 'Manual',
  monitor: 'Monitor',
  integration: 'Integration',
  automation: 'Automation',
  ai: 'AI Assistant',
  unknown: 'Unknown',
};
export const incidentSourceLabel = (source) =>
  typeof source === 'string' && Object.hasOwn(INCIDENT_SOURCES, source)
    ? INCIDENT_SOURCES[source]
    : 'Unknown';
