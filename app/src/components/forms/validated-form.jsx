import { ValidationContext } from './validation-context.js';
import { UnsavedChanges } from './unsaved-changes.jsx';
import { decorateRecordFields, useRecordFieldEditing } from './record-field-layout.jsx';
import { monitorIntervalMinutes } from '../../../../shared/validation/monitor-interval.js';
import React, { useEffect, useId, useRef, useState, useImperativeHandle } from 'react';
import { fieldErrors, controlError } from '../../../../shared/validation/form-validation.js';

/* Reference searches focus instead of their hidden selected-ID fields. */
function findControl(form, name) {
  return (
    [...form.elements, ...form.querySelectorAll('[contenteditable][data-validation-key]')].find(
      (field) => (field.dataset.referenceName || field.dataset.validationKey) === name,
    ) || form.elements.namedItem(name)
  );
}

/** Accessible custom validation: a linked error summary and field-specific ARIA messages.
 * @param {{kind: string, onSubmit: Function, children: React.ReactNode}} props
 */
export function ValidatedForm({
  kind,
  ref: externalRef,
  onSubmit,
  children,
  confirmDiscard = true,
  dirty,
  onInput,
  onChange,
  validateValues,
  ...props
}) {
  const fieldEditing = useRecordFieldEditing();
  const ref = useRef(null);
  useImperativeHandle(externalRef, () => ref.current);
  const prefix = useId();
  const [errors, setErrors] = useState({});
  const [attempt, setAttempt] = useState(0);
  const [focusRequest, setFocusRequest] = useState(0);
  const submitted = useRef(false);
  const clientFields = useRef(new Set());
  useEffect(() => {
    const form = ref.current;
    for (const field of [
      ...form.elements,
      ...form.querySelectorAll('[contenteditable][data-validation-key]'),
    ]) {
      const name = field.dataset.referenceName || field.name || field.dataset.validationKey;
      if (!name) continue;
      const errorId = `${prefix}-${name}`;
      if (errors[name]) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute(
          'aria-describedby',
          [
            ...new Set([
              ...(field.getAttribute('aria-describedby') || '').split(' ').filter(Boolean),
              errorId,
            ]),
          ].join(' '),
        );
      } else if (field.getAttribute('aria-describedby')?.split(' ').includes(errorId)) {
        field.removeAttribute('aria-invalid');
        const remaining = field
          .getAttribute('aria-describedby')
          .split(' ')
          .filter((id) => id !== errorId)
          .join(' ');
        if (remaining) field.setAttribute('aria-describedby', remaining);
        else field.removeAttribute('aria-describedby');
      }
    }
  }, [errors, prefix]);
  useEffect(() => {
    const names = Object.keys(errors);
    if (!names.length) return;
    const control = findControl(ref.current, names[0]);
    if (control?.focus) control.focus();
    else control?.[0]?.focus?.();
    // Focus belongs to submit, never to revalidation while the user types.
  }, [focusRequest]);
  /** Normalize HTML form values before applying the shared rules. */
  function validate(element) {
    const form = new FormData(element);
    const input = Object.fromEntries(form);
    if (kind === 'monitor' || kind === 'monitor-create') {
      input.intervalMinutes = monitorIntervalMinutes(
        form.get('intervalMinutes'),
        form.get('intervalUnit') || 'minutes',
      );
      input.followRedirects = form.get('followRedirects') === 'true';
    }
    for (const field of ['dependencyIds', 'collectionIds', 'serviceIds', 'componentIds'])
      input[field] = form.getAll(field);
    const found = {};
    for (const [index, control] of [...element.elements].entries()) {
      if (
        control.disabled ||
        control.readOnly ||
        (!['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName) &&
          !control.hasAttribute('data-validation-value')) ||
        (['hidden', 'submit', 'button', 'file', 'radio'].includes(control.type) &&
          !control.hasAttribute('data-validation-value'))
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
      const name =
        control.dataset.referenceName ||
        control.dataset.validationKey ||
        control.name ||
        control.id ||
        `field-${index}`;
      control.dataset.validationKey = name;
      const message = controlError({
        label: control.type === 'email' ? 'Email address' : label,
        value: control.dataset.validationValue ?? control.value,
        type: control.type,
        required: control.required || control.dataset.validationRequired === 'true',
        checked: control.checked,
        maxLength: control.maxLength,
      });
      if (message) found[name] = message;
    }
    Object.assign(found, fieldErrors(kind, input), validateValues?.() || {});
    return found;
  }
  function submit(event) {
    event.preventDefault();
    submitted.current = true;
    setAttempt((value) => value + 1);
    const found = validate(event.currentTarget);
    clientFields.current = new Set([
      ...Object.keys(found),
      ...[...event.currentTarget.elements]
        .map(
          (control) =>
            control.dataset.referenceName ||
            control.dataset.validationKey ||
            control.name ||
            control.id,
        )
        .filter(Boolean),
    ]);
    setErrors(found);
    setFocusRequest((value) => value + 1);
    if (!Object.keys(found).length)
      onSubmit(event, (serverErrors) => {
        setErrors(serverErrors ?? {});
        setFocusRequest((value) => value + 1);
      });
  }
  function revalidate(event) {
    if (!submitted.current) return;
    const found = validate(ref.current);
    const changed =
      event.target.dataset?.referenceName ||
      event.target.dataset?.validationKey ||
      event.target.name ||
      event.target.id;
    setErrors((previous) => {
      const names = new Set([...Object.keys(previous), ...clientFields.current]);
      const next = Object.fromEntries(
        [...names].flatMap((name) => {
          if (!clientFields.current.has(name) && name !== changed)
            return previous[name] ? [[name, previous[name]]] : [];
          return found[name] ? [[name, found[name]]] : [];
        }),
      );
      return JSON.stringify(previous) === JSON.stringify(next) ? previous : next;
    });
  }
  useEffect(() => {
    if (submitted.current) revalidate({ target: {} });
  }, [validateValues]);

  return (
    <ValidationContext.Provider value={{ attempt, errors }}>
      <form
        {...props}
        ref={ref}
        noValidate
        onSubmit={submit}
        onInput={(event) => {
          revalidate(event);
          onInput?.(event);
        }}
        onChange={(event) => {
          revalidate(event);
          onChange?.(event);
        }}
      >
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
    </ValidationContext.Provider>
  );
}
