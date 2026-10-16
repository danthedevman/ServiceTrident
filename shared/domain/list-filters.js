/** Filter preferences contain bounded controls only, never records or arbitrary request objects. */
export function validListFilters(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length <= 100 &&
    Object.entries(value).every(
      ([key, fields]) =>
        /^[a-zA-Z0-9/_:.-]{1,300}$/.test(key) &&
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        !!fields &&
        typeof fields === 'object' &&
        !Array.isArray(fields) &&
        Object.keys(fields).length <= 30 &&
        Object.entries(fields).every(
          ([field, entry]) =>
            /^[a-zA-Z][a-zA-Z0-9]{0,49}$/.test(field) &&
            !['__proto__', 'constructor', 'prototype'].includes(field) &&
            ((typeof entry === 'string' &&
              entry.length <= 200 &&
              !Array.from(entry).some(
                (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
              )) ||
              (Number.isInteger(entry) && entry >= 1 && entry <= 100)),
        ),
    )
  );
}
