import { UnsavedChanges } from './unsaved-changes.jsx';
import { decorateRecordFields, useRecordFieldEditing } from './record-field-layout.jsx';
import { monitorIntervalMinutes } from '../../../../shared/validation/monitor-interval.js';
import { notify } from '../../data/toast.js';
import React, { useEffect, useId, useRef, useState } from 'react';
import { fieldErrors, controlError } from '../../../../shared/validation/form-validation.js';

/* Reference searches focus instead of their hidden selected-ID fields. */
function findControl(form, name) {
  return (
    [...form.elements].find(
      (field) => (field.dataset.referenceName || field.dataset.validationKey) === name,
    ) || form.elements.namedItem(name)
  );
}

/** Accessible custom validation: a linked error summary and field-specific ARIA messages.
 * @param {{kind: string, onSubmit: Function, children: React.ReactNode}} props
 */
export function ValidatedForm({
  kind,
  onSubmit,
  children,
  confirmDiscard = true,
  dirty,
  ...props
}) {
  const fieldEditing = useRecordFieldEditing();
  const ref = useRef(null);
  const prefix = useId();
  const [errors, setErrors] = useState({});
  useEffect(() => {
    const form = ref.current;
    for (const field of form.elements) {
      const name = field.dataset.referenceName || field.name || field.dataset.validationKey;
      if (!name) continue;
      const errorId = `${prefix}-${name}`;
      if (errors[name]) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', errorId);
      } else {
        if (field.getAttribute('aria-describedby') === errorId) {
          field.removeAttribute('aria-invalid');
          field.removeAttribute('aria-describedby');
        }
      }
    }
    if (Object.keys(errors).length) {
      const control = findControl(form, Object.keys(errors)[0]);
      if (control?.focus) control.focus();
      else if (control?.[0]?.focus) control[0].focus();
    }
  }, [errors, prefix]);
  /** Normalize HTML form values before applying the shared rules. */
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = Object.fromEntries(form);
    if (kind === 'monitor' || kind === 'monitor-create') {
      input.intervalMinutes = monitorIntervalMinutes(
        form.get('intervalMinutes'),
        form.get('intervalUnit') || 'minutes',
      );
      input.followRedirects = form.get('followRedirects') === 'true';
    }
    for (const field of ['dependencyIds', 'collectionIds', 'serviceIds'])
      input[field] = form.getAll(field);
    const found = {};
    for (const [index, control] of [...event.currentTarget.elements].entries()) {
      if (
        control.disabled ||
        control.readOnly ||
        !['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) ||
        ['hidden', 'submit', 'button', 'file', 'radio'].includes(control.type)
      )
        continue;
      const labelNode = control.labels?.[0];
      const directText =
        labelNode &&
        [...labelNode.childNodes]
          .filter((node) => node.nodeType === 3)
          .map((node) => node.textContent)
          .join(' ')
          .trim();
      const labelled = control
        .getAttribute('aria-labelledby')
        ?.split(' ')
        .map((id) => document.getElementById(id)?.textContent || '')
        .join(' ');
      const label = (
        labelled ||
        directText ||
        control.getAttribute('aria-label') ||
        control.name ||
        'This field'
      )
        .replace(/\s*\*$/, '')
        .trim();
      const name = control.dataset.referenceName || control.name || control.id || `field-${index}`;
      control.dataset.validationKey = name;
      const message = controlError({
        label: control.type === 'email' ? 'Email address' : label,
        value: control.value,
        type: control.type,
        required: control.required,
        checked: control.checked,
        maxLength: control.maxLength,
      });
      if (message) found[name] = message;
    }
    Object.assign(found, fieldErrors(kind, input));
    setErrors(found);
    if (Object.keys(found).length) notify('Please correct the highlighted fields.', 'error');
    if (!Object.keys(found).length)
      onSubmit(event, (serverErrors) => setErrors(serverErrors ?? {}));
  }
  return (
    <form {...props} ref={ref} noValidate onSubmit={submit}>
      <UnsavedChanges formRef={ref} enabled={confirmDiscard} dirty={dirty} />
      {Object.keys(errors).length > 0 && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
        >
          <p className="font-semibold">Please correct the following fields:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {Object.entries(errors).map(([name, message]) => (
              <li key={name} id={`${prefix}-${name}`}>
                <button
                  type="button"
                  className="text-left underline"
                  onClick={() => {
                    const field = findControl(ref.current, name);
                    if (field?.focus) field.focus();
                    else field?.[0]?.focus();
                  }}
                >
                  {message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {fieldEditing?.editing ? decorateRecordFields(children) : children}
    </form>
  );
}
