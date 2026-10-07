/**
 * Canvas node renderers: text (Markdown, editable), file (vault note with
 * subpath, nested canvas, or attachment), link (web page with optional
 * sandboxed preview) and group. Memoised so panning/dragging one card never
 * re-renders the other few hundred.
 */
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, LayoutDashboard, FileQuestion, ExternalLink, Eye, EyeOff, Music, Film, File as FileIcon, Image as ImageIcon } from 'lucide-react';
import type { Note, Attachment } from '../../../types';
import type { CanvasNode, FileNode, GroupNode, LinkNode, TextNode, VaultIndex } from '../../../shared/notes';
import { canvasColor, sectionUnder, blockText, attachmentKind } from '../../../shared/notes';
import { MarkdownView, type OpenLinkOpts } from '../editor';
import { useAttachmentUrl } from '../attachments';
import { HANDLES, urlParts } from './model';

export interface CardCtx {
  index: () => VaultIndex;
  canvasNote: () => Note;
  openLink: (target: string, opts: OpenLinkOpts) => void;
  openFile: (node: FileNode, newTab: boolean) => void;
  tagClick: (tag: string) => void;
  editText: (id: string, text: string) => void;
  toggleTask: (id: string, line: number) => void;
  setGroupLabel: (id: string, label: string) => void;
  endEdit: () => void;
}

/** What a file card shows (resolved by the parent so memo can compare identities). */
export type FileTarget = { kind: 'note'; note: Note } | { kind: 'attachment'; attachment: Attachment } | { kind: 'missing' };

export function resolveFile(index: VaultIndex, file: string, fromId: string): FileTarget {
  const target = file.replace(/\.md$/i, '');
  const looksLikeFile = /\.[a-z0-9]{1,8}$/i.test(file) && !/\.md$/i.test(file);
  const att = looksLikeFile ? index.resolveAttachment?.(file, fromId) : null;
  if (att) return { kind: 'attachment', attachment: att };
  const note = index.resolve(target, fromId);
  if (note) return { kind: 'note', note };
  const att2 = index.resolveAttachment?.(file, fromId);
  return att2 ? { kind: 'attachment', attachment: att2 } : { kind: 'missing' };
}

export interface NodeViewProps {
  node: CanvasNode;
  selected: boolean;
  /** Only selected node shows resize handles. */
  single: boolean;
  editing: boolean;
  /** Identity that changes when the card's external inputs change (resolved file, index for linky text). */
  dep: unknown;
  dropTarget?: boolean;
  ctx: CardCtx;
}

export const NodeView = memo(function NodeView({ node, selected, single, editing, dep, dropTarget, ctx }: NodeViewProps) {
  const color = canvasColor(node.color);
  const style = { transform: `translate(${node.x}px, ${node.y}px)`, width: node.width, height: node.height, ...(color ? { '--cv-color': color } : {}) } as React.CSSProperties;
  return (
    <div
      className={`cv-node cv-${node.type}${selected ? ' cv-sel' : ''}${dropTarget ? ' cv-drop' : ''}`}
      data-node-id={node.id}
      data-type={node.type}
      {...(color ? { 'data-color': '' } : {})}
      style={style}
    >
      {node.type === 'group' ? <GroupBody node={node} editing={editing} ctx={ctx} />
        : <div className="cv-card">
          {node.type === 'text' ? <TextBody node={node} editing={editing} ctx={ctx} />
            : node.type === 'file' ? <FileBody node={node} target={dep as FileTarget} ctx={ctx} />
              : <LinkBody node={node} />}
        </div>}
      {(['top', 'right', 'bottom', 'left'] as const).map((s) => <div key={s} className="cv-conn" data-conn={s} aria-hidden />)}
      {selected && single && !editing ? HANDLES.map((h) => <div key={h} className="cv-rs" data-resize={h} aria-hidden />) : null}
    </div>
  );
});

// ------------------------------------------------------------------ text

function TextBody({ node, editing, ctx }: { node: TextNode; editing: boolean; ctx: CardCtx }) {
  const canvas = ctx.canvasNote();
  if (editing) return <TextEditor node={node} ctx={ctx} />;
  return (
    <div className="cv-scroll cv-detail">
      <div className="cv-text-body">
        {node.text.trim() ? <Markdown content={node.text} canvas={canvas} ctx={ctx} onToggleTask={(l) => ctx.toggleTask(node.id, l)} />
          : <span style={{ color: 'var(--cv-muted)' }}>Double-click to edit</span>}
      </div>
    </div>
  );
}

function TextEditor({ node, ctx }: { node: TextNode; ctx: CardCtx }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className="cv-edit"
      value={node.text}
      aria-label="Card text"
      spellCheck
      placeholder="Type Markdown…"
      onChange={(e) => ctx.editText(node.id, e.target.value)}
      onBlur={() => ctx.endEdit()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); ctx.endEdit(); }
      }}
    />
  );
}

/** MarkdownView over a synthetic note so links resolve relative to the canvas. */
function Markdown({ content, canvas, ctx, onToggleTask }: { content: string; canvas: Note; ctx: CardCtx; onToggleTask?: (line: number) => void }) {
  const note = useMemo(() => ({ ...canvas, kind: 'note', content } as Note), [canvas.id, canvas.title, canvas.folder, content]); // eslint-disable-line react-hooks/exhaustive-deps
  return <MarkdownView note={note} index={ctx.index()} onOpenLink={ctx.openLink} onTagClick={ctx.tagClick} onToggleTask={onToggleTask} readableLineLength={false} />;
}

// ------------------------------------------------------------------ file

function FileBody({ node, target, ctx }: { node: FileNode; target: FileTarget; ctx: CardCtx }) {
  if (!target || target.kind === 'missing') {
    return (
      <div className="cv-chip">
        <FileQuestion size={22} />
        <div><b>{node.file.replace(/\.md$/i, '')}</b></div>
        <div>File not found</div>
      </div>
    );
  }
  if (target.kind === 'attachment') return <AttachmentBody attachment={target.attachment} />;
  const n = target.note;
  const isCanvas = n.kind === 'canvas';
  const sub = node.subpath?.replace(/^#/, '');
  const body = isCanvas ? '' : !sub ? n.content : sub.startsWith('^') ? blockText(n.content, sub.slice(1)) ?? n.content : sectionUnder(n.content, sub) ?? n.content;
  return (
    <>
      <div className="cv-file-head">
        {isCanvas ? <LayoutDashboard size={14} className="shrink-0 opacity-60" /> : <FileText size={14} className="shrink-0 opacity-60" />}
        <button type="button" title="Open (double-click card)" onClick={() => ctx.openFile(node, true)}>{n.title}{node.subpath ? <span style={{ color: 'var(--cv-muted)', fontWeight: 400 }}> {node.subpath}</span> : null}</button>
      </div>
      {isCanvas ? <div className="cv-chip cv-detail"><LayoutDashboard size={22} /><span>Canvas</span></div>
        : <div className="cv-scroll cv-detail cv-file-body"><Markdown content={body} canvas={n} ctx={ctx} /></div>}
    </>
  );
}

function AttachmentBody({ attachment }: { attachment: Attachment }) {
  const kind = attachmentKind(attachment);
  const { url, error } = useAttachmentUrl(attachment);
  const chip = (icon: React.ReactNode, msg?: string) => (
    <div className="cv-chip">{icon}<div><b>{attachment.name}</b></div>{msg ? <div>{msg}</div> : null}</div>
  );
  if (error) return chip(<FileQuestion size={22} />, error);
  if (!url) return chip(<FileIcon size={22} />, 'Loading…');
  switch (kind) {
    case 'image': return <div className="cv-media"><img src={url} alt={attachment.name} draggable={false} /></div>;
    case 'pdf': return <div className="cv-media"><iframe src={url} title={attachment.name} /></div>;
    case 'audio': return <div className="cv-media" style={{ flexDirection: 'column', gap: 8, padding: 12 }}><Music size={22} style={{ color: 'var(--cv-muted)' }} /><audio src={url} controls style={{ width: '100%' }} /></div>;
    case 'video': return <div className="cv-media"><video src={url} controls style={{ width: '100%', height: '100%' }} /></div>;
    default: return chip(kind === 'other' ? <FileIcon size={22} /> : <ImageIcon size={22} />, 'No preview');
  }
}

// ------------------------------------------------------------------ link

function LinkBody({ node }: { node: LinkNode }) {
  const [preview, setPreview] = useState(false);
  const { host, path } = urlParts(node.url);
  const safe = /^https?:\/\//i.test(node.url);
  return (
    <div className="cv-link" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="cv-link-head">
        {safe ? <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`} alt="" draggable={false} onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <Film size={16} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host}</div>
          {path ? <div style={{ fontSize: 12, color: 'var(--cv-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{path}</div> : null}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, padding: '0 12px 10px', flexShrink: 0 }}>
        {safe ? <a className="cv-link-btn" href={node.url} target="_blank" rel="noopener noreferrer" draggable={false}><ExternalLink size={12} />Open</a> : null}
        {safe ? <button type="button" className="cv-link-btn" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>{preview ? <EyeOff size={12} /> : <Eye size={12} />}{preview ? 'Hide preview' : 'Preview'}</button> : null}
      </div>
      {preview && safe ? (
        <div className="cv-detail" style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--cv-card-border)' }}>
          <iframe src={node.url} title={host} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" referrerPolicy="no-referrer" loading="lazy" />
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ group

function GroupBody({ node, editing, ctx }: { node: GroupNode; editing: boolean; ctx: CardCtx }) {
  return (
    <>
      <div className="cv-group-box" />
      {editing ? (
        <div className="cv-group-label"><GroupLabelInput node={node} ctx={ctx} /></div>
      ) : node.label ? <div className="cv-group-label" data-group-label>{node.label}</div> : null}
    </>
  );
}

function GroupLabelInput({ node, ctx }: { node: GroupNode; ctx: CardCtx }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      defaultValue={node.label ?? ''}
      aria-label="Group name"
      placeholder="Group name"
      size={Math.max(8, (node.label ?? '').length + 2)}
      onBlur={(e) => { ctx.setGroupLabel(node.id, e.target.value.trim()); ctx.endEdit(); }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
        if (e.key === 'Escape') { e.preventDefault(); (e.target as HTMLInputElement).value = node.label ?? ''; (e.target as HTMLInputElement).blur(); }
      }}
    />
  );
}
