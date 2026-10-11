import { PageTitle } from '../page-title.jsx';
import React, { useContext } from 'react';
import { RecordActionContext } from '../record-actions.jsx';

/** Dedicated form surface shared by routed configuration and record editors. */
export function FormPage({ title, children }) {
  const record = useContext(RecordActionContext);
  return (
    <div className="form-page">
      {!record && <PageTitle>{title}</PageTitle>}
      <section className="record-details space-y-6">{children}</section>
    </div>
  );
}
