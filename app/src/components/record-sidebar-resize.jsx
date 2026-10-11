import { useContext } from 'react';
import { ActivePanelContext } from './record-tabs.jsx';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  recordSidebarSize,
  RECORD_SIDEBAR_MAX,
  RECORD_SIDEBAR_COLLAPSED,
} from '../../../shared/domain/record-sidebar-size.js';

/** Preview drags locally, then save once on release so pointer movement never queues API writes. */
export function useRecordSidebarResize({ rightCollapsed, rightPanelWidth, setPreference }) {
  const active = useContext(ActivePanelContext);
  const [preview, setPreview] = useState(null);
  const drag = useRef(null);
  const width = preview ?? (rightCollapsed ? RECORD_SIDEBAR_COLLAPSED : rightPanelWidth);
  const collapsed = width === RECORD_SIDEBAR_COLLAPSED;
  useLayoutEffect(() => {
    if (!active) return;
    document.documentElement.style.setProperty('--record-rail-width', `${width}px`);
    return () =>
      document.documentElement.style.setProperty(
        '--record-rail-width',
        `${rightCollapsed ? RECORD_SIDEBAR_COLLAPSED : rightPanelWidth}px`,
      );
  }, [width, rightCollapsed, rightPanelWidth, active]);
  function commit(next) {
    const size = recordSidebarSize(next);
    if (size !== RECORD_SIDEBAR_COLLAPSED) setPreference('rightPanelWidth', size);
    setPreference('rightCollapsed', size === RECORD_SIDEBAR_COLLAPSED);
    setPreview(null);
  }
  return {
    collapsed,
    width,
    handle: {
      role: 'separator',
      tabIndex: 0,
      'aria-label': 'Resize record information',
      'aria-orientation': 'vertical',
      'aria-valuemin': RECORD_SIDEBAR_COLLAPSED,
      'aria-valuemax': RECORD_SIDEBAR_MAX,
      'aria-valuenow': width,
      'aria-valuetext': collapsed ? 'Collapsed' : `${width} pixels wide`,
      onPointerDown(event) {
        if (event.button !== 0 || !event.isPrimary) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width, pointerId: event.pointerId, next: width };
      },
      onPointerMove(event) {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const next = recordSidebarSize(drag.current.width + drag.current.x - event.clientX);
        drag.current.next = next;
        setPreview(next);
      },
      onPointerUp(event) {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        const next = drag.current.next;
        drag.current = null;
        commit(next);
        event.currentTarget.releasePointerCapture(event.pointerId);
      },
      onPointerCancel() {
        drag.current = null;
        setPreview(null);
      },
      onLostPointerCapture() {
        drag.current = null;
        setPreview(null);
      },
      onKeyDown(event) {
        let next;
        if (event.key === 'ArrowLeft') next = collapsed ? 240 : width + (event.shiftKey ? 64 : 24);
        else if (event.key === 'ArrowRight')
          next = width <= 240 ? RECORD_SIDEBAR_COLLAPSED : width - (event.shiftKey ? 64 : 24);
        else if (event.key === 'Home') next = RECORD_SIDEBAR_COLLAPSED;
        else if (event.key === 'End') next = RECORD_SIDEBAR_MAX;
        else if (event.key === 'Escape' && drag.current) {
          drag.current = null;
          setPreview(null);
          event.preventDefault();
          return;
        } else return;
        event.preventDefault();
        commit(next);
      },
    },
  };
}
