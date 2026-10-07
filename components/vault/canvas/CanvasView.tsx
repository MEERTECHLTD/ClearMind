/**
 * Obsidian-style Canvas editor for a vault note of kind 'canvas' (JSON Canvas 1.0).
 *
 * - Infinite board: pan (drag empty space, Space+drag, middle button, wheel /
 *   two-finger scroll, one-finger touch), zoom (Ctrl/Cmd+wheel, trackpad &
 *   touch pinch, buttons, fit, selection). The viewport is a CSS transform on
 *   the world layer written outside React, so cards don't re-render on pan.
 * - Cards: text (Markdown), file (note / subpath / nested canvas / attachment),
 *   link (web page) and group; select, marquee, move (grid snap, Alt = free),
 *   resize, connect, reconnect, label, colour, align, duplicate, copy/paste,
 *   undo/redo. Pure logic lives in ./model.
 * - Persistence: debounced saveContent, flushed on blur/unmount/tab switch;
 *   external changes (sync, link rewrites) merge in when idle.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, Star, MoreHorizontal, LayoutDashboard, TriangleAlert, FileText, Globe, Image as ImageIcon, Upload, StickyNote, SquareDashed, Copy, Trash2, Pencil, ClipboardPaste, ExternalLink } from 'lucide-react';
import type { Note, Attachment } from '../../../types';
import {
  parseCanvas, serializeCanvas, canvasId, canvasBounds, sidePoint, quickSwitch, attachmentKind, attachmentPath, EMPTY_CANVAS,
  type CanvasData, type CanvasNode, type CanvasSide, type FileNode, type VaultIndex,
} from '../../../shared/notes';
import { toggleTaskLine } from '../../../shared/notes/markdown';
import { saveContent, toggleBookmark } from '../useVault';
import { uploadFiles } from '../attachments';
import { attachmentFolderFor } from '../attachmentUtils';
import type { NoteTab } from '../workspace';
import { fuzzyScore } from '../workspace';
import { useVaultApi, vx, ContextMenu, SuggestModal, FuzzyText, type MenuItemDef } from '../shell';
import { TitleInput } from '../NotePane';
import {
  historyReducer, initHistory, screenToWorld, zoomAt, fitRect, centerOn, normRect, nodesInRect, nodeAt, snapDelta, dragSet, moveFrom, resizeRect,
  updateNode, updateEdge, deleteItems, freeSpot, addEdge, reconnectEdge, flipEdge, setArrowMode, arrowMode, nearestSide, sideFacing, rectForDrop,
  curve, edgeGeometry, clipboardFor, parsePaste, insertClip, duplicate, alignNodes, distributeNodes, selectionBounds, drawOrder, fileNodePath,
  normalizeUrl, moveNodes, isBrokenCanvas, DEFAULT_SIZE, GRID, type Point, type Rect, type Viewport, type Handle, type EdgeGeom,
} from './model';
import { createViewportStore, loadViewport, saveViewport } from './viewport';
import { NodeView, resolveFile, type CardCtx, type FileTarget } from './cards';
import { EdgeView, EdgeLabel, EdgeOverlay } from './edges';
import { AddDock, ViewControls, SelectionToolbar, type SelectionActions } from './toolbars';
import { ensureCanvasStyles } from './styles';

export interface CanvasViewProps {
  paneId: string;
  tab: NoteTab;
  note: Note | undefined;
  activePane: boolean;
  registerFlush: (paneId: string, f: (() => void) | null) => void;
  renameNonce: number;
  onNavigate: (dir: -1 | 1) => void;
  onClose: () => void;
}

const SAVE_DELAY = 500;
const DND_NOTE = 'application/x-vault-note';
const DND_ATTACHMENT = 'application/x-vault-attachment';


export function CanvasView(props: CanvasViewProps) {
  if (!props.note) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className={`text-sm ${vx.muted}`}>This canvas no longer exists.</p>
        <button onClick={props.onClose} className={`px-3 py-1.5 rounded-md text-sm ${vx.hover} border ${vx.border} ${vx.text}`}>Close tab</button>
      </div>
    );
  }
  return <CanvasEditor key={props.note.id} {...props} note={props.note} />;
}

type Sel = { nodes: Set<string>; edges: Set<string> };
const NO_SEL: Sel = { nodes: new Set(), edges: new Set() };
type Editing = { kind: 'node' | 'edge'; id: string } | null;
type Gesture =
  | { kind: 'pan'; start: Point; vp: Viewport; moved: boolean }
  | { kind: 'marquee'; start: Point; startW: Point; base: Set<string>; moved: boolean; additive: boolean }
  | { kind: 'move'; start: Point; nodeId: string; ids: Set<string> | null; before: CanvasData; primary: Point; moved: boolean; mod: boolean; shift: boolean; wasSelected: boolean }
  | { kind: 'resize'; start: Point; id: string; handle: Handle; rect: Rect; before: CanvasData; moved: boolean }
  | { kind: 'connect'; start: Point; fromNode: string; fromSide: CanvasSide; edgeId?: string; end?: 'from' | 'to'; moved: boolean }
  | { kind: 'pinch'; dist: number; mid: Point; vp: Viewport };
type Conn = { geom: EdgeGeom; target: string | null };

const MISSING: FileTarget = { kind: 'missing' };
const targetCache = new WeakMap<object, FileTarget>();
const fileTargetOf = (index: VaultIndex, file: string, fromId: string): FileTarget => {
  const t = resolveFile(index, file, fromId);
  if (t.kind === 'missing') return MISSING;
  const key = t.kind === 'note' ? t.note : t.attachment;
  let hit = targetCache.get(key);
  if (!hit) { hit = t; targetCache.set(key, t); }
  return hit;
};
const INTERACTIVE = 'textarea, input, select, audio, video, a[href], button, label, iframe';

function CanvasEditor({ paneId, tab, note, activePane, registerFlush, renameNonce, onNavigate }: CanvasViewProps & { note: Note }) {
  ensureCanvasStyles();
  const api = useVaultApi();
  const apiRef = useRef(api); apiRef.current = api;
  const noteRef = useRef(note); noteRef.current = note;
  const index = api.vault.index;

  // ---------------------------------------------------------------- document & history
  const [broken, setBroken] = useState(() => isBrokenCanvas(note.content));
  const [hist, dispatch] = useReducer(historyReducer, note.content, (c: string) => initHistory(parseCanvas(c)));
  const data = hist.present;
  const dataRef = useRef(data); dataRef.current = data;
  const histRef = useRef(hist); histRef.current = hist;
  const apply = useCallback((d: CanvasData, record = true) => dispatch({ type: 'apply', data: d, record }), []);

  const [sel, setSelState] = useState<Sel>(NO_SEL);
  const selRef = useRef(sel); selRef.current = sel;
  const setSel = useCallback((s: Sel) => { selRef.current = s; setSelState(s); }, []);
  const [editing, setEditingState] = useState<Editing>(null);
  const editingRef = useRef<Editing>(null);
  const setEditing = (e: Editing) => { editingRef.current = e; setEditingState(e); };
  const editBefore = useRef<CanvasData | null>(null);
  const [mode, setMode] = useState<'pan' | 'select'>('pan');
  const [conn, setConn] = useState<Conn | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const [picker, setPicker] = useState<null | 'note' | 'media' | 'link'>(null);
  const [menu, setMenu] = useState<{ at: Point; items: MenuItemDef[] } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<Point | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- persistence
  const synced = useRef(note.content); // content known to match the store
  const syncedData = useRef(data);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  const brokenRef = useRef(broken); brokenRef.current = broken;

  const flush = useCallback(() => {
    if (timer.current) { window.clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || brokenRef.current) return;
    dirty.current = false;
    const s = serializeCanvas(dataRef.current);
    if (s === synced.current) return;
    synced.current = s;
    void saveContent(noteRef.current.id, s);
  }, []);

  useEffect(() => {
    if (data === syncedData.current) return;
    syncedData.current = data;
    dirty.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DELAY);
  }, [data, flush]);

  const gesture = useRef<Gesture | null>(null);
  // Outside changes (sync, rename rewrites, other pane) replace the board when we're idle.
  useEffect(() => {
    if (note.content === synced.current) return;
    if (dirty.current || gesture.current || editingRef.current) return;
    synced.current = note.content;
    const next = parseCanvas(note.content);
    syncedData.current = next;
    setBroken(isBrokenCanvas(note.content));
    dispatch({ type: 'reset', data: next });
  }, [note.content]);

  useEffect(() => {
    registerFlush(paneId, flush);
    const onHide = () => flush();
    const onVis = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('beforeunload', onHide);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      flush();
      registerFlush(paneId, null);
      window.removeEventListener('beforeunload', onHide);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [paneId, flush, registerFlush]);

  // ---------------------------------------------------------------- viewport
  const boardRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const savedVp = useMemo(() => loadViewport(note.id), []); // eslint-disable-line react-hooks/exhaustive-deps
  const vp = useMemo(() => createViewportStore(savedVp ?? { x: 0, y: 0, zoom: 1 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [board, setBoard] = useState({ width: 800, height: 600 });
  const boardSize = () => { const r = boardRef.current?.getBoundingClientRect(); return { width: r?.width || board.width, height: r?.height || board.height }; };

  useLayoutEffect(() => {
    let saveT: number | null = null;
    const applyVp = () => {
      const v = vp.get();
      const w = worldRef.current, b = boardRef.current;
      if (!w || !b) return;
      w.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
      let g = GRID * v.zoom;
      while (g < 14) g *= 2;
      b.style.backgroundSize = `${g}px ${g}px`;
      b.style.backgroundPosition = `${v.x - g / 2}px ${v.y - g / 2}px`;
      w.classList.toggle('cv-lod', v.zoom < 0.3);
      if (saveT) window.clearTimeout(saveT);
      saveT = window.setTimeout(() => saveViewport(noteRef.current.id, vp.get()), 300);
    };
    if (!savedVp) {
      const { width, height } = boardSize();
      const b = canvasBounds(dataRef.current.nodes);
      vp.set(b ? fitRect(b, width, height, 60, 1) : centerOn({ x: 0, y: 0 }, width, height, 1));
    }
    applyVp();
    const unsub = vp.subscribe(applyVp);
    return () => { unsub(); if (saveT) { window.clearTimeout(saveT); saveViewport(noteRef.current.id, vp.get()); } };
  }, [vp]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setBoard({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const anim = useRef<number | null>(null);
  const animateTo = useCallback((target: Viewport) => {
    if (anim.current) cancelAnimationFrame(anim.current);
    const from = vp.get(), t0 = performance.now(), D = 220;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3;
      vp.set({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, zoom: from.zoom + (target.zoom - from.zoom) * e });
      anim.current = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim.current = requestAnimationFrame(step);
  }, [vp]);
  const zoomBy = (f: number) => { const { width, height } = boardSize(); animateTo(zoomAt(vp.get(), f, { x: width / 2, y: height / 2 })); };
  const zoomReset = () => { const { width, height } = boardSize(); animateTo(zoomAt(vp.get(), 1 / vp.get().zoom, { x: width / 2, y: height / 2 })); };
  const zoomToRect = (r: Rect | null, maxZoom = 1) => { if (!r) return; const { width, height } = boardSize(); animateTo(fitRect(r, width, height, 60, maxZoom)); };
  const zoomFit = () => {
    const b = canvasBounds(dataRef.current.nodes);
    if (b) zoomToRect(b);
    else { const { width, height } = boardSize(); animateTo(centerOn({ x: 0, y: 0 }, width, height, 1)); }
  };
  const zoomSelection = () => zoomToRect(selectionBounds(dataRef.current, selRef.current.nodes, selRef.current.edges), 1.5);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = boardRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const toWorld = (p: Point) => screenToWorld(vp.get(), p);
  const viewCenter = (): Point => { const { width, height } = boardSize(); return toWorld({ x: width / 2, y: height / 2 }); };
  const lastPointer = useRef<Point | null>(null);

  // ---------------------------------------------------------------- editing helpers
  const select = (nodes: Iterable<string> = [], edges: Iterable<string> = []) => setSel({ nodes: new Set(nodes), edges: new Set(edges) });
  const focusBoard = () => boardRef.current?.focus({ preventScroll: true });

  const startEdit = (id: string, before?: CanvasData) => {
    const n = dataRef.current.nodes.find((x) => x.id === id);
    if (!n || broken) return;
    if (n.type === 'text') editBefore.current = before ?? dataRef.current;
    else if (n.type !== 'group') return;
    select([id]);
    setEditing({ kind: 'node', id });
  };
  const endEdit = useCallback(() => {
    if (!editingRef.current) return;
    if (editBefore.current) dispatch({ type: 'commit', before: editBefore.current });
    editBefore.current = null;
    setEditing(null);
    window.setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) focusBoard(); }, 0);
  }, []);

  /** Add nodes (one undo step) and select them. `edit` opens the first text card for typing. */
  const addNodes = (nodes: CanvasNode[], opts: { edit?: boolean; edges?: CanvasData['edges'] } = {}) => {
    if (broken || !nodes.length) return;
    const before = dataRef.current;
    const next = { nodes: [...before.nodes, ...nodes], edges: [...before.edges, ...(opts.edges ?? [])] };
    if (opts.edit && nodes[0].type === 'text') {
      apply(next, false);
      dataRef.current = next;
      startEdit(nodes[0].id, before);
    } else {
      apply(next);
      select(nodes.map((n) => n.id));
    }
  };
  const addText = (at?: Point, text = '') => {
    const c = at ?? viewCenter();
    const r = freeSpot(dataRef.current.nodes, c, DEFAULT_SIZE.text.width, DEFAULT_SIZE.text.height);
    addNodes([{ id: canvasId(), type: 'text', text, ...r }], { edit: !text });
  };
  const addFileNode = (target: Note | Attachment, at?: Point, offset = 0) => {
    const isNote = 'title' in target;
    const size = isNote ? ((target as Note).kind === 'canvas' ? DEFAULT_SIZE.canvasFile : DEFAULT_SIZE.file) : attachmentKind(target as Attachment) === 'audio' ? { width: 400, height: 120 } : DEFAULT_SIZE.media;
    const att = isNote ? null : (target as Attachment);
    const sized = att?.width && att?.height && attachmentKind(att) === 'image'
      ? { width: 400, height: Math.round(Math.max(60, Math.min(800, (400 * att.height) / att.width))) } : size;
    const c = at ?? viewCenter();
    const r = freeSpot(dataRef.current.nodes, { x: c.x + offset, y: c.y + offset }, sized.width, sized.height);
    const file = isNote ? fileNodePath(target as Note) : attachmentPath(target as Attachment);
    return { id: canvasId(), type: 'file' as const, file, ...r };
  };
  const addLink = (url: string, at?: Point) => {
    const c = at ?? viewCenter();
    const r = freeSpot(dataRef.current.nodes, c, DEFAULT_SIZE.link.width, DEFAULT_SIZE.link.height);
    addNodes([{ id: canvasId(), type: 'link', url, ...r }]);
  };
  const addGroup = () => {
    const s = selRef.current.nodes;
    const b = s.size ? selectionBounds(dataRef.current, s) : null;
    const r = b ? { x: b.x - 40, y: b.y - 40, width: b.width + 80, height: b.height + 80 } : freeSpot(dataRef.current.nodes, viewCenter(), DEFAULT_SIZE.group.width, DEFAULT_SIZE.group.height);
    const id = canvasId();
    addNodes([{ id, type: 'group', label: 'Group', ...r }]);
    window.setTimeout(() => startEdit(id), 0);
  };

  const deleteSelection = () => {
    const s = selRef.current;
    if (broken || (!s.nodes.size && !s.edges.size)) return;
    apply(deleteItems(dataRef.current, s.nodes, s.edges));
    setSel(NO_SEL);
  };
  const duplicateSelection = () => {
    if (broken || !selRef.current.nodes.size) return;
    const out = duplicate(dataRef.current, selRef.current.nodes);
    apply(out.data);
    select(out.ids);
  };
  const clip = useRef<string | null>(null);
  const copySelection = (e?: React.ClipboardEvent) => {
    const text = clipboardFor(dataRef.current, dragSet(dataRef.current, selRef.current.nodes));
    if (!text) return false;
    clip.current = text;
    if (e) { e.clipboardData.setData('text/plain', text); e.preventDefault(); }
    else void navigator.clipboard?.writeText(text).catch(() => {});
    return true;
  };
  const pasteText = (text: string) => {
    if (broken) return;
    const p = parsePaste(text);
    const at = lastPointer.current ?? viewCenter();
    if (!p) return;
    if (p.kind === 'canvas') {
      const out = insertClip(dataRef.current, p.data, { at: { x: at.x - 20, y: at.y - 20 } });
      apply(out.data);
      select(out.ids);
    } else if (p.kind === 'url') addLink(p.url, at);
    else addText(at, p.text);
  };
  const addFiles = async (files: File[], at?: Point) => {
    if (broken || !files.length) return;
    const folder = attachmentFolderFor(api.settings, noteRef.current.folder);
    const created = await uploadFiles(files, folder, { pasted: !files[0]?.name || /^image\.\w+$/.test(files[0].name) });
    if (!created.length) return;
    const nodes = created.map((a, i) => addFileNode(a, at, i * 40));
    addNodes(nodes);
  };

  // ---------------------------------------------------------------- opening
  const openFile = useCallback((node: FileNode, newTab: boolean) => {
    flush();
    const t = resolveFile(apiRef.current.vault.index, node.file, noteRef.current.id);
    const sub = node.subpath?.replace(/^#/, '');
    if (t.kind === 'note') apiRef.current.openNote(t.note.id, { newTab, paneId, ...(sub ? (sub.startsWith('^') ? { block: sub.slice(1) } : { heading: sub }) : {}) });
    else if (t.kind === 'attachment') apiRef.current.openAttachment?.(t.attachment.id, { newTab, paneId });
    else apiRef.current.toast(`“${node.file}” not found`);
  }, [flush, paneId]);

  const ctx = useMemo<CardCtx>(() => ({
    index: () => apiRef.current.vault.index,
    canvasNote: () => noteRef.current,
    openLink: (target, o) => {
      flush();
      if (!target.trim()) return;
      apiRef.current.openLink(target, noteRef.current, { newTab: true, heading: o.heading, block: o.block, paneId });
    },
    openFile,
    tagClick: (tag) => apiRef.current.openSearch(`tag:#${tag.replace(/^#/, '')}`),
    editText: (id, text) => apply(updateNode(dataRef.current, id, { text } as Partial<CanvasNode>), false),
    toggleTask: (id, line) => {
      const n = dataRef.current.nodes.find((x) => x.id === id);
      if (n?.type === 'text') apply(updateNode(dataRef.current, id, { text: toggleTaskLine(n.text, line) } as Partial<CanvasNode>));
    },
    setGroupLabel: (id, label) => {
      const n = dataRef.current.nodes.find((x) => x.id === id);
      if (n?.type === 'group' && (n.label ?? '') !== label) apply(updateNode(dataRef.current, id, { label: label || undefined } as Partial<CanvasNode>));
    },
    endEdit,
  }), [apply, endEdit, flush, openFile, paneId]);

  // ---------------------------------------------------------------- pointer gestures
  const pointers = useRef(new Map<number, Point>());
  const suppressClick = useRef(0);
  const frame = useRef<{ raf: number | null; ev: PointerEvent | null }>({ raf: null, ev: null });

  const process = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const p = local(e);
    const v = vp.get();
    switch (g.kind) {
      case 'pinch': {
        const [a, b] = [...pointers.current.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const z = zoomAt(g.vp, dist / Math.max(1, g.dist), g.mid);
        vp.set({ zoom: z.zoom, x: z.x + mid.x - g.mid.x, y: z.y + mid.y - g.mid.y });
        return;
      }
      case 'pan': {
        const dx = p.x - g.start.x, dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) < 3) return;
        g.moved = true;
        vp.set({ ...g.vp, x: g.vp.x + dx, y: g.vp.y + dy });
        return;
      }
      case 'marquee': {
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 3) return;
        g.moved = true;
        const r = normRect(g.startW, toWorld(p));
        setMarquee(r);
        const hit = nodesInRect(dataRef.current.nodes, r);
        setSel({ nodes: new Set([...g.base, ...hit]), edges: new Set() });
        return;
      }
      case 'move': {
        const dx = (p.x - g.start.x) / v.zoom, dy = (p.y - g.start.y) / v.zoom;
        if (!g.moved) {
          if (Math.hypot(p.x - g.start.x, p.y - g.start.y) < 4) return;
          g.moved = true;
          g.before = dataRef.current;
          g.ids = dragSet(g.before, new Set([...selRef.current.nodes, g.nodeId]));
          setDragging(true);
        }
        const d = e.altKey ? { x: dx, y: dy } : snapDelta(g.primary, dx, dy);
        apply(moveFrom(g.before, dataRef.current, g.ids!, d.x, d.y), false);
        return;
      }
      case 'resize': {
        const dx = (p.x - g.start.x) / v.zoom, dy = (p.y - g.start.y) / v.zoom;
        if (!g.moved && Math.hypot(dx, dy) < 2) return;
        if (!g.moved) { g.moved = true; setDragging(true); }
        apply(updateNode(dataRef.current, g.id, resizeRect(g.rect, g.handle, dx, dy, { grid: e.altKey ? undefined : GRID })), false);
        return;
      }
      case 'connect': {
        if (!g.moved && Math.hypot(p.x - g.start.x, p.y - g.start.y) < 4) return;
        g.moved = true;
        const d = dataRef.current;
        const from = d.nodes.find((n) => n.id === g.fromNode);
        if (!from) return;
        const w = toWorld(p);
        const target = nodeAt(d.nodes, w, new Set([g.fromNode]));
        const fp = sidePoint(from, g.fromSide);
        const geom = target ? (() => { const s = nearestSide(target, w); return curve(fp, g.fromSide, sidePoint(target, s), s); })() : curve(fp, g.fromSide, w, sideFacing(fp, w));
        setConn({ geom, target: target?.id ?? null });
        return;
      }
    }
  };

  const onWindowMove = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    frame.current.ev = e;
    if (frame.current.raf == null) frame.current.raf = requestAnimationFrame(() => { frame.current.raf = null; const ev = frame.current.ev; if (ev) process(ev); });
  };

  const finishGesture = (e: PointerEvent | null) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!g) return;
    if (frame.current.raf != null) { cancelAnimationFrame(frame.current.raf); frame.current.raf = null; if (frame.current.ev && e) process(frame.current.ev); }
    switch (g.kind) {
      case 'pan':
        if (boardRef.current) boardRef.current.style.cursor = spaceDown.current ? 'grab' : '';
        if (!g.moved && e) { setSel(NO_SEL); onTap(e); }
        else if (g.moved) suppressClick.current = performance.now() + 80;
        return;
      case 'marquee':
        setMarquee(null);
        if (!g.moved && !g.additive) setSel(NO_SEL);
        return;
      case 'move':
        if (g.moved) { dispatch({ type: 'commit', before: g.before }); suppressClick.current = performance.now() + 80; return; }
        if (!e) return;
        onTap(e);
        if (g.mod) { const n = dataRef.current.nodes.find((x) => x.id === g.nodeId); if (n?.type === 'file') openFile(n, true); return; }
        if (!g.shift && g.wasSelected && selRef.current.nodes.size > 1) select([g.nodeId]);
        return;
      case 'resize':
        if (g.moved) dispatch({ type: 'commit', before: g.before });
        return;
      case 'connect': {
        const c = connRef.current;
        setConn(null);
        if (!g.moved || !c || !e || broken) return;
        const d = dataRef.current;
        if (g.edgeId && g.end) {
          if (!c.target) return;
          apply(reconnectEdge(d, g.edgeId, g.end, c.target, c.geom.toSide));
          return;
        }
        if (c.target) {
          const out = addEdge(d, g.fromNode, g.fromSide, c.target, c.geom.toSide);
          if (out.id) { apply(out.data); select([], [out.id]); }
          return;
        }
        // Dropped on empty space → a new text card connected to it (Obsidian behaviour).
        const r = rectForDrop(c.geom.to, c.geom.toSide);
        const id = canvasId();
        const node: CanvasNode = { id, type: 'text', text: '', ...r };
        const withNode = { ...d, nodes: [...d.nodes, node] };
        const out = addEdge(withNode, g.fromNode, g.fromSide, id, c.geom.toSide);
        apply(out.data, false);
        dataRef.current = out.data;
        startEdit(id, d);
        return;
      }
    }
  };
  const connRef = useRef<Conn | null>(null); connRef.current = conn;

  const onWindowUp = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === 'pinch') { if (pointers.current.size < 2) { gesture.current = null; } }
    else if (g) finishGesture(e.type === 'pointercancel' ? null : e);
    if (!pointers.current.size) detach();
  };
  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void } | null>(null);
  const attach = () => {
    if (listeners.current) return;
    const l = { move: (e: PointerEvent) => onWindowMoveRef.current(e), up: (e: PointerEvent) => onWindowUpRef.current(e) };
    listeners.current = l;
    window.addEventListener('pointermove', l.move);
    window.addEventListener('pointerup', l.up);
    window.addEventListener('pointercancel', l.up);
  };
  const detach = () => {
    const l = listeners.current;
    if (!l) return;
    listeners.current = null;
    window.removeEventListener('pointermove', l.move);
    window.removeEventListener('pointerup', l.up);
    window.removeEventListener('pointercancel', l.up);
  };
  const onWindowMoveRef = useRef(onWindowMove); onWindowMoveRef.current = onWindowMove;
  const onWindowUpRef = useRef(onWindowUp); onWindowUpRef.current = onWindowUp;
  useEffect(() => () => detach(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const spaceDown = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    if (!boardRef.current?.contains(t) || t.closest('[data-cv-ui]') || e.button === 2) return;
    if (anim.current) { cancelAnimationFrame(anim.current); anim.current = null; }
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    attach();
    if (pointers.current.size === 2) {
      // Second finger: switch whatever was happening into a pinch.
      if (gesture.current && gesture.current.kind !== 'pinch') finishGesture(null);
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vp: vp.get() };
      return;
    }
    if (pointers.current.size > 2) return;
    const v = vp.get();
    if (e.button === 1 || spaceDown.current) {
      e.preventDefault();
      gesture.current = { kind: 'pan', start: p, vp: v, moved: false };
      if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
      return;
    }
    if (editingRef.current && t.closest('textarea, input')) return;
    if (broken) { gesture.current = { kind: 'pan', start: p, vp: v, moved: false }; return; }

    const connEl = t.closest<HTMLElement>('[data-conn]');
    const nodeEl = t.closest<HTMLElement>('[data-node-id]');
    if (connEl && nodeEl) {
      e.preventDefault();
      gesture.current = { kind: 'connect', start: p, fromNode: nodeEl.dataset.nodeId!, fromSide: connEl.dataset.conn as CanvasSide, moved: false };
      return;
    }
    const endEl = t.closest<SVGElement>('[data-edge-end]');
    if (endEl) {
      e.preventDefault();
      const edge = dataRef.current.edges.find((x) => x.id === endEl.dataset.edgeId);
      const a = dataRef.current.nodes.find((n) => n.id === edge?.fromNode), b = dataRef.current.nodes.find((n) => n.id === edge?.toNode);
      if (!edge || !a || !b) return;
      const geo = edgeGeometry(a, b, edge);
      const end = endEl.dataset.edgeEnd as 'from' | 'to';
      // The fixed end is where the preview starts from.
      gesture.current = end === 'to'
        ? { kind: 'connect', start: p, fromNode: edge.fromNode, fromSide: geo.fromSide, edgeId: edge.id, end, moved: false }
        : { kind: 'connect', start: p, fromNode: edge.toNode, fromSide: geo.toSide, edgeId: edge.id, end, moved: false };
      return;
    }
    const rsEl = t.closest<HTMLElement>('[data-resize]');
    if (rsEl && nodeEl) {
      e.preventDefault();
      const n = dataRef.current.nodes.find((x) => x.id === nodeEl.dataset.nodeId);
      if (n) gesture.current = { kind: 'resize', start: p, id: n.id, handle: rsEl.dataset.resize as Handle, rect: { x: n.x, y: n.y, width: n.width, height: n.height }, before: dataRef.current, moved: false };
      return;
    }
    const edgeEl = t.closest<HTMLElement | SVGElement>('[data-edge-id]');
    if (edgeEl) {
      const id = edgeEl.dataset.edgeId!;
      const s = selRef.current;
      if (e.shiftKey) { const edges = new Set(s.edges); if (edges.has(id)) edges.delete(id); else edges.add(id); setSel({ nodes: s.nodes, edges }); }
      else setSel({ nodes: new Set(), edges: new Set([id]) });
      gesture.current = null;
      return;
    }
    if (nodeEl) {
      const id = nodeEl.dataset.nodeId!;
      if (t.closest(INTERACTIVE) && !t.closest('.cv-file-head')) return;
      const s = selRef.current;
      const wasSelected = s.nodes.has(id);
      if (e.shiftKey) {
        const nodes = new Set(s.nodes);
        if (wasSelected) { nodes.delete(id); setSel({ nodes, edges: s.edges }); return; }
        nodes.add(id);
        setSel({ nodes, edges: s.edges });
      } else if (!wasSelected) setSel({ nodes: new Set([id]), edges: new Set() });
      const n = dataRef.current.nodes.find((x) => x.id === id)!;
      gesture.current = { kind: 'move', start: p, nodeId: id, ids: null, before: dataRef.current, primary: { x: n.x, y: n.y }, moved: false, mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, wasSelected };
      return;
    }
    // Empty space.
    if (e.shiftKey || (mode === 'select' && e.pointerType === 'mouse')) {
      gesture.current = { kind: 'marquee', start: p, startW: toWorld(p), base: e.shiftKey ? new Set(selRef.current.nodes) : new Set(), moved: false, additive: e.shiftKey };
    } else {
      gesture.current = { kind: 'pan', start: p, vp: v, moved: false };
      if (boardRef.current) boardRef.current.style.cursor = 'grabbing';
    }
  };

  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const touchDbl = useRef(0);
  /** Touch double-tap → the same as a double-click (browsers don't reliably synthesise dblclick with touch-action: none). */
  const onTap = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const now = performance.now(), prev = lastTap.current;
    if (prev && now - prev.t < 320 && Math.hypot(prev.x - e.clientX, prev.y - e.clientY) < 24) {
      lastTap.current = null;
      touchDbl.current = now;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      if (target) handleDouble(target as HTMLElement, e);
    } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    if (performance.now() - touchDbl.current < 600) return;
    handleDouble(e.target as HTMLElement, e);
  };
  const handleDouble = (t: HTMLElement, e: { clientX: number; clientY: number }) => {
    if (!boardRef.current?.contains(t) || t.closest('[data-cv-ui]') || t.closest('textarea, input') || broken) return;
    const w = toWorld(local(e));
    const edgeEl = t.closest<HTMLElement>('[data-edge-id]');
    if (edgeEl && !t.closest('[data-edge-end]')) { select([], [edgeEl.dataset.edgeId!]); setEditing({ kind: 'edge', id: edgeEl.dataset.edgeId! }); return; }
    const nodeEl = t.closest<HTMLElement>('[data-node-id]');
    if (nodeEl) {
      const n = dataRef.current.nodes.find((x) => x.id === nodeEl.dataset.nodeId);
      if (!n) return;
      if (n.type === 'text') { startEdit(n.id); return; }
      if (n.type === 'file') { openFile(n, true); return; }
      if (n.type === 'group') {
        if (t.closest('[data-group-label]') || w.y < n.y + 40) { startEdit(n.id); return; }
        addText(w);
      }
      return;
    }
    if (t.closest('[data-conn], [data-resize]')) return;
    addText(w);
  };

  // Wheel: native listener (non-passive) for pan / zoom.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-cv-ui]')) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      let dx = e.deltaX * unit, dy = e.deltaY * unit;
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        vp.set(zoomAt(vp.get(), Math.exp(-Math.max(-80, Math.min(80, dy)) * 0.01), p));
        return;
      }
      const sc = t.closest<HTMLElement>('.cv-sel .cv-scroll, textarea');
      if (sc && ((dy > 0 && sc.scrollTop + sc.clientHeight < sc.scrollHeight - 1) || (dy < 0 && sc.scrollTop > 0))) return;
      e.preventDefault();
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      const v = vp.get();
      vp.set({ ...v, x: v.x - dx, y: v.y - dy });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // Safari trackpad pinch.
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('gesturestart', stop);
    return () => { el.removeEventListener('wheel', onWheel); el.removeEventListener('gesturestart', stop); };
  }, [vp]);

  // ---------------------------------------------------------------- keyboard
  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, [data-cv-ui] [role=dialog]') || e.nativeEvent.isComposing) return;
    if (t.closest('[data-cv-ui]') && (e.key === 'Enter' || e.key === ' ')) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    const s = selRef.current;
    if (e.key === ' ' && !mod) { e.preventDefault(); if (!spaceDown.current) { spaceDown.current = true; if (boardRef.current) boardRef.current.style.cursor = 'grab'; } return; }
    if (mod && k === 'z') { e.preventDefault(); dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); return; }
    if (mod && k === 'y') { e.preventDefault(); dispatch({ type: 'redo' }); return; }
    if (mod && k === 'a') { e.preventDefault(); select(dataRef.current.nodes.map((n) => n.id), []); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (e.shiftKey && (e.code === 'Digit1')) { e.preventDefault(); zoomFit(); return; }
    if (e.shiftKey && (e.code === 'Digit2')) { e.preventDefault(); zoomSelection(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.25); return; }
    if (mod && e.key === '-') { e.preventDefault(); zoomBy(0.8); return; }
    if (mod && e.key === '0') { e.preventDefault(); zoomReset(); return; }
    if (mod) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); return; }
    if (e.key === 'Escape') { if (s.nodes.size || s.edges.size) { e.preventDefault(); setSel(NO_SEL); } return; }
    if (e.key === 'Enter' && s.nodes.size === 1) { e.preventDefault(); startEdit([...s.nodes][0]); return; }
    if (e.key === 'Enter' && s.edges.size === 1 && !s.nodes.size) { e.preventDefault(); setEditing({ kind: 'edge', id: [...s.edges][0] }); return; }
    const arrows: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const dir = arrows[e.key];
    if (dir && s.nodes.size && !broken) {
      e.preventDefault();
      const step = e.shiftKey ? GRID : 1;
      apply(moveNodes(dataRef.current, dragSet(dataRef.current, s.nodes), dir.x * step, dir.y * step));
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') { spaceDown.current = false; if (boardRef.current && !gesture.current) boardRef.current.style.cursor = ''; }
  };
  useEffect(() => {
    const blur = () => { spaceDown.current = false; if (boardRef.current) boardRef.current.style.cursor = ''; };
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, []);

  // ---------------------------------------------------------------- clipboard & drop
  const isTextTarget = (t: EventTarget) => (t as HTMLElement).closest?.('textarea, input');
  const onCopy = (e: React.ClipboardEvent) => { if (!isTextTarget(e.target) && !window.getSelection()?.toString()) copySelection(e); };
  const onCut = (e: React.ClipboardEvent) => { if (!isTextTarget(e.target) && copySelection(e)) deleteSelection(); };
  const onPaste = (e: React.ClipboardEvent) => {
    if (isTextTarget(e.target) || broken) return;
    const files = [...e.clipboardData.files];
    if (files.length) { e.preventDefault(); void addFiles(files, lastPointer.current ?? undefined); return; }
    const text = e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); pasteText(text); }
  };
  const accepts = (e: React.DragEvent) => [...e.dataTransfer.types].some((t) => t === DND_NOTE || t === DND_ATTACHMENT || t === 'Files' || t === 'text/uri-list');
  const onDragOver = (e: React.DragEvent) => { if (broken || !accepts(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
  const onDrop = (e: React.DragEvent) => {
    if (broken || !accepts(e)) return;
    e.preventDefault();
    const at = toWorld(local(e));
    const noteId = e.dataTransfer.getData(DND_NOTE);
    const attId = e.dataTransfer.getData(DND_ATTACHMENT);
    if (noteId) {
      const n = index.byId.get(noteId);
      if (n && n.id !== note.id) addNodes([addFileNode(n, at)]);
      return;
    }
    if (attId) {
      const a = index.attachmentsById?.get(attId);
      if (a) addNodes([addFileNode(a, at)]);
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) { void addFiles(files, at); return; }
    const url = normalizeUrl(e.dataTransfer.getData('text/uri-list').split('\n')[0] ?? '');
    if (url) addLink(url, at);
  };

  // ---------------------------------------------------------------- context menu
  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('textarea, input, [data-cv-ui]') || broken) return;
    e.preventDefault();
    const w = toWorld(local(e));
    lastPointer.current = w;
    const nodeEl = t.closest<HTMLElement>('[data-node-id]');
    const edgeEl = t.closest<HTMLElement>('[data-edge-id]');
    let items: MenuItemDef[];
    if (nodeEl || edgeEl) {
      if (nodeEl && !selRef.current.nodes.has(nodeEl.dataset.nodeId!)) select([nodeEl.dataset.nodeId!]);
      if (edgeEl && !selRef.current.edges.has(edgeEl.dataset.edgeId!)) select([], [edgeEl.dataset.edgeId!]);
      const n = nodeEl ? dataRef.current.nodes.find((x) => x.id === nodeEl.dataset.nodeId) : null;
      items = [
        ...(n?.type === 'text' || n?.type === 'group' ? [{ label: n.type === 'group' ? 'Rename group' : 'Edit', icon: <Pencil size={14} />, onClick: () => startEdit(n.id) }] : []),
        ...(edgeEl && !n ? [{ label: 'Edit label', icon: <Pencil size={14} />, onClick: () => setEditing({ kind: 'edge', id: edgeEl.dataset.edgeId! }) }] : []),
        ...(n?.type === 'file' ? [{ label: 'Open in new tab', icon: <ExternalLink size={14} />, onClick: () => openFile(n, true) }] : []),
        ...(n?.type === 'link' ? [{ label: 'Open link', icon: <ExternalLink size={14} />, onClick: () => window.open(n.url, '_blank', 'noopener,noreferrer') }] : []),
        ...(n ? [{ label: 'Duplicate', icon: <Copy size={14} />, hint: 'Mod+D', onClick: duplicateSelection }, { label: 'Copy', icon: <Copy size={14} />, hint: 'Mod+C', onClick: () => { copySelection(); } }] : []),
        ...(n && selRef.current.nodes.size ? [{ label: 'Create group from selection', icon: <SquareDashed size={14} />, onClick: addGroup }] : []),
        'sep' as const,
        { label: 'Delete', icon: <Trash2 size={14} />, danger: true, hint: 'Del', onClick: deleteSelection },
      ];
    } else {
      items = [
        { label: 'Add card', icon: <StickyNote size={14} />, onClick: () => addText(w) },
        { label: 'Add note from vault', icon: <FileText size={14} />, onClick: () => setPicker('note') },
        { label: 'Add media from vault', icon: <ImageIcon size={14} />, onClick: () => setPicker('media') },
        { label: 'Add web page', icon: <Globe size={14} />, onClick: () => setPicker('link') },
        { label: 'Add group', icon: <SquareDashed size={14} />, onClick: addGroup },
        ...(clip.current ? ['sep' as const, { label: 'Paste', icon: <ClipboardPaste size={14} />, hint: 'Mod+V', onClick: () => pasteText(clip.current!) }] : []),
      ];
    }
    setMenu({ at: { x: e.clientX, y: e.clientY }, items });
  };

  // ---------------------------------------------------------------- derived render data
  const { groups, cards } = useMemo(() => drawOrder(data.nodes), [data.nodes]);
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const depOf = (n: CanvasNode): unknown => (n.type === 'file' ? fileTargetOf(index, n.file, note.id) : n.type === 'text' && /\[\[|!\[/.test(n.text) ? index : null);
  const singleSel = sel.nodes.size === 1 && !sel.edges.size;
  const editingNode = editing?.kind === 'node' ? editing.id : null;
  const nodeView = (n: CanvasNode) => (
    <NodeView key={n.id} node={n} selected={sel.nodes.has(n.id)} single={singleSel} editing={editingNode === n.id} dep={depOf(n)} ctx={ctx} dropTarget={conn?.target === n.id} />
  );
  const selEdge = sel.edges.size === 1 && !sel.nodes.size ? data.edges.find((x) => sel.edges.has(x.id)) ?? null : null;
  const selEdgeEnds = useMemo(() => {
    if (!selEdge || conn || dragging) return null;
    const a = byId.get(selEdge.fromNode), b = byId.get(selEdge.toNode);
    return a && b ? { id: selEdge.id, g: edgeGeometry(a, b, selEdge) } : null;
  }, [selEdge, byId, conn, dragging]);

  const commitEdgeLabel = useCallback((id: string, label: string | null) => {
    if (label !== null) {
      const e = dataRef.current.edges.find((x) => x.id === id);
      const v = label.trim();
      if (e && (e.label ?? '') !== v) {
        const next = { ...e, label: v };
        if (!v) delete next.label;
        apply({ ...dataRef.current, edges: dataRef.current.edges.map((x) => (x.id === id ? next : x)) });
      }
    }
    setEditing(null);
    window.setTimeout(focusBoard, 0);
  }, [apply]);

  // Selection toolbar actions.
  const selNodes = data.nodes.filter((n) => sel.nodes.has(n.id));
  const selEdges = data.edges.filter((x) => sel.edges.has(x.id));
  const bounds = !dragging && !conn && !marquee && !editing && (selNodes.length || selEdges.length) ? selectionBounds(data, sel.nodes, sel.edges) : null;
  const actions: SelectionActions | null = bounds ? {
    color: (selNodes[0] ?? selEdges[0])?.color,
    setColor: (c) => {
      let d = dataRef.current;
      d = { nodes: d.nodes.map((n) => { if (!sel.nodes.has(n.id)) return n; const x = { ...n, color: c }; if (!c) delete x.color; return x; }), edges: d.edges.map((x) => { if (!sel.edges.has(x.id)) return x; const y = { ...x, color: c }; if (!c) delete y.color; return y; }) };
      apply(d);
    },
    edit: selNodes.length === 1 && (selNodes[0].type === 'text' || selNodes[0].type === 'group') ? () => startEdit(selNodes[0].id)
      : selNodes.length === 1 && selNodes[0].type === 'file' ? () => openFile(selNodes[0] as FileNode, true)
        : !selNodes.length && selEdges.length === 1 ? () => setEditing({ kind: 'edge', id: selEdges[0].id }) : undefined,
    zoomTo: zoomSelection,
    remove: deleteSelection,
    ...(selNodes.length >= 2 ? { align: (a) => apply(alignNodes(dataRef.current, sel.nodes, a)) } : {}),
    ...(selNodes.length >= 3 ? { distribute: (ax) => apply(distributeNodes(dataRef.current, sel.nodes, ax)) } : {}),
    ...(!selNodes.length && selEdges.length === 1 ? {
      flip: () => apply(updateEdge(dataRef.current, selEdges[0].id, flipEdge(selEdges[0]))),
      arrows: arrowMode(selEdges[0]),
      setArrows: (m) => { const e2 = setArrowMode(selEdges[0], m); apply({ ...dataRef.current, edges: dataRef.current.edges.map((x) => (x.id === e2.id ? e2 : x)) }); },
    } : {}),
  } : null;

  const narrow = board.width < 480;
  const marqueeScreen = marquee ? (() => { const v = vp.get(); return { left: marquee.x * v.zoom + v.x, top: marquee.y * v.zoom + v.y, width: marquee.width * v.zoom, height: marquee.height * v.zoom }; })() : null;
  const crumbs = note.folder ? note.folder.split('/') : [];

  return (
    <div className="cv-root h-full flex flex-col min-h-0" onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) flush(); }}>
      <header className={`h-10 shrink-0 flex items-center gap-0.5 px-1.5 border-b ${vx.border} ${vx.main}`}>
        <button className={`${vx.iconBtn} ${narrow ? 'hidden' : ''}`} aria-label="Navigate back" title="Navigate back" disabled={!tab.back?.length} onClick={() => { flush(); onNavigate(-1); }}><ArrowLeft size={15} /></button>
        <button className={`${vx.iconBtn} ${narrow ? 'hidden' : ''}`} aria-label="Navigate forward" title="Navigate forward" disabled={!tab.fwd?.length} onClick={() => { flush(); onNavigate(1); }}><ArrowRight size={15} /></button>
        <nav aria-label="Breadcrumb" className="flex-1 min-w-0 flex items-center justify-center gap-0.5 text-[13px] px-1">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <button className={`${narrow ? 'hidden' : ''} truncate max-w-[120px] ${vx.muted} hover:underline`} onClick={() => api.reveal(note.id)} title="Show in explorer">{c}</button>
              <ChevronRight size={12} className={`${narrow ? 'hidden' : ''} shrink-0 ${vx.faint}`} />
            </React.Fragment>
          ))}
          <LayoutDashboard size={13} className={`shrink-0 ${vx.faint}`} aria-hidden />
          <TitleInput note={note} compact focusNonce={renameNonce} onCommit={async (v) => { flush(); return api.renameNote(note.id, v); }} />
        </nav>
        <button className={vx.iconBtn} aria-label={note.bookmarked ? 'Remove bookmark' : 'Bookmark'} aria-pressed={!!note.bookmarked} title={note.bookmarked ? 'Remove bookmark' : 'Bookmark'} onClick={() => void toggleBookmark(note)}>
          <Star size={15} className={note.bookmarked ? 'text-amber-400 fill-amber-400' : ''} />
        </button>
        <button className={vx.iconBtn} aria-label="More options" title="More options" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHeaderMenu({ x: r.right - 220, y: r.bottom + 4 }); }}>
          <MoreHorizontal size={16} />
        </button>
      </header>
      {broken ? (
        <div role="alert" className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 text-[13px] bg-amber-50 text-amber-900 border-b border-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
          <TriangleAlert size={15} className="shrink-0" />
          <span className="flex-1 min-w-[200px]">This canvas file isn’t valid JSON Canvas, so it’s shown read-only to avoid overwriting it.</span>
          <button className="px-2.5 py-1 rounded-md font-medium bg-amber-600 text-white hover:bg-amber-700" onClick={async () => {
            const ok = await api.confirm({ title: 'Reset canvas', message: 'Replace the unreadable contents of this canvas with an empty canvas?', confirm: 'Reset', danger: true });
            if (!ok) return;
            const s = serializeCanvas(EMPTY_CANVAS);
            synced.current = s;
            syncedData.current = EMPTY_CANVAS;
            setBroken(false);
            dispatch({ type: 'reset', data: EMPTY_CANVAS });
            await saveContent(note.id, s);
          }}>Reset canvas</button>
        </div>
      ) : null}
      <div
        ref={boardRef}
        className={`cv-board flex-1 min-h-0 ${mode === 'pan' ? 'cv-panning' : ''} ${conn ? 'cv-connecting' : ''}`}
        tabIndex={0}
        role="application"
        aria-label={`Canvas ${note.title}`}
        aria-roledescription="canvas"
        onPointerDown={onPointerDown}
        onPointerMove={(e) => { if (boardRef.current?.contains(e.target as Node)) lastPointer.current = toWorld(local(e)); }}
        onClickCapture={(e) => { if (performance.now() < suppressClick.current) { e.stopPropagation(); e.preventDefault(); } }}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onCopy={onCopy}
        onCut={onCut}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onContextMenu={onContextMenu}
      >
        <div ref={worldRef} className="cv-world">
          {groups.map(nodeView)}
          <svg className="cv-edges" aria-hidden>
            {data.edges.map((x) => { const a = byId.get(x.fromNode), b = byId.get(x.toNode); return a && b ? <EdgeView key={x.id} edge={x} a={a} b={b} selected={sel.edges.has(x.id)} /> : null; })}
          </svg>
          {cards.map(nodeView)}
          {data.edges.map((x) => { const a = byId.get(x.fromNode), b = byId.get(x.toNode); return a && b ? <EdgeLabel key={x.id} edge={x} a={a} b={b} selected={sel.edges.has(x.id)} editing={editing?.kind === 'edge' && editing.id === x.id} onCommit={commitEdgeLabel} /> : null; })}
          <EdgeOverlay pending={conn?.geom ?? null} ends={selEdgeEnds} />
        </div>
        {marqueeScreen ? <div className="cv-marquee" style={marqueeScreen} /> : null}
        {!data.nodes.length && !broken ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`text-center text-[13px] ${vx.muted} max-w-[280px] px-4`}>
              <LayoutDashboard size={28} className="mx-auto mb-2 opacity-50" />
              Double-click to add a card, drag notes here from the file explorer, or use the toolbar below.
            </div>
          </div>
        ) : null}
        {!broken ? <AddDock compact={narrow} onText={() => addText()} onNote={() => setPicker('note')} onMedia={() => setPicker('media')} onLink={() => setPicker('link')} onGroup={addGroup} mediaEnabled /> : null}
        <ViewControls
          vp={vp} compact={narrow} onZoom={zoomBy} onReset={zoomReset} onFit={zoomFit} onSelection={zoomSelection} hasSelection={!!(sel.nodes.size || sel.edges.size)}
          canUndo={hist.past.length > 0 && !broken} canRedo={hist.future.length > 0 && !broken} onUndo={() => dispatch({ type: 'undo' })} onRedo={() => dispatch({ type: 'redo' })}
          mode={mode} setMode={setMode}
        />
        {bounds && actions && !broken ? <SelectionToolbar vp={vp} bounds={bounds} board={board} actions={actions} /> : null}
      </div>

      <NotePicker open={picker === 'note'} onClose={() => { setPicker(null); focusBoard(); }} index={index} exclude={note.id} onPick={(n) => addNodes([addFileNode(n)])} />
      <MediaPicker open={picker === 'media'} onClose={() => { setPicker(null); focusBoard(); }} attachments={index.attachments ?? []} onPick={(a) => addNodes([addFileNode(a)])} onUpload={() => fileInput.current?.click()} />
      <LinkPrompt open={picker === 'link'} onClose={() => { setPicker(null); focusBoard(); }} onPick={(u) => addLink(u)} />
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void addFiles(files); }} />
      <ContextMenu at={menu?.at ?? null} items={menu?.items ?? []} onClose={() => setMenu(null)} />
      <ContextMenu at={headerMenu} items={api.noteMenu(note, paneId)} onClose={() => setHeaderMenu(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ pickers

function NotePicker({ open, onClose, index, exclude, onPick }: { open: boolean; onClose: () => void; index: VaultIndex; exclude: string; onPick: (n: Note) => void }) {
  return (
    <SuggestModal<Note>
      open={open}
      onClose={onClose}
      placeholder="Add a note to the canvas…"
      items={(q) => quickSwitch(index, q, 50).map((r) => r.note).filter((n) => n.id !== exclude)}
      itemKey={(n) => n.id}
      render={(n, q) => (
        <div className="flex items-center gap-2 min-w-0">
          {n.kind === 'canvas' ? <LayoutDashboard size={14} className={vx.muted} /> : <FileText size={14} className={vx.muted} />}
          <span className={`truncate text-sm ${vx.text}`}><FuzzyText text={n.title} q={q} /></span>
          {n.folder ? <span className={`ml-auto text-[11px] truncate ${vx.faint}`}>{n.folder}</span> : null}
        </div>
      )}
      onChoose={(n) => onPick(n)}
      empty={() => 'No notes found'}
    />
  );
}

type MediaItem = { kind: 'upload' } | { kind: 'file'; a: Attachment };
function MediaPicker({ open, onClose, attachments, onPick, onUpload }: { open: boolean; onClose: () => void; attachments: Attachment[]; onPick: (a: Attachment) => void; onUpload: () => void }) {
  return (
    <SuggestModal<MediaItem>
      open={open}
      onClose={onClose}
      placeholder="Add media from the vault…"
      items={(q) => [
        { kind: 'upload' as const },
        ...attachments.map((a) => ({ a, s: fuzzyScore(attachmentPath(a), q) })).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, 80).map((x) => ({ kind: 'file' as const, a: x.a })),
      ]}
      itemKey={(it) => (it.kind === 'upload' ? '__upload' : it.a.id)}
      render={(it, q) => it.kind === 'upload' ? (
        <div className={`flex items-center gap-2 text-sm ${vx.accentText}`}><Upload size={14} />Upload a file from this device…</div>
      ) : (
        <div className="flex items-center gap-2 min-w-0">
          <ImageIcon size={14} className={vx.muted} />
          <span className={`truncate text-sm ${vx.text}`}><FuzzyText text={it.a.name} q={q} /></span>
          {it.a.folder ? <span className={`ml-auto text-[11px] truncate ${vx.faint}`}>{it.a.folder}</span> : null}
        </div>
      )}
      onChoose={(it) => (it.kind === 'upload' ? onUpload() : onPick(it.a))}
    />
  );
}

function LinkPrompt({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string) => void }) {
  return (
    <SuggestModal<string>
      open={open}
      onClose={onClose}
      placeholder="Paste or type a web address (https://…)"
      items={(q) => { const u = normalizeUrl(q) ?? (q.trim() && !/\s/.test(q.trim()) && q.includes('.') ? `https://${q.trim()}` : null); return u ? [u] : []; }}
      itemKey={(u) => u}
      render={(u) => <div className={`flex items-center gap-2 text-sm ${vx.text}`}><Globe size={14} className={vx.muted} /><span className="truncate">Add web page <b>{u}</b></span></div>}
      onChoose={(u) => onPick(u)}
      empty={() => 'Enter a URL'}
    />
  );
}
