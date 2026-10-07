/**
 * DOM glue shared by the reading view, hover previews and Live Preview embeds:
 * sanitising rendered Markdown, delegated clicks on links/tags/tasks/copy
 * buttons, and lazy syntax highlighting of code blocks.
 */
import type * as React from 'react';
import DOMPurify from 'dompurify';
import { LanguageDescription } from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import { highlightCode, classHighlighter } from '@lezer/highlight';
import { canvasText, type VaultIndex } from '../../../shared/notes';
import { renderMarkdown, type RenderOptions } from '../../../shared/notes/markdownRender';
import type { ResolveFn } from '../../../shared/notes/markdown';
import type { OpenLinkOpts } from './types';

export const resolverFor = (index: VaultIndex): ResolveFn => (target, fromId) => {
  const n = index.resolve(target, fromId);
  // Canvases embed/preview as their card text rather than raw JSON.
  return n?.kind === 'canvas' ? { id: n.id, title: n.title, content: canvasText(n.content) } : n;
};

export function sanitize(html: string): string {
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'loading'], FORBID_TAGS: ['style', 'form'] }) as unknown as string;
}

export function renderSafe(content: string, opts: RenderOptions): string {
  try {
    return sanitize(renderMarkdown(content, opts));
  } catch (e) {
    return `<pre>${content.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</pre>`;
  }
}

export interface RenderedHandlers {
  onOpenLink: (target: string, opts: OpenLinkOpts) => void;
  onTagClick?: (tag: string) => void;
  onToggleTask?: (line: number) => void;
  /** Root used to scroll to same-note headings / footnotes. */
  root?: HTMLElement | null;
}

export function scrollToHeadingIn(root: HTMLElement | null | undefined, heading: string): boolean {
  if (!root) return false;
  const slug = heading.toLowerCase().trim().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
  const el = [...root.querySelectorAll<HTMLElement>('[data-slug]')].find((h) => h.dataset.slug === slug && !h.closest('.md-embed'));
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}

/** Delegated click handling for rendered Markdown. Returns true if handled. */
export function handleRenderedClick(e: MouseEvent | React.MouseEvent | KeyboardEvent | React.KeyboardEvent, h: RenderedHandlers): boolean {
  const t = e.target as HTMLElement | null;
  if (!t || !t.closest) return false;
  const copy = t.closest<HTMLButtonElement>('.md-copy');
  if (copy) {
    e.preventDefault();
    const code = copy.parentElement?.querySelector('pre code')?.textContent ?? '';
    void navigator.clipboard?.writeText(code).then(() => {
      copy.classList.add('is-copied');
      copy.setAttribute('aria-label', 'Copied');
      setTimeout(() => { copy.classList.remove('is-copied'); copy.setAttribute('aria-label', 'Copy code'); }, 1200);
    }).catch(() => {});
    return true;
  }
  const box = t.closest<HTMLInputElement>('input.task-checkbox');
  if (box) {
    const line = box.dataset.line;
    if (line !== undefined && h.onToggleTask && !box.closest('.md-embed')) { h.onToggleTask(Number(line)); return true; }
    e.preventDefault();
    return true;
  }
  const link = t.closest<HTMLElement>('.internal-link');
  if (link) {
    e.preventDefault();
    const target = link.dataset.href ?? '';
    const heading = link.dataset.heading;
    const block = link.dataset.block;
    const newTab = e.metaKey || e.ctrlKey || ('button' in e && e.button === 1);
    if (!target && heading && !newTab && scrollToHeadingIn(h.root, heading)) return true;
    h.onOpenLink(target, { newTab, heading, block });
    return true;
  }
  const tag = t.closest<HTMLElement>('a.tag');
  if (tag) {
    e.preventDefault();
    h.onTagClick?.(tag.dataset.tag ?? '');
    return true;
  }
  const fn = t.closest<HTMLElement>('[data-footnote]');
  if (fn && h.root) {
    e.preventDefault();
    h.root.querySelector(`[data-footnote-id="${CSS.escape(fn.dataset.footnote ?? '')}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }
  return false;
}

/** Keyboard activation for role=link elements (Enter). */
export function handleRenderedKey(e: React.KeyboardEvent, h: RenderedHandlers) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target as HTMLElement;
  if (t.getAttribute('role') === 'link') { handleRenderedClick(e, h); }
}

/** Syntax-highlight `<code data-lang>` blocks inside root (languages load lazily). */
export function highlightCodeBlocks(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>('code[data-lang]:not([data-hl])').forEach((code) => {
    code.dataset.hl = '1';
    const desc = LanguageDescription.matchLanguageName(languages, code.dataset.lang ?? '', true);
    if (!desc) return;
    const text = code.textContent ?? '';
    desc.load().then((support) => {
      if (!code.isConnected || code.textContent !== text) return;
      const frag = document.createDocumentFragment();
      highlightCode(text, support.language.parser.parse(text), classHighlighter,
        (txt, classes) => {
          if (!classes) { frag.appendChild(document.createTextNode(txt)); return; }
          const span = document.createElement('span');
          span.className = classes;
          span.textContent = txt;
          frag.appendChild(span);
        },
        () => frag.appendChild(document.createTextNode('\n')));
      code.replaceChildren(frag);
    }).catch(() => {});
  });
}
