import { createContext, useContext, useRef } from 'react';

export const ValidationContext = createContext({ attempt: 0, errors: {} });

/** Keep server/domain errors until the affected value changes validly; retrying resets the baseline. */
export function useValidationError(error, value, valid = true, name) {
  const { attempt, errors } = useContext(ValidationContext);
  const snapshot = useRef(null);
  const serialized = JSON.stringify(value ?? '');
  if (!snapshot.current || snapshot.current.error !== error || snapshot.current.attempt !== attempt)
    snapshot.current = { error, value: serialized, attempt };
  if (name && errors[name]) return errors[name];
  return error && !(snapshot.current.value !== serialized && valid) ? error : undefined;
}
