// Static example tooltips use native popovers for Escape and outside-click dismissal.
const statusButtons = document.querySelectorAll('[data-status-ping]');
let activeStatus;
let closeTimer;

function closeStatus() {
  clearTimeout(closeTimer);
  if (!activeStatus) return;
  activeStatus.popup.hidePopover();
  activeStatus = undefined;
}

function showStatus(button, popup) {
  clearTimeout(closeTimer);
  if (activeStatus?.popup !== popup) closeStatus();
  popup.showPopover();
  activeStatus = { button, popup };
  const target = button.getBoundingClientRect();
  const bounds = popup.getBoundingClientRect();
  popup.style.left = `${Math.max(12, Math.min(innerWidth - bounds.width - 12, target.left + target.width / 2 - bounds.width / 2))}px`;
  popup.style.top = `${target.top - bounds.height - 10 >= 12 ? target.top - bounds.height - 10 : target.bottom + 10}px`;
}

function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (
      activeStatus &&
      document.activeElement !== activeStatus.button &&
      !activeStatus.button.matches(':hover') &&
      !activeStatus.popup.matches(':hover')
    )
      closeStatus();
  }, 120);
}

if ('showPopover' in HTMLElement.prototype) {
  for (const button of statusButtons) {
    const popup = document.getElementById(button.getAttribute('popovertarget'));
    if (!popup) continue;
    // Keep the native title as the fallback when scripting/popovers are unavailable.
    button.removeAttribute('title');
    button.addEventListener('pointerenter', () => showStatus(button, popup));
    button.addEventListener('pointerleave', scheduleClose);
    button.addEventListener('focus', () => showStatus(button, popup));
    button.addEventListener('blur', scheduleClose);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      showStatus(button, popup);
    });
    popup.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    popup.addEventListener('pointerleave', scheduleClose);
    popup.addEventListener('toggle', () => {
      if (!popup.matches(':popover-open') && activeStatus?.popup === popup) {
        activeStatus = undefined;
      }
    });
  }
  addEventListener('resize', closeStatus);
  addEventListener('scroll', closeStatus, { passive: true });
}
