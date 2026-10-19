import { ReadOnlyFieldsContext } from './read-only-context.js';
import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/outline';
import { formSections } from '../../../../shared/forms/layout.js';
import { Field } from './fields.jsx';
import { ReferenceField } from './reference-field.jsx';
import { StateBadge } from '../state-badge.jsx';
import { ReferenceValue } from '../reference-value.jsx';

const EditContext = createContext(null);
const controls =
  '[role="combobox"], input:not([type="hidden"]), textarea, select, [contenteditable="true"]';
const editable = (node) => !node.matches(':disabled') && !node.readOnly && node.tabIndex !== -1;
/** Own the permission-gated transition and restore focus after an editor's async controls mount. */
export function RecordFieldEditing({ onEdit, children }) {
  const root = useRef(null),
    [target, setTarget] = useState(null);
  const previouslyEditable = useRef(false);
  if (onEdit) previouslyEditable.current = true;
  const editing = previouslyEditable.current && !onEdit;
  useLayoutEffect(() => {
    if (!editing) {
      if (target) setTarget(null);
      return;
    }
    if (!target) return;
    let frame;
    const find = () =>
      [...root.current.querySelectorAll(controls)].find(
        (node) =>
          editable(node) &&
          ((target.id && node.closest('[data-record-field]')?.dataset.recordField === target.id) ||
            (target.label &&
              node.closest('[data-record-field]')?.dataset.fieldLabel === target.label) ||
            [...(node.labels || [])].some(
              (label) => label.textContent.trim().replace(/\s*\*$/, '') === target.label,
            )),
      );
    const focus = () => {
      if (!find()) return;
      cancelAnimationFrame(frame);
      // Resolve the live control after layout effects finish; async form setup can
      // replace the first matching node in the same commit.
      frame = requestAnimationFrame(() => {
        const field = find();
        if (!field) return;
        field.focus();
        field.scrollIntoView({ block: 'nearest' });
        if (document.activeElement === field) observer.disconnect();
      });
    };
    const observer = new MutationObserver(focus);
    observer.observe(root.current, { childList: true, subtree: true });
    focus();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [editing, target]);
  return (
    <EditContext.Provider
      value={{
        editing,
        canEdit: !!onEdit,
        editField: (field) => {
          if (!onEdit) return;
          setTarget(field);
          onEdit();
        },
      }}
    >
      <div
        ref={root}
        className="space-y-6"
        onDoubleClickCapture={(event) => {
          const control = event.target.closest('button,input,textarea,select');
          if (
            !onEdit ||
            event.target.closest('a,[contenteditable="true"]') ||
            (control && !control.matches(':disabled') && !control.readOnly)
          )
            return;
          const field = event.target.closest(
            '[data-record-field], .record-details dl > div, .static-record-fields label',
          );
          if (!field) return;
          setTarget({
            id: field.dataset.recordField,
            label:
              field.querySelector('dt')?.textContent.trim() ||
              field.dataset.fieldLabel ||
              field.textContent.trim(),
          });
          onEdit();
        }}
      >
        {children}
      </div>
    </EditContext.Provider>
  );
}
/** Read-only affordances reserve value space and enter the permission-gated editor. */
export function EditableField({ children, editing, fieldId, fieldLabel }) {
  const context = useContext(EditContext),
    root = useRef(null);
  const enabled = context?.canEdit && !context.editing && !editing;
  const [hasEditable, setHasEditable] = useState(false),
    [pencilTop, setPencilTop] = useState(32);
  useLayoutEffect(() => {
    if (!enabled) return;
    const check = () => {
      const nodes = [...root.current.querySelectorAll(controls)];
      const value = root.current.querySelector('dd') || nodes.find((node) => node.tabIndex !== -1);
      if (value) {
        const frame = value.closest('.reference-control') || value;
        setPencilTop(
          frame.getBoundingClientRect().top - root.current.getBoundingClientRect().top + 8,
        );
      }

      // A disabled parent fieldset represents read mode; explicit disabled/readOnly
      // controls still represent protected fields and must not offer editing.
      setHasEditable(
        nodes.length
          ? nodes.some((node) => !node.disabled && !node.readOnly && node.tabIndex !== -1)
          : !!root.current.querySelector('dd'),
      );
    };
    check();
    const observer = new MutationObserver(check);
    observer.observe(root.current, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled', 'readonly', 'tabindex'],
    });
    const resize = new ResizeObserver(check);
    resize.observe(root.current);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, [enabled, children]);
  const show = enabled && hasEditable;
  const edit = () => context?.editField({ id: fieldId, label: fieldLabel });
  return (
    <div
      ref={root}
      data-record-field={fieldId}
      data-field-label={fieldLabel}
      className={`record-field relative min-w-0 ${show ? 'record-field-with-edit' : ''}`}
    >
      {children}
      {show && (
        <span
          role="button"
          style={{ top: pencilTop }}
          tabIndex={0}
          className="record-field-pencil absolute right-2 z-10 grid h-7 w-7 cursor-pointer place-items-center rounded text-slate-500 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400 dark:hover:text-blue-300"
          aria-label={`Edit ${fieldLabel || fieldId || 'field'}`}
          onClick={edit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              edit();
            }
          }}
        >
          <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
export function RecordFieldLayout({ fields, layout, renderField, editing = false }) {
  return (
    <div className="space-y-6">
      {formSections(fields, layout).map((section) => {
        const content = section.fields
          .map((field) => {
            const node = renderField(field);
            return node ? (
              <EditableField
                key={field.id}
                fieldId={field.id}
                fieldLabel={field.label}
                editing={editing}
              >
                {node}
              </EditableField>
            ) : null;
          })
          .filter(Boolean);
        return content.length ? (
          <section key={section.id} className="space-y-4" data-form-section={section.id}>
            {section.showName !== false && section.label && (
              <h3 className="font-semibold">{section.label}</h3>
            )}
            <div
              className={`grid items-start gap-4 ${section.columns === 2 ? 'md:grid-cols-2' : 'grid-cols-1'}`}
            >
              {content}
            </div>
          </section>
        ) : null;
      })}
    </div>
  );
}
const refs = {
  serviceId: ['services', 'serviceName'],
  incidentId: ['incidents', 'incidentTitle'],
  assignmentGroupId: ['groups', 'assignmentGroupName'],
  assigneeId: ['members', 'assigneeName'],
  openedForId: ['members', 'openedForName'],
  knowledgeBaseId: ['knowledgeBases', 'knowledgeBaseTitle'],
};
export function RecordFieldsReadOnly({ fields, layout, item, renderValue }) {
  return (
    <RecordFieldLayout
      fields={fields}
      layout={layout}
      renderField={(field) => {
        let value = renderValue?.(field);
        if (value === undefined) {
          const raw = field.type === 'builtin' ? item[field.id] : item.custom?.[field.id];
          value = refs[field.id] ? (
            <ReferenceValue type={refs[field.id][0]} id={raw} label={item[refs[field.id][1]]} />
          ) : ['status', 'severity', 'priority'].includes(field.id) ? (
            <StateBadge status={raw} label={item[`${field.id}Label`]} />
          ) : typeof raw === 'boolean' ? (
            raw ? (
              'Yes'
            ) : (
              'No'
            )
          ) : raw == null || raw === '' ? (
            '—'
          ) : (
            String(raw)
          );
        }
        return (
          <dl>
            <dt className="mb-1 text-sm font-medium text-slate-500 dark:text-slate-400">
              {field.label}
            </dt>
            <dd className="min-h-11 whitespace-pre-wrap break-words rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900">
              {value}
            </dd>
          </dl>
        );
      }}
    />
  );
}

export function useRecordFieldEditing() {
  return useContext(EditContext);
}
/** Reuse static record controls in read and edit modes; retain one layout and separate icon space. */
export function decorateRecordFields(children, editing = true) {
  return React.Children.map(children, (node) => {
    if (
      !React.isValidElement(node) ||
      node.type === RecordFieldLayout ||
      node.type === EditableField
    )
      return node;
    if (
      node.type === Field ||
      node.type === ReferenceField ||
      (node.type === 'label' && node.props.className?.includes('field-label'))
    ) {
      const input = React.Children.toArray(node.props.children).find(
        (child) =>
          React.isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type),
      );
      const label =
        node.props.label ||
        React.Children.toArray(node.props.children)
          .filter((child) => typeof child === 'string')
          .join(' ')
          .trim();
      return (
        <EditableField
          fieldId={node.props.name || input?.props.name || label}
          fieldLabel={String(label).replace(/\s*\*$/, '')}
          editing={editing}
        >
          {node}
        </EditableField>
      );
    }
    return node.props.children
      ? React.cloneElement(node, {}, decorateRecordFields(node.props.children, editing))
      : node;
  });
}
export function StaticRecordFields({ children, readOnly }) {
  const inheritedReadOnly = useContext(ReadOnlyFieldsContext);
  readOnly = readOnly ?? inheritedReadOnly;
  const context = useContext(EditContext);
  return (
    <ReadOnlyFieldsContext.Provider value={!!readOnly}>
      <fieldset
        disabled={readOnly}
        data-readonly={!!readOnly}
        className="static-record-fields space-y-4 min-w-0"
      >
        {decorateRecordFields(children, !readOnly && context?.editing)}
      </fieldset>
    </ReadOnlyFieldsContext.Provider>
  );
}
