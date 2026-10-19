import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../modal.jsx';

// Compare only in-memory control values, including unnamed schema controls and rich editors.
// Nothing from a draft is stored in preferences, logs, or browser persistence.
function snapshot(form) {
  return JSON.stringify(
    [...form.querySelectorAll('input,textarea,select,[contenteditable="true"]')].map((node) =>
      node.matches('input[role="combobox"]')
        ? ['reference', node.closest('.reference-control')?.dataset.selectedIds || '']
        : node.isContentEditable
          ? ['rich', node.innerHTML]
          : [
              node.name || node.type,
              node.type === 'checkbox' || node.type === 'radio' ? node.checked : node.value,
            ],
    ),
  );
}
export function UnsavedChanges({ formRef, enabled = true, dirty }) {
  const modelDirty = useRef(dirty);
  modelDirty.current = dirty;
  const baseline = useRef(null),
    allow = useRef(false),
    keep = useRef(null);
  const [cancel, setCancel] = useState(null);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    baseline.current = snapshot(form);
    if (!enabled) return;
    const intercept = (event) => {
      const button = event.target.closest('button');
      if (
        !button ||
        button.textContent.trim() !== 'Cancel' ||
        button.disabled ||
        (button.form || button.closest('form')) !== form
      )
        return;
      if (allow.current) {
        allow.current = false;
        return;
      }
      if (
        typeof modelDirty.current === 'boolean'
          ? !modelDirty.current
          : snapshot(form) === baseline.current
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setCancel(button);
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [enabled, formRef]);
  return cancel ? (
    <Modal
      title="Discard Unsaved Changes?"
      onClose={() => setCancel(null)}
      initialFocusRef={keep}
      footer={
        <>
          <button ref={keep} type="button" className="btn-primary" onClick={() => setCancel(null)}>
            Keep Editing
          </button>
          <button
            type="button"
            className="btn-danger"
            onClick={() => {
              const button = cancel;
              setCancel(null);
              allow.current = true;
              button.click();
            }}
          >
            Discard Changes
          </button>
        </>
      }
    >
      <p>Your unsaved changes will be discarded.</p>
    </Modal>
  ) : null;
}
