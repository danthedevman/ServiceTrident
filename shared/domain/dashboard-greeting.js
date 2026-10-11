/** Plain-text substitution never interprets a greeting as markup. */
export function dashboardGreeting(template, displayName) {
  const firstName =
    String(displayName ?? '')
      .trim()
      .split(/\s+/)[0] || 'there';
  return template.replaceAll('{firstName}', firstName);
}
