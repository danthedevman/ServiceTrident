import React, { createContext, useContext } from 'react';

export const BreadcrumbTitleContext = createContext(false);

/** Omit duplicate titles from the DOM so parent spacing only measures visible content. */
export function PageTitle(props) {
  const breadcrumbTitle = useContext(BreadcrumbTitleContext);
  return breadcrumbTitle ? null : <h1 {...props} className="page-title" />;
}
