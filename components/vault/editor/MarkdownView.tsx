/**
 * Reading view: the note rendered with Obsidian semantics (wikilinks, embeds,
 * callouts, tags, highlights, tasks, footnotes), sanitised with DOMPurify,
 * with hover page-previews and lazily highlighted code blocks.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import type { MarkdownViewProps, OpenLinkOpts } from './types';
import { ensureStyles } from './styles';
import { renderSafe, resolverFor, handleRenderedClick, handleRenderedKey, highlightCodeBlocks } from './render';
import { useLinkPreview } from './LinkPreview';
import { fileRendererFor, hydrateAttachments, ensureAttachmentStyles } from './attachmentEmbeds';

export function MarkdownView({ note, index, onOpenLink, onTagClick, onToggleTask, readableLineLength = true }: MarkdownViewProps) {
  ensureStyles();
  ensureAttachmentStyles();
  const root = useRef<HTMLDivElement>(null);
  const html = useMemo(
    () => renderSafe(note.content, { resolve: resolverFor(index), fromId: note.id, interactiveTasks: !!onToggleTask, renderFile: fileRendererFor(index) }),
    [note.content, note.id, index, !!onToggleTask],
  );
  // A stable object: React re-applies innerHTML whenever this identity changes,
  // which would wipe hydrated attachment embeds / highlighted code on every re-render.
  const inner = useMemo(() => ({ __html: html }), [html]);
  const preview = useLinkPreview({ index, onOpenLink, onTagClick });

  useEffect(() => { if (root.current) { highlightCodeBlocks(root.current); hydrateAttachments(root.current, index); } }, [html]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { preview.hide(); }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlers = {
    onOpenLink: (t: string, o: OpenLinkOpts) => { preview.hide(); onOpenLink(t, o); },
    onTagClick, onToggleTask,
  };

  const onMouseOver = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('.internal-link');
    if (!a || a.classList.contains('md-embed-title') || a.classList.contains('md-att-name')) return;
    const target = a.dataset.href ?? '';
    if (!target && !a.dataset.heading) return;
    preview.schedule(a, { target, heading: a.dataset.heading, block: a.dataset.block }, note.id);
  };
  const onMouseOut = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest('.internal-link');
    if (!a) return;
    const to = e.relatedTarget as Node | null;
    if (to && a.contains(to)) return;
    preview.leave();
  };

  return (
    <div className="mdv-root">
      {/* Rendered note. Links are role=link with tabindex; Enter activates. */}
      <div
        ref={root}
        className={`mdv mdv-page${readableLineLength ? ' mdv-readable' : ''}`}
        data-note-id={note.id}
        onClick={(e) => handleRenderedClick(e, { ...handlers, root: root.current })}
        onAuxClick={(e) => { if (e.button === 1) handleRenderedClick(e, { ...handlers, root: root.current }); }}
        onKeyDown={(e) => handleRenderedKey(e, { ...handlers, root: root.current })}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        dangerouslySetInnerHTML={inner}
      />
      {preview.element}
    </div>
  );
}
