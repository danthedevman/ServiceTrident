import React, { createContext, useContext } from 'react';
import { RecordHeader, RecordHeaderContext } from './record-actions.jsx';
import { ActivePanelContext } from './record-tabs.jsx';

export const BreadcrumbTitleContext = createContext(false);

/** Omit duplicate titles from the DOM so parent spacing only measures visible content. */
export function PageTitle(props) {
  const breadcrumbTitle = useContext(BreadcrumbTitleContext);
  return breadcrumbTitle ? null : <h1 {...props} className="page-title" />;
}

/** Portaled actions and breadcrumb titles must not leave an empty spacing row. */
export function PageTitleRow({ title, actions }) {
  const breadcrumbTitle = useContext(BreadcrumbTitleContext);
  const headerTarget = useContext(RecordHeaderContext);
  const active = useContext(ActivePanelContext);
  const controls = actions ? <RecordHeader>{actions}</RecordHeader> : null;
  if (breadcrumbTitle && (!actions || headerTarget || !active)) return controls;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {!breadcrumbTitle && <PageTitle>{title}</PageTitle>}
      {controls}
    </div>
  );
}
