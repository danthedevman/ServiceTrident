import { useLocation, useNavigate } from 'react-router-dom';
import { useResource } from '../data/use-resource.js';
import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';

export const ActivePanelContext = createContext(true);

export const RelatedCountsContext = createContext(null);

export const RelatedListContext = createContext(false);

/** Record sections default to Details and preserve mounted drafts while hiding inactive panels.
 * Standalone related lists retain their shared grid footprint; URL relationship links remain addressable. */
export function RecordTabs({
  tabs: relatedTabs,
  details,
  detailsLabel = 'Details',
  label = 'Related information',
  lazy = false,
  related = false,
  selectedId,
  onSelect,
}) {
  const record = details !== undefined;
  const tabs = record
    ? [{ id: 'details', label: detailsLabel, content: details }, ...relatedTabs]
    : relatedTabs;
  const location = useLocation(),
    navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const relatedFromUrl = related || record ? params.get('related') : null;
  const scope = useContext(RelatedCountsContext);
  const counts = useResource(
    (related || record) && relatedTabs.length > 0 && scope
      ? `/related-counts/${scope.kind}/${scope.id}`
      : null,
    60000,
  );
  const parentActive = useContext(ActivePanelContext);
  const relatedSection = useRef(null);
  const [selected, setSelected] = useState(selectedId ?? tabs[0]?.id),
    prefix = useId();
  const [visited, setVisited] = useState(() => new Set([selectedId ?? tabs[0]?.id]));
  const select = (id) => {
    if (relatedFromUrl) {
      params.delete('related');
      navigate(
        {
          pathname: location.pathname,
          search: params.size ? `?${params}` : '',
          hash: location.hash,
        },
        { replace: true },
      );
    }
    setSelected(id);
    onSelect?.(id);
    setVisited((current) => new Set([...current, id]));
  };
  const requested =
    selectedId ?? (tabs.some((tab) => tab.id === relatedFromUrl) ? relatedFromUrl : selected);
  const active = tabs.some((tab) => tab.id === requested) ? requested : tabs[0]?.id;
  useEffect(() => {
    if (!related || !relatedFromUrl || active !== relatedFromUrl || !parentActive) return;
    const frame = requestAnimationFrame(() =>
      relatedSection.current?.scrollIntoView({ block: 'start', behavior: 'instant' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [related, relatedFromUrl, active, parentActive]);
  return (
    <section
      ref={relatedSection}
      className={
        record
          ? 'record-tabs related-lists record-content-tabs'
          : related
            ? 'record-tabs related-lists'
            : 'record-tabs space-y-5'
      }
    >
      <div
        role="tablist"
        aria-label={record ? 'Record sections' : label}
        className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2 dark:border-slate-700"
      >
        {tabs.map((tab, index) => (
          <button
            type="button"
            key={tab.id}
            id={`${prefix}-${tab.id}`}
            role="tab"
            title={typeof tab.label === 'string' ? tab.label : undefined}
            aria-selected={tab.id === active}
            aria-controls={`${prefix}-${tab.id}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            className={
              related || record
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
            {(related || record) &&
              tab.id !== 'details' &&
              Number.isSafeInteger(tab.count ?? counts.data?.counts?.[tab.id]) &&
              (tab.count ?? counts.data?.counts?.[tab.id]) > 0 && (
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
      <div className={related && !record ? 'related-list-panels' : undefined}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`${prefix}-${tab.id}-panel`}
            aria-labelledby={`${prefix}-${tab.id}`}
            hidden={(record || !related) && tab.id !== active}
            className={record ? 'record-content-panel' : related ? 'related-list-panel' : undefined}
            data-active={tab.id === active}
            inert={tab.id !== active}
            aria-hidden={tab.id !== active}
            tabIndex={0}
          >
            <ActivePanelContext.Provider value={parentActive && tab.id === active}>
              <RelatedListContext.Provider value={(related || record) && tab.id !== 'details'}>
                {((!lazy && !record) ||
                  tab.id === 'details' ||
                  tab.id === active ||
                  visited.has(tab.id)) &&
                  tab.content}
              </RelatedListContext.Provider>
            </ActivePanelContext.Provider>
          </div>
        ))}
      </div>
    </section>
  );
}
