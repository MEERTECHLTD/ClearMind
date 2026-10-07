/**
 * Attachments inside rendered Markdown (reading view, hover previews, Live
 * Preview embeds). `fileRendererFor(index)` plugs into markdownRender's
 * `renderFile` hook and emits inert placeholders (they survive DOMPurify);
 * `hydrateAttachments(root, index)` turns them into real <img>/<iframe>/
 * <audio>/<video>/file chips once the object URL is available.
 */
import type { Attachment } from '../../../types';
import { attachmentKind, isFileTarget, type VaultIndex } from '../../../shared/notes';
import { esc, type FileRenderer } from '../../../shared/notes/markdownRender';
import { getAttachmentUrl, peekAttachmentUrl, downloadAttachment } from '../attachments';
import { formatBytes, parseEmbedSize } from '../attachmentUtils';

/** Resolve a link target to an attachment the way the vault index does (file-looking targets prefer files). */
export function attachmentFor(index: VaultIndex | null | undefined, target: string, fromId?: string): Attachment | null {
  if (!index || !target.trim()) return null;
  if (isFileTarget(target)) return index.resolveAttachment(target, fromId);
  return index.resolve(target, fromId) ? null : index.resolveAttachment(target, fromId);
}

export function fileRendererFor(index: VaultIndex): FileRenderer {
  return (link, embed, ctx) => {
    const a = attachmentFor(index, link.target, ctx.fromId);
    if (!a) return null;
    if (!embed) {
      return `<a class="internal-link md-att-link" role="link" tabindex="0" data-href="${esc(link.target)}" data-attachment-id="${esc(a.id)}" title="${esc(a.name)}">${esc(link.alias || a.name)}</a>`;
    }
    const size = parseEmbedSize(link.alias);
    const tag = ctx.block && attachmentKind(a) !== 'image' ? 'div' : 'span';
    return `<${tag} class="md-att" data-att-embed="${esc(a.id)}" data-target="${esc(link.target)}"${size.width ? ` data-width="${size.width}"` : ''}${size.height ? ` data-height="${size.height}"` : ''}>${esc(a.name)}</${tag}>`;
  };
}

const ICON: Record<string, string> = {
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
};
const svg = (k: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

/** A small toolbar: name (opens the attachment tab via the normal link handler) + download. */
function toolbar(a: Attachment, target: string): HTMLElement {
  const bar = el('span', 'md-att-bar');
  const name = el('a', 'internal-link md-att-name');
  name.setAttribute('role', 'link');
  name.tabIndex = 0;
  name.dataset.href = target;
  name.dataset.attachmentId = a.id;
  name.title = `Open ${a.name}`;
  name.innerHTML = `${svg('open')}<span></span>`;
  name.querySelector('span')!.textContent = a.name;
  const meta = el('span', 'md-att-meta');
  meta.textContent = formatBytes(a.size);
  const dl = el('button', 'md-att-btn', svg('download'));
  dl.type = 'button';
  dl.setAttribute('aria-label', `Download ${a.name}`);
  dl.title = 'Download';
  dl.addEventListener('mousedown', (e) => e.preventDefault());
  dl.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); void downloadAttachment(a); });
  bar.append(name, meta, dl);
  return bar;
}

/** Build the DOM for an embedded attachment (URL filled in asynchronously). */
export function buildAttachmentEmbed(a: Attachment, opts: { target?: string; width?: number; height?: number } = {}): HTMLElement {
  ensureAttachmentStyles();
  const kind = attachmentKind(a);
  const target = opts.target ?? a.name;
  const withUrl = (f: (url: string) => void, onErr: (msg: string) => void) => {
    const known = peekAttachmentUrl(a.id);
    if (known) f(known);
    else getAttachmentUrl(a).then(f, (e) => onErr(e instanceof Error ? e.message : 'Could not load file'));
  };
  if (kind === 'image') {
    const img = el('img', 'md-embed-image md-att-img');
    img.alt = a.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    if (opts.width) img.width = opts.width;
    if (opts.height) img.height = opts.height;
    else if (!opts.width && a.width && a.height) img.style.aspectRatio = `${a.width} / ${a.height}`;
    img.dataset.attachmentId = a.id;
    img.classList.add('is-loading');
    withUrl((u) => { img.src = u; img.classList.remove('is-loading'); }, (m) => { img.classList.remove('is-loading'); img.alt = `${a.name} — ${m}`; img.classList.add('is-error'); });
    return img;
  }
  const box = el('span', `md-att-box md-att-${kind}`);
  box.dataset.attachmentId = a.id;
  box.appendChild(toolbar(a, target));
  const status = (msg: string) => { const s = el('span', 'md-att-status'); s.textContent = msg; return s; };
  if (kind === 'pdf') {
    const frame = el('iframe', 'md-att-frame');
    frame.title = a.name;
    frame.setAttribute('loading', 'lazy');
    if (opts.height) frame.style.height = `${opts.height}px`;
    const wait = status('Loading PDF…');
    box.appendChild(wait);
    withUrl((u) => { frame.src = u; wait.replaceWith(frame); }, (m) => { wait.textContent = m; });
  } else if (kind === 'audio' || kind === 'video') {
    const media = el(kind, 'md-att-media') as HTMLMediaElement;
    media.controls = true;
    media.preload = 'metadata';
    media.setAttribute('aria-label', a.name);
    if (kind === 'video' && opts.width) (media as HTMLVideoElement).width = opts.width;
    const wait = status('Loading…');
    box.appendChild(wait);
    withUrl((u) => { media.src = u; wait.replaceWith(media); }, (m) => { wait.textContent = m; });
  } else {
    box.classList.add('md-att-chip');
  }
  return box;
}

/** Replace `[data-att-embed]` placeholders inside root with live embeds. */
export function hydrateAttachments(root: HTMLElement | null | undefined, index: VaultIndex | null | undefined) {
  if (!root || !index) return;
  root.querySelectorAll<HTMLElement>('[data-att-embed]:not([data-hydrated])').forEach((ph) => {
    ph.dataset.hydrated = '1';
    const a = index.attachmentsById.get(ph.dataset.attEmbed ?? '');
    if (!a) return;
    const node = buildAttachmentEmbed(a, { target: ph.dataset.target, width: Number(ph.dataset.width) || undefined, height: Number(ph.dataset.height) || undefined });
    ph.replaceChildren(node);
    ph.classList.add('is-hydrated');
  });
}

const CSS = `
.md-att { display: inline; }
div.md-att { display: block; margin: .3em 0 1em; }
.md-att-img { max-width: 100%; height: auto; border-radius: 6px; display: inline-block; vertical-align: bottom; }
.md-att-img.is-loading { min-height: 48px; min-width: 96px; background: var(--mdv-code-bg, #f3f4f6); }
.md-att-img.is-error { min-height: 0; padding: 4px 8px; border: 1px dashed var(--mdv-border, #e5e7eb); color: var(--mdv-faint, #9ca3af); font-size: 13px; }
.md-att-box { display: block; border: 1px solid var(--mdv-border, #e5e7eb); border-radius: 8px; background: var(--mdv-embed-bg, transparent); overflow: hidden; margin: .3em 0 1em; max-width: 100%; }
.md-att-chip { display: inline-flex; max-width: 100%; margin: 0 .15em; vertical-align: middle; }
.md-att-bar { display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 10px; font-size: 13px; line-height: 1.3; min-width: 0; }
.md-att-box:not(.md-att-chip) .md-att-bar { border-bottom: 1px solid var(--mdv-border, #e5e7eb); }
.md-att-name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; font-weight: 500; color: var(--mdv-accent, #2563eb) !important; cursor: pointer; }
.md-att-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.md-att-name svg { flex-shrink: 0; }
.md-att-meta { color: var(--mdv-faint, #9ca3af); font-size: 12px; white-space: nowrap; margin-left: auto; }
.md-att-btn { display: inline-flex; padding: 4px; border-radius: 6px; color: var(--mdv-muted, #6b7280); background: transparent; border: 0; cursor: pointer; }
.md-att-btn:hover { background: var(--mdv-accent-soft, rgba(37,99,235,.1)); color: var(--mdv-text, #111); }
.md-att-frame { display: block; width: 100%; height: 500px; border: 0; background: #fff; }
.md-att-media { display: block; width: 100%; max-width: 100%; }
audio.md-att-media { padding: 8px; box-sizing: border-box; }
video.md-att-media { background: #000; max-height: 70vh; }
.md-att-status { display: block; padding: 18px; text-align: center; font-size: 13px; color: var(--mdv-faint, #9ca3af); }
.md-att-preview { padding: 10px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.md-att-preview img { max-width: 100%; max-height: 260px; border-radius: 6px; }
.md-att-preview .md-att-box { width: 100%; margin: 0; }
.md-att-preview .md-att-frame { height: 260px; }
.cm-lp-upload { display: inline-flex; align-items: center; gap: 6px; padding: 1px 8px; margin: 0 2px; border-radius: 999px; font-size: 12.5px; color: var(--mdv-muted, #6b7280); background: var(--mdv-accent-soft, rgba(37,99,235,.1)); vertical-align: baseline; }
.cm-lp-upload::before { content: ''; width: 10px; height: 10px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: cm-up-spin .8s linear infinite; }
@keyframes cm-up-spin { to { transform: rotate(360deg); } }
.cm-lp-att { display: block; white-space: normal; cursor: default; }
`;
let injected = false;
export function ensureAttachmentStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.dataset.vault = 'attachments';
  s.textContent = CSS;
  document.head.appendChild(s);
}
