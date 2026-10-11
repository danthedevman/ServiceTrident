import { ActivePanelContext } from './record-tabs.jsx';
import React, { createContext, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const RecordRailContext = createContext(null);

export const RecordHeaderContext = createContext(null);

/** Render record controls inside the shell’s shared sticky breadcrumb header. */
export function RecordHeader({ children }) {
  const target = useContext(RecordHeaderContext);
  const active = useContext(ActivePanelContext);
  if (!active) return null;
  return target ? createPortal(children, target) : children;
}

export const RecordActionContext = createContext(null);

/** Move existing form actions into the record toolbar while preserving native form submission. */
export function RecordActions({ children }) {
  const active = useContext(ActivePanelContext);
  const recordToolbar = useContext(RecordActionContext);
  const pageToolbar = useContext(RecordHeaderContext);
  const toolbar = recordToolbar ?? pageToolbar;
  const anchor = useRef(null);
  const generatedId = useId();
  const [formId, setFormId] = useState(null);
  useLayoutEffect(() => {
    const form = anchor.current?.closest('form');
    if (!form) return;
    if (!form.id) form.id = generatedId;
    setFormId(form.id);
  }, [generatedId]);
  const associate = (nodes) =>
    React.Children.map(nodes, (child) => {
      if (!React.isValidElement(child)) return child;
      if (child.type === React.Fragment)
        return React.cloneElement(child, {}, associate(child.props.children));
      return child.type === 'button' ? React.cloneElement(child, { form: formId }) : child;
    });
  if (!active) return <span ref={anchor} hidden />;
  const actions = <div className="form-actions">{associate(children)}</div>;
  return (
    <>
      <span ref={anchor} hidden />
      {toolbar && formId ? createPortal(actions, toolbar) : actions}
    </>
  );
}
