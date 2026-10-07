/**
 * Obsidian-style "page preview": hovering an internal link (~400 ms) shows the
 * target note rendered in a popover. `useLinkPreview` is shared by the reading
 * view and the editor (Cmd/Ctrl-hover in Live Preview / source).
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VaultIndex } from '../../../shared/notes';
import { sectionUnder, blockText, parseFrontmatter, canvasText } from '../../../shared/notes';
import type { OpenLinkOpts } from './types';
import { ensureStyles } from './styles';
import { renderSafe, resolverFor, handleRenderedClick, handleRenderedKey, highlightCodeBlocks } from './render';
import { attachmentFor, fileRendererFor, hydrateAttachments, buildAttachmentEmbed } from './attachmentEmbeds';
import { formatBytes } from '../attachmentUtils';

export interface PreviewLink { target: string; heading?: string; block?: string }

interface PreviewState { link: PreviewLink; rect: DOMRect; fromId?: string }

export interface LinkPreviewProps extends PreviewState {
  index: VaultIndex;
  onOpenLink: (target: string, opts: OpenLinkOpts) => void;
  onTagClick?: (tag: string) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClose?: () => void;
}

/** The popover itself (portal to <body>). */
export function LinkPreview({ link, rect, fromId, index, onOpenLink, onTagClick, onMouseEnter, onMouseLeave, onClose }: LinkPreviewProps) {
  ensureStyles();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: rect.left, top: rect.bottom + 6 });
  const file = attachmentFor(index, link.target, fromId);
  const note = file ? null : index.resolve(link.target, fromId);
  const fileRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = fileRef.current;
    if (!host || !file) return;
    host.replaceChildren(buildAttachmentEmbed(file, { target: link.target }));
  }, [file, link.target]);
  const html = useMemo(() => {
    if (!note) return '';
    let md: string | null = null;
    if (link.block) md = blockText(note.content, link.block);
    else if (link.heading) md = sectionUnder(note.content, link.heading);
    const body = note.kind === 'canvas' ? canvasText(note.content) : md ?? parseFrontmatter(note.content).body;
    return renderSafe(body, { resolve: resolverFor(index), fromId: note.id, maxChars: 1500, depth: 2, bodyOnly: true, renderFile: fileRendererFor(index) });
  }, [note, link.block, link.heading, index]);

  const inner = useMemo(() => ({ __html: html }), [html]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight, w = el.offsetWidth;
    const vw = window.innerWidth, vh = window.innerHeight;
    const below = rect.bottom + 6 + h <= vh - 8;
    const top = below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - h);
    const left = Math.min(Math.max(8, rect.left), vw - w - 8);
    setPos({ left, top });
  }, [rect, html]);

  useEffect(() => { if (ref.current) { highlightCodeBlocks(ref.current); hydrateAttachments(ref.current, index); } }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlers = { onOpenLink: (t: string, o: OpenLinkOpts) => { onClose?.(); onOpenLink(t, o); }, onTagClick: (t: string) => { onClose?.(); onTagClick?.(t); } };
  const title = file ? file.name : note ? note.title + (link.heading ? ` › ${link.heading}` : link.block ? ` › ^${link.block}` : '') : link.target;

  return createPortal(
    <div
      ref={ref}
      className="mdv-root mdv-preview"
      role="dialog"
      aria-label={`Preview of ${title}`}
      style={{ left: pos.left, top: pos.top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="mdv-preview-title">
        <span className="truncate">{title}</span>
        <button type="button" onClick={(e) => { onClose?.(); onOpenLink(link.target, { newTab: e.metaKey || e.ctrlKey, heading: link.heading, block: link.block }); }}>
          {note || file ? 'Open' : 'Create'}
        </button>
      </div>
      {file ? (
        <div className="mdv">
          <div className="md-att-preview" ref={fileRef} />
          <div style={{ color: 'var(--mdv-faint)', fontSize: 12, textAlign: 'center' }}>{file.folder ? `${file.folder}/` : ''}{file.name} · {formatBytes(file.size)}</div>
        </div>
      ) : note ? (
        html.trim()
          ? <div className="mdv" onClick={(e) => handleRenderedClick(e, { ...handlers, root: ref.current })} onKeyDown={(e) => handleRenderedKey(e, { ...handlers, root: ref.current })} dangerouslySetInnerHTML={inner} />
          : <div className="mdv" style={{ color: 'var(--mdv-faint)', fontStyle: 'italic' }}>Empty note</div>
      ) : (
        <div className="mdv" style={{ color: 'var(--mdv-faint)', fontStyle: 'italic' }}>“{link.target}” doesn’t exist yet. Click Create to make it.</div>
      )}
    </div>,
    document.body,
  );
}

export interface UseLinkPreviewOpts {
  index: VaultIndex;
  onOpenLink: (target: string, opts: OpenLinkOpts) => void;
  onTagClick?: (tag: string) => void;
  delay?: number;
}

/**
 * Hover-preview controller. Call `schedule(anchorEl, link, fromId)` on hover,
 * `leave()` on mouse out; render `element` anywhere.
 */
export function useLinkPreview({ index, onOpenLink, onTagClick, delay = 400 }: UseLinkPreviewOpts) {
  const [state, setState] = useState<PreviewState | null>(null);
  const showTimer = useRef<number | undefined>(undefined);
  const hideTimer = useRef<number | undefined>(undefined);
  const anchorKey = useRef<string | null>(null);

  const clear = () => { window.clearTimeout(showTimer.current); window.clearTimeout(hideTimer.current); };
  const hide = useCallback(() => { clear(); anchorKey.current = null; setState(null); }, []);

  const schedule = useCallback((anchor: HTMLElement | DOMRect, link: PreviewLink, fromId?: string, immediate = false) => {
    const key = `${link.target}#${link.heading ?? ''}^${link.block ?? ''}`;
    window.clearTimeout(hideTimer.current);
    if (anchorKey.current === key && state) return;
    window.clearTimeout(showTimer.current);
    anchorKey.current = key;
    const open = () => {
      const rect = anchor instanceof DOMRect ? anchor : anchor.getBoundingClientRect();
      if (!(anchor instanceof DOMRect) && !anchor.isConnected) return;
      setState({ link, rect, fromId });
    };
    if (immediate) open(); else showTimer.current = window.setTimeout(open, delay);
  }, [delay, state]);

  const leave = useCallback(() => {
    window.clearTimeout(showTimer.current);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => { anchorKey.current = null; setState(null); }, 300);
  }, []);

  useEffect(() => () => clear(), []);

  const element = state ? (
    <LinkPreview
      {...state}
      index={index}
      onOpenLink={onOpenLink}
      onTagClick={onTagClick}
      onMouseEnter={() => window.clearTimeout(hideTimer.current)}
      onMouseLeave={leave}
      onClose={hide}
    />
  ) : null;

  return { schedule, leave, hide, open: !!state, element };
}
