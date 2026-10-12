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
    /* Use the default black appearance. */
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = 'dark';
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.backgroundColor = theme === 'dark' ? '#000000' : '#ffffff';
  document.documentElement.style.colorScheme = theme;
})();
