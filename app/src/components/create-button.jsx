import React from 'react';
import { Link } from 'react-router-dom';
import { PlusIcon } from '@heroicons/react/24/outline';

/** One creation control for routes, dialogs, and native (including portaled) form submissions. */
export function CreateButton({
  to,
  type,
  children = 'Create',
  className = 'btn-primary',
  ...props
}) {
  const content = (
    <>
      {children === 'Create' && <PlusIcon className="h-5 w-5 shrink-0" aria-hidden="true" />}
      {children}
    </>
  );
  const classes = className;
  return to !== undefined ? (
    <Link {...props} to={to} className={classes}>
      {content}
    </Link>
  ) : (
    <button {...props} type={type || (props.onClick ? 'button' : 'submit')} className={classes}>
      {content}
    </button>
  );
}
