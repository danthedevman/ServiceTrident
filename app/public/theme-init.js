/** Apply the saved appearance before the page paints; storage may be disabled. */
(() => {
  if (window.location.pathname.startsWith('/status/public/')) {
    document.documentElement.dataset.theme = 'light';
    document.documentElement.style.backgroundColor = '#f7f9fa';
    document.documentElement.style.colorScheme = 'light';
    return;
  }
  let theme;
  try {
    theme = localStorage.getItem('servicetrident-theme');
  } catch {
    /* Use device preference. */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#020617' : '#f7f9fa';
  document.documentElement.style.colorScheme = theme;
})();
