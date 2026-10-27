import React, { Children, useId, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

/** Flatten mapped options and fragments without interpreting labels as HTML. */
function optionsFrom(children) {
  return Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child)) return [];
    if (child.type === React.Fragment) return optionsFrom(child.props.children);
    return [{ ...child.props, value: String(child.props.value ?? child.props.children) }];
  });
}

/** Shared single-select control with native validation and a keyboard-accessible listbox. */
export function Select({
  children,
  value,
  defaultValue,
  onChange,
  id,
  name,
  required,
  disabled,
  className = '',
  searchable = false,
  searchLabel = 'Search options',
  ...props
}) {
  const generated = useId();
  const listId = `${generated}-options`;
  const trigger = useRef(null),
    panel = useRef(null),
    native = useRef(null),
    searchInput = useRef(null);
  const options = optionsFrom(children);
  const [search, setSearch] = useState('');
  const matches = (option, query = search) =>
    `${option.children} ${option.value}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  const [internal, setInternal] = useState(defaultValue ?? options[0]?.value ?? '');
  const selected = String(value ?? internal);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [active, setActive] = useState(0);
  const prefix = useRef({ text: '', at: 0 });
  const available = options
    .map((option, index) => (option.disabled || (searchable && !matches(option)) ? -1 : index))
    .filter((index) => index >= 0);
  function close() {
    panel.current.hidePopover();
  }
  function choose(index) {
    const option = options[index];
    if (!option || option.disabled) return;
    setInvalid(false);
    setInternal(option.value);
    native.current.value = option.value;
    onChange?.({ target: native.current, currentTarget: native.current });
    native.current.dispatchEvent(new Event('input', { bubbles: true }));
    close();
    trigger.current.focus();
  }
  function show() {
    if (trigger.current.matches(':disabled')) return;
    setSearch('');
    panel.current.showPopover();
    if (searchable) searchInput.current.focus();
    const rect = trigger.current.getBoundingClientRect();
    // Fit long options independently of the trigger, while keeping the menu inside the viewport.
    panel.current.style.width = 'max-content';
    panel.current.style.minWidth = `${Math.min(rect.width, window.innerWidth - 16)}px`;
    panel.current.style.maxWidth = `${Math.min(640, window.innerWidth - 16)}px`;
    panel.current.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - panel.current.offsetWidth - 8))}px`;
    const height = panel.current.offsetHeight;
    panel.current.style.top = `${Math.max(8, rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - height - 4)}px`;
    setActive(
      Math.max(
        0,
        options.findIndex((option) => option.value === selected),
      ),
    );
  }
  function keyboard(event) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(event.key)) {
      event.preventDefault();
      if (!open) {
        show();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (available.includes(active)) choose(active);
        return;
      }
      const position = available.indexOf(active);
      const next =
        event.key === 'Home'
          ? available[0]
          : event.key === 'End'
            ? available.at(-1)
            : available[
                (position + (event.key === 'ArrowDown' ? 1 : -1) + available.length) %
                  available.length
              ];
      if (next !== undefined) {
        setActive(next);
        document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: 'nearest' });
      }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      trigger.current.focus();
    } else if (event.key === 'Tab') close();
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      if (!open) show();
      prefix.current.text =
        (Date.now() - prefix.current.at < 600 ? prefix.current.text : '') + event.key.toLowerCase();
      prefix.current.at = Date.now();
      const index = options.findIndex(
        (option) =>
          !option.disabled && String(option.children).toLowerCase().startsWith(prefix.current.text),
      );
      if (index >= 0) {
        setActive(index);
        document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: 'nearest' });
      }
    }
  }
  return (
    <span className="custom-select">
      <select
        ref={native}
        onFocus={() => trigger.current.focus()}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        name={name}
        data-validation-key={props['data-validation-key']}
        aria-labelledby={props['aria-labelledby']}
        required={required}
        disabled={disabled}
        value={selected}
        onChange={onChange}
        onInvalid={(event) => {
          event.preventDefault();
          trigger.current.focus();
          setInvalid(true);
        }}
      >
        {children}
      </select>
      <button
        {...props}
        id={id}
        data-reference-name={name}
        aria-invalid={invalid || props['aria-invalid'] || undefined}
        ref={trigger}
        type="button"
        disabled={disabled}
        role={searchable ? undefined : 'combobox'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-required={required || undefined}
        aria-activedescendant={open && !searchable ? `${listId}-${active}` : undefined}
        className={`select-trigger ${className}`}
        onClick={(event) => {
          event.preventDefault();
          if (open) close();
          else show();
        }}
        onKeyDown={keyboard}
      >
        <span className="truncate">
          {options.find((option) => option.value === selected)?.children ?? 'Choose an option'}
        </span>
        <ChevronDownIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </button>
      {invalid && (
        <span role="alert" className="block text-sm text-rose-700 dark:text-rose-300">
          This field is mandatory.
        </span>
      )}
      <span
        ref={panel}
        popover="auto"
        className="select-options"
        onToggle={(event) => setOpen(event.newState === 'open')}
      >
        {searchable && (
          <span className="select-search">
            <input
              ref={searchInput}
              type="search"
              role="combobox"
              aria-label={searchLabel}
              placeholder={searchLabel}
              autoComplete="off"
              value={search}
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && available.includes(active) ? `${listId}-${active}` : undefined
              }
              onChange={(event) => {
                const query = event.target.value;
                setSearch(query);
                setActive(
                  options.findIndex((option) => !option.disabled && matches(option, query)),
                );
              }}
              onKeyDown={(event) => {
                if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key))
                  keyboard(event);
              }}
            />
          </span>
        )}
        <span
          id={listId}
          role="listbox"
          aria-label={props['aria-label'] || 'Options'}
          className="block"
        >
          {options.map(
            (option, index) =>
              (!searchable || matches(option)) && (
                <span
                  key={`${option.value}-${index}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={option.value === selected}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    choose(index);
                  }}
                  className="select-option"
                >
                  <span>{option.children}</span>
                  {option.value === selected && (
                    <CheckIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                </span>
              ),
          )}
        </span>
        {searchable && !options.some((option) => matches(option)) && (
          <span role="status" className="block px-3 py-4 text-sm text-slate-500">
            No matching options
          </span>
        )}
      </span>
    </span>
  );
}
