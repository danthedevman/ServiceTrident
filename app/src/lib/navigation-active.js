/** A legacy event URL is nested under a monitor, but still belongs to Events navigation. */
export function navigationActive(to, pathname) {
  const route = /^\/monitors\/[^/]+\/events\/[^/]+(?:\/|$)/.test(pathname) ? '/events' : pathname;
  if (to === '/projects') return route === '/projects' || /^\/projects\/[a-f\d]{24}$/.test(route);
  if (to === '/projects/milestones' && route.startsWith('/project-milestones/')) return true;
  return to === '/'
    ? route === '/' || route === '/dashboard'
    : route === to || route.startsWith(`${to}/`);
}
