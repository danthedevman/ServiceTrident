/* eslint-disable no-control-regex -- Explicitly reject unsafe control bytes at input boundaries. */
import { InputError } from '../validation/input-error.js';

const imagePath = /^\/api\/attachments\/files\/([a-f0-9]{24})\/preview$/;
/** Accept only web links; never execute scripts, load local files, or embed external images. */
export function safeLink(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value))
    return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
/** Convert legacy plain text without interpreting it as HTML. */
export function textDocument(text = '') {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      ...(line ? { content: [{ type: 'text', text: line }] } : {}),
    })),
  };
}
/** Validate and normalize a bounded editor tree instead of accepting arbitrary HTML.
 * @returns {{document: object, text: string, imageIds: string[]}}
 */
export function validateRichContent(document, { required = true } = {}) {
  const fail = () => {
    throw new InputError(
      'Use supported formatting, web links, and uploaded images within the article limits.',
      400,
      { content: 'Invalid or oversized article content.' },
    );
  };
  if (!document || document.type !== 'doc' || JSON.stringify(document).length > 120000) fail();
  let count = 0,
    characters = 0;
  const imageIds = new Set();
  const blocks = [
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'blockquote',
    'codeBlock',
    'horizontalRule',
    'image',
  ];
  function node(input, parent, depth = 0) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || ++count > 3000 || depth > 16)
      fail();
    const type = input.type;
    const allowed =
      parent === null
        ? ['doc']
        : ['doc', 'blockquote', 'listItem'].includes(parent)
          ? blocks
          : ['bulletList', 'orderedList'].includes(parent)
            ? ['listItem']
            : parent === 'codeBlock'
              ? ['text']
              : ['paragraph', 'heading'].includes(parent)
                ? ['text', 'hardBreak']
                : [];
    if (!allowed.includes(type)) fail();
    const result = { type };
    if (type === 'text') {
      if (
        typeof input.text !== 'string' ||
        !input.text ||
        (characters += input.text.length) > 30000
      )
        fail();
      result.text = input.text;
      if (input.marks) {
        if (!Array.isArray(input.marks) || input.marks.length > 6) fail();
        result.marks = input.marks.map((mark) => {
          if (!['bold', 'italic', 'underline', 'strike', 'code', 'link'].includes(mark?.type))
            fail();
          if (mark.type !== 'link') return { type: mark.type };
          if (!safeLink(mark.attrs?.href)) fail();
          return {
            type: 'link',
            attrs: { href: mark.attrs.href, target: '_blank', rel: 'noopener noreferrer' },
          };
        });
      }
    }
    if (type === 'heading') {
      if (![2, 3].includes(input.attrs?.level)) fail();
      result.attrs = { level: input.attrs.level };
    }
    if (type === 'orderedList') {
      const start = input.attrs?.start ?? 1;
      if (!Number.isInteger(start) || start < 1 || start > 10000) fail();
      result.attrs = { start };
    }
    if (type === 'image') {
      const match = imagePath.exec(input.attrs?.src ?? '');
      if (!match) fail();
      imageIds.add(match[1]);
      if (imageIds.size > 20) fail();
      const alt = input.attrs?.alt ?? '';
      if (typeof alt !== 'string' || alt.length > 500) fail();
      result.attrs = { src: input.attrs.src, alt };
    }
    if (input.content !== undefined) {
      if (
        !Array.isArray(input.content) ||
        ['text', 'image', 'hardBreak', 'horizontalRule'].includes(type)
      )
        fail();
      result.content = input.content.map((child) => node(child, type, depth + 1));
    }
    return result;
  }
  const clean = node(document, null);
  function plain(item) {
    if (item.type === 'text') return item.text;
    if (item.type === 'image') return item.attrs.alt || '[Image]';
    if (item.type === 'hardBreak') return '\n';
    return (item.content ?? [])
      .map(plain)
      .join(['paragraph', 'heading', 'codeBlock'].includes(item.type) ? '' : '\n');
  }
  const text = plain(clean).trim();
  if ((required && !text) || text.length > 30000) fail();
  return { document: clean, text, imageIds: [...imageIds] };
}

/** List private files actually embedded as image nodes, excluding ordinary links and text. */
export function embeddedImageIds(document) {
  const ids = new Set(),
    pending = document ? [document] : [];
  let visited = 0;
  while (pending.length && visited++ < 3000) {
    const node = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (node.type === 'image' && typeof node.attrs?.src === 'string') {
      const match = imagePath.exec(node.attrs.src);
      if (match) ids.add(match[1]);
    }
    if (Array.isArray(node.content)) pending.push(...node.content.slice(0, 3000));
  }
  return [...ids];
}
