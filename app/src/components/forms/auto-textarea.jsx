import React, { useLayoutEffect, useRef } from 'react';

/** Grow with typing, pasted text, and width changes; scroll after reaching the height cap.
 * @param {{minHeight?: number, maxHeight?: number} & React.TextareaHTMLAttributes<HTMLTextAreaElement>} props
 */
export function AutoTextarea({
  ref: externalRef,
  minHeight = 96,
  maxHeight = 320,
  onInput,
  onKeyUp,
  style,
  ...props
}) {
  const ref = useRef(null);
  const resize = () => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    const borders = element.offsetHeight - element.clientHeight;
    const height = Math.max(minHeight, Math.min(maxHeight, element.scrollHeight + borders));
    element.style.height = `${height}px`;
    element.style.overflowY = element.scrollHeight + borders > maxHeight ? 'auto' : 'hidden';
  };
  useLayoutEffect(() => {
    resize();
    let width = ref.current.clientWidth;
    const observer = new ResizeObserver(() => {
      if (ref.current && ref.current.clientWidth !== width) {
        width = ref.current.clientWidth;
        resize();
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [minHeight, maxHeight, props.value, props.defaultValue]);
  return (
    <textarea
      {...props}
      ref={(element) => {
        ref.current = element;
        if (typeof externalRef === 'function') externalRef(element);
        else if (externalRef) externalRef.current = element;
      }}
      rows={3}
      style={{ ...style, minHeight, maxHeight, resize: 'none' }}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      onKeyUp={(event) => {
        resize();
        onKeyUp?.(event);
      }}
    />
  );
}
