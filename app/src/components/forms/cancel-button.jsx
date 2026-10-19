import React from 'react';
import { useNavigate } from 'react-router-dom';

/** Discard an edit through its owner; creation forms return to their owning list. */
export function CancelButton({ to, onCancel, disabled = false, form }) {
  const navigate = useNavigate();
  return (
    <button
      form={form}
      type="button"
      className="btn-secondary"
      disabled={disabled}
      onClick={() => {
        if (onCancel) onCancel();
        else navigate(to);
      }}
    >
      Cancel
    </button>
  );
}
