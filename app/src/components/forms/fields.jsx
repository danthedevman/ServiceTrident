import { AutoTextarea } from './auto-textarea.jsx';
import { Select } from './select.jsx';
import { ReferenceField } from './reference-field.jsx';
import React, { useId } from 'react';

/** Show text errors without rendering provider-supplied HTML. */
export function Notice({ error }) {
  return error ? (
    <p
      role="alert"
      className="rounded-lg border border-rose-300 p-3 text-sm text-rose-700 dark:text-rose-300"
    >
      {error}
    </p>
  ) : null;
}

/** Label and associate server errors with ordinary form controls. */
export function Field({ label, name, errors = {}, helpText, children }) {
  const labelId = useId();
  const fieldId = `${name || 'field'}-${labelId}`;
  return (
    <label className="field-label block">
      <span id={labelId}>{label}</span>
      {React.cloneElement(children, {
        id: fieldId,
        'aria-labelledby': children.props['aria-labelledby'] || labelId,
        'aria-invalid': !!errors[name],
        'aria-describedby':
          [helpText ? `${fieldId}-help` : '', errors[name] ? `${fieldId}-error` : '']
            .filter(Boolean)
            .join(' ') || undefined,
      })}
      {helpText && (
        <span id={`${fieldId}-help`} className="field-hint whitespace-pre-wrap">
          {helpText}
        </span>
      )}
      {errors[name] && (
        <span
          id={`${fieldId}-error`}
          className="mt-1 block text-sm text-rose-700 dark:text-rose-300"
        >
          {errors[name]}
        </span>
      )}
    </label>
  );
}

/** Service targeting uses the same accessible toggle-pill interaction as dependencies. */
export function ServicePills({ services, value, onChange, disabled = false }) {
  return (
    <ReferenceField
      referenceType="services"
      label="Services (none means all services)"
      multiple
      options={services.map((row) => ({ id: row.id, label: row.name }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

/** Render validated custom controls with stable IDs; checkbox values remain booleans. */
export function CustomField({ field, value, onChange, errors }) {
  const common = {
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    required: field.required,
  };
  let input;
  if (field.type === 'select')
    input = (
      <Select {...common}>
        <option value="">Choose an option</option>
        {value && (!field.options.includes(value) || field.hiddenOptions?.includes(value)) && (
          <option value={value}>{value} (saved)</option>
        )}
        {field.options
          .filter((option) => !field.hiddenOptions?.includes(option))
          .map((o) => (
            <option key={o}>{o}</option>
          ))}
      </Select>
    );
  else if (field.type === 'textarea')
    input = <AutoTextarea {...common} maxLength={2000} rows={3} />;
  else if (field.type === 'checkbox')
    input = (
      <input
        type="checkbox"
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  else if (field.type === 'number')
    input = (
      <input
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    );
  else input = <input type={field.type === 'date' ? 'date' : 'text'} maxLength={500} {...common} />;
  return (
    <Field
      name={field.id}
      label={`${field.label}${field.required ? ' *' : ''}`}
      helpText={field.helpText}
      errors={errors}
    >
      {input}
    </Field>
  );
}
