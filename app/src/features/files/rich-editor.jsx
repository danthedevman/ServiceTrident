import { useValidationError } from '../../components/forms/validation-context.js';
import React, { useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {
  PhotoIcon,
  LinkIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
} from '@heroicons/react/24/outline';
import {
  safeLink,
  textDocument,
  validateRichContent,
} from '../../../../shared/files/rich-content.js';

const localImage = /^\/api\/attachments\/files\/[a-f0-9]{24}\/preview$/;
const PrivateImage = Image.extend({
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element) => (localImage.test(element.getAttribute('src') ?? '') ? null : false),
      },
    ];
  },
});
/** Rich editor emits JSON only; pasted external images are excluded and uploaded images stay private. */
export function RichEditor({
  value,
  onChange,
  uploadImage,
  busy,
  error: suppliedError,
  label = 'Article content',
  helpText,
}) {
  let valid = false;
  try {
    valid = !!validateRichContent(value ?? textDocument(''), { required: false }).text;
  } catch {
    /* Retain the field error until the document is valid. */
  }
  const error = useValidationError(suppliedError, value, valid, 'content');
  const [message, setMessage] = useState(''),
    [linkOpen, setLinkOpen] = useState(false),
    [href, setHref] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          protocols: ['http', 'https'],
          isAllowedUri: (url) => safeLink(url),
        },
        trailingNode: false,
      }),
      PrivateImage.configure({ allowBase64: false }),
    ],
    content: value ?? textDocument(''),
    injectCSS: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: 'rich-content rich-editor-body',
        role: 'textbox',
        'data-validation-key': 'content',
        'aria-multiline': 'true',
        'aria-label': label,
        'aria-describedby': helpText ? 'article-content-help' : undefined,
      },
      handleDrop: (_view, event) => {
        if (event.dataTransfer?.files.length) {
          event.preventDefault();
          setMessage('Use Insert image or Attachments to upload files.');
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        if (event.clipboardData?.files.length) {
          event.preventDefault();
          setMessage('Use Insert image to upload clipboard images saved to a file.');
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  if (!editor)
    return (
      <p role="status" className="sr-only">
        Loading editor…
      </p>
    );
  const action = (title, run, active, icon) => (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`rounded-md px-2.5 py-2 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 ${active ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' : ''}`}
      onClick={run}
    >
      {icon ?? title}
    </button>
  );
  return (
    <div className="space-y-2">
      <div
        className="rich-editor-field overflow-hidden bg-white dark:bg-slate-900"
        aria-invalid={error ? true : undefined}
      >
        <div
          role="group"
          aria-label="Formatting controls"
          className="flex flex-wrap items-center gap-1 border-b border-slate-200 p-2 dark:border-slate-700"
        >
          {action('Bold', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
          {action(
            'Italic',
            () => editor.chain().focus().toggleItalic().run(),
            editor.isActive('italic'),
          )}
          {action(
            'Underline',
            () => editor.chain().focus().toggleUnderline().run(),
            editor.isActive('underline'),
          )}
          {action(
            'Heading',
            () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            editor.isActive('heading', { level: 2 }),
          )}
          {action(
            'Bullets',
            () => editor.chain().focus().toggleBulletList().run(),
            editor.isActive('bulletList'),
          )}
          {action(
            'Numbered list',
            () => editor.chain().focus().toggleOrderedList().run(),
            editor.isActive('orderedList'),
          )}
          {action(
            'Quote',
            () => editor.chain().focus().toggleBlockquote().run(),
            editor.isActive('blockquote'),
          )}
          {action(
            'Code',
            () => editor.chain().focus().toggleCodeBlock().run(),
            editor.isActive('codeBlock'),
          )}
          {action(
            'Insert link',
            () => {
              setHref(editor.getAttributes('link').href ?? '');
              setLinkOpen(!linkOpen);
            },
            editor.isActive('link'),
            <LinkIcon className="h-5 w-5" />,
          )}
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-md p-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${busy ? 'opacity-50' : ''}`}
          >
            <PhotoIcon className="h-5 w-5" />
            Insert image
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setMessage('');
                try {
                  const uploaded = await uploadImage(file);
                  editor
                    .chain()
                    .focus()
                    .setImage({ src: uploaded.previewUrl, alt: file.name })
                    .run();
                } catch (error) {
                  setMessage(error.message);
                }
              }}
            />
          </label>
          {action(
            'Undo',
            () => editor.chain().focus().undo().run(),
            undefined,
            <ArrowUturnLeftIcon className="h-5 w-5" />,
          )}
          {action(
            'Redo',
            () => editor.chain().focus().redo().run(),
            undefined,
            <ArrowUturnRightIcon className="h-5 w-5" />,
          )}
        </div>
        {linkOpen && (
          <div className="flex flex-wrap items-end gap-2 border-b border-slate-200 p-3 dark:border-slate-700">
            <label className="field-label flex-1">
              Web link
              <input
                type="url"
                value={href}
                onChange={(event) => setHref(event.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                if (!safeLink(href)) {
                  setMessage('Enter a complete http:// or https:// web link.');
                  return;
                }
                editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
                setLinkOpen(false);
                setMessage('');
              }}
            >
              Apply
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                editor.chain().focus().unsetLink().run();
                setLinkOpen(false);
              }}
            >
              Remove link
            </button>
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
      {helpText && (
        <p id="article-content-help" className="field-hint whitespace-pre-wrap">
          {helpText}
        </p>
      )}
      {(error || message) && (
        <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">
          {error || message}
        </p>
      )}
      <p className="text-xs text-slate-500">
        Images: PNG, JPEG, GIF, or WebP, up to 5 MB. Formatting and uploaded images are saved with
        the article.
      </p>
    </div>
  );
}
/** Render only explicit React elements; legacy text and unknown markup are never interpreted as HTML. */
export function ArticleContent({ document, text }) {
  if (!document) return <div className="whitespace-pre-wrap break-words leading-7">{text}</div>;
  function render(node, key) {
    if (node.type === 'text')
      return (node.marks ?? []).reduce((child, mark, index) => {
        const tags = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };
        if (mark.type === 'link' && safeLink(mark.attrs?.href))
          return (
            <a
              key={`${key}-${index}`}
              href={mark.attrs.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {child}
            </a>
          );
        return tags[mark.type]
          ? React.createElement(tags[mark.type], { key: `${key}-${index}` }, child)
          : child;
      }, node.text);
    if (node.type === 'image')
      return localImage.test(node.attrs?.src ?? '') ? (
        <img key={key} src={node.attrs.src} alt={node.attrs.alt ?? ''} loading="lazy" />
      ) : null;
    if (node.type === 'hardBreak') return <br key={key} />;
    if (node.type === 'horizontalRule') return <hr key={key} />;
    const tags = {
      doc: 'div',
      paragraph: 'p',
      heading: node.attrs?.level === 3 ? 'h3' : 'h2',
      bulletList: 'ul',
      orderedList: 'ol',
      listItem: 'li',
      blockquote: 'blockquote',
      codeBlock: 'pre',
    };
    if (!tags[node.type]) return null;
    return React.createElement(
      tags[node.type],
      { key, ...(node.type === 'orderedList' ? { start: node.attrs?.start ?? 1 } : {}) },
      ...(node.content ?? []).map((child, index) => render(child, `${key}-${index}`)),
    );
  }
  return <div className="rich-content">{render(document, 'article')}</div>;
}
