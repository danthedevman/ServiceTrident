/** Apply the saved appearance before the page paints; storage may be disabled. */
(() => {
  if (window.location.pathname.startsWith('/status/public/')) {
    // The public appearance comes from the server, never the signed-in profile.
    document.documentElement.style.visibility = 'hidden';
    const token = window.location.pathname.match(/^\/status\/public\/([a-f\d]{48})\/?$/)?.[1];
    if (token) {
      // Parser-inserted CSS blocks the first paint until the saved public canvas is known.
      document.write(`<link rel="stylesheet" href="/api/public/status/${token}/appearance.css">`);
    }
    return;
  }
  let theme;
  try {
    theme = localStorage.getItem('servicetrident-theme');
  } catch {
    /* Use the default black appearance. */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#000000' : '#ffffff';
  document.documentElement.style.colorScheme = theme;
})();
