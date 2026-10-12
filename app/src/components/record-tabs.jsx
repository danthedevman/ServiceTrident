import { useResource } from '../data/use-resource.js';
import React, { createContext, useContext, useId, useState } from 'react';

export const ActivePanelContext = createContext(true);

export const RelatedCountsContext = createContext(null);

export const RelatedListContext = createContext(false);

/** Related panels share a grid footprint to avoid scroll jumps while retaining visited data.
 * Accessible related-record tabs keep one section visible without duplicating page-length content. Optional lazy mounting retains visited panels and their state. */
export function RecordTabs({
  tabs,
  label = 'Related information',
  lazy = false,
  related = false,
  selectedId,
  onSelect,
}) {
  const scope = useContext(RelatedCountsContext);
  const counts = useResource(
    related && scope ? `/related-counts/${scope.kind}/${scope.id}` : null,
    60000,
  );
  const parentActive = useContext(ActivePanelContext);
  const [selected, setSelected] = useState(selectedId ?? tabs[0]?.id),
    prefix = useId();
  const [visited, setVisited] = useState(() => new Set([selectedId ?? tabs[0]?.id]));
  const select = (id) => {
    setSelected(id);
    onSelect?.(id);
    setVisited((current) => new Set([...current, id]));
  };
  const requested = selectedId ?? selected;
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id;
  return (
    <section className={related ? 'record-tabs related-lists' : 'record-tabs space-y-5'}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-700"
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            key={tab.id}
            id={`${prefix}-${tab.id}`}
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`${prefix}-${tab.id}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            className={
              related
                ? 'related-list-tab'
                : `nav-link shrink-0 ${tab.id === active ? 'active' : ''}`
            }
            onClick={() => select(tab.id)}
            onKeyDown={(event) => {
              let next;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              select(tabs[next].id);
              document.getElementById(`${prefix}-${tabs[next].id}`)?.focus({ preventScroll: true });
            }}
          >
            {tab.label}
            {related && Number.isSafeInteger(tab.count ?? counts.data?.counts?.[tab.id]) && (
              <span
                aria-hidden="true"
                className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums dark:bg-slate-800"
              >
                {tab.count ?? counts.data.counts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className={related ? 'related-list-panels' : undefined}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${prefix}-${tab.id}-panel`}
            aria-labelledby={`${prefix}-${tab.id}`}
            hidden={!related && tab.id !== active}
            className={related ? 'related-list-panel' : undefined}
            data-active={tab.id === active}
            inert={tab.id !== active}
            aria-hidden={tab.id !== active}
            tabIndex={0}
          >
            <ActivePanelContext.Provider value={parentActive && tab.id === active}>
              <RelatedListContext.Provider value={related}>
                {(!lazy || tab.id === active || visited.has(tab.id)) && tab.content}
              </RelatedListContext.Provider>
            </ActivePanelContext.Provider>
          </div>
        ))}
      </div>
    </section>
  );
}
