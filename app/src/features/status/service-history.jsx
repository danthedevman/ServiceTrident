import { serviceDays } from './service-days.js';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/** Accessible daily status blocks with tooltips anchored above the hovered or focused block. */
export function ServiceHistory({
  service,
  services,
  monitors,
  generatedAt,
  days: range = 30,
  endDate,
  timeZone = 'UTC',
}) {
  const [tooltip, setTooltip] = useState(null);
  useEffect(() => {
    if (!tooltip) return;
    const dismiss = () => setTooltip(null);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [!!tooltip]);
  const days = useMemo(
    () =>
      serviceDays(
        service,
        services,
        monitors,
        endDate || generatedAt,
        range,
        generatedAt,
        timeZone,
      ),
    [service, services, monitors, endDate, generatedAt, range, timeZone],
  );
  const show = (event, label) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(280, window.innerWidth - 16);
    setTooltip({
      label,
      width,
      left: Math.max(
        8,
        Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8),
      ),
      top: rect.top - 8,
    });
  };
  const colors = {
    up: 'bg-emerald-500 dark:bg-emerald-400',
    down: 'bg-rose-500 dark:bg-rose-400',
    degraded: 'bg-amber-500 dark:bg-amber-400',
    unknown: 'bg-slate-200 dark:bg-slate-700',
  };
  return (
    <div className="w-full" onMouseLeave={() => setTooltip(null)}>
      <div
        className={
          range > 31 ? 'grid grid-cols-[repeat(31,minmax(0,1fr))] gap-1' : 'flex gap-0.5 sm:gap-1'
        }
        aria-label={`${service.name}: ${days[0]?.day} through ${days.at(-1)?.day}`}
      >
        {days.map(({ day, status, label }) => (
          <button
            key={day}
            type="button"
            aria-label={label}
            className={`h-8 min-w-0 flex-1 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${colors[status]}`}
            onMouseEnter={(event) => show(event, label)}
            onFocus={(event) => show(event, label)}
            onBlur={() => setTooltip(null)}
            onClick={(event) => show(event, label)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setTooltip(null);
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{days[0]?.day}</span>
        <span>{days.at(-1)?.day}</span>
      </div>
      {tooltip &&
        createPortal(
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 rounded-md bg-slate-950 px-3 py-2 text-center text-xs text-white shadow-lg"
            style={{
              width: tooltip.width,
              left: tooltip.left,
              top: tooltip.top,
              transform: 'translateY(-100%)',
            }}
          >
            {tooltip.label}
          </div>,
          document.body,
        )}
    </div>
  );
}
