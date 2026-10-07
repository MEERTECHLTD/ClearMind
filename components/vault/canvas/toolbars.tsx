/** Floating canvas UI: the add-content dock, zoom/history controls and the selection toolbar. */
import React, { useState } from 'react';
import {
  StickyNote, FileText, Image as ImageIcon, Globe, SquareDashed, Plus, Minus, Maximize, Scan, Undo2, Redo2, Hand, MousePointer2,
  Trash2, Pencil, Palette, ArrowLeftRight, MoveRight, MoveHorizontal, Minus as LineIcon, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, LayoutGrid, X,
} from 'lucide-react';
import { CANVAS_COLORS, canvasColor } from '../../../shared/notes';
import type { Align, ArrowMode, Rect } from './model';
import { useViewport, type ViewportStore } from './viewport';

const btn = 'p-1.5 rounded-md flex items-center justify-center';

export function AddDock({ compact, onText, onNote, onMedia, onLink, onGroup, mediaEnabled }: {
  compact: boolean; onText: () => void; onNote: () => void; onMedia: () => void; onLink: () => void; onGroup: () => void; mediaEnabled: boolean;
}) {
  const items = [
    { label: 'Add card', icon: <StickyNote size={18} />, run: onText },
    { label: 'Add note from vault', icon: <FileText size={18} />, run: onNote },
    { label: 'Add media from vault', icon: <ImageIcon size={18} />, run: onMedia, disabled: !mediaEnabled },
    { label: 'Add web page', icon: <Globe size={18} />, run: onLink },
    { label: 'Add group', icon: <SquareDashed size={18} />, run: onGroup },
  ];
  return (
    <div className={`cv-ui absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-0.5 p-1 z-20 ${compact ? '' : 'px-1.5'}`} role="toolbar" aria-label="Add to canvas" data-cv-ui>
      {items.map((it) => (
        <button key={it.label} type="button" className={btn} title={it.label} aria-label={it.label} onClick={it.run} disabled={it.disabled}>{it.icon}</button>
      ))}
    </div>
  );
}

export function ViewControls({ vp, onZoom, onReset, onFit, onSelection, hasSelection, canUndo, canRedo, onUndo, onRedo, mode, setMode, compact }: {
  vp: ViewportStore; onZoom: (f: number) => void; onReset: () => void; onFit: () => void; onSelection: () => void; hasSelection: boolean;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void; mode: 'pan' | 'select'; setMode: (m: 'pan' | 'select') => void; compact: boolean;
}) {
  const v = useViewport(vp);
  const pct = Math.round(v.zoom * 100);
  const [openState, setOpen] = useState<boolean | null>(null);
  const open = openState ?? !compact;
  const sep = <div className="h-px my-0.5 mx-1 bg-gray-200 dark:bg-white/10" />;
  if (compact && !open) {
    return (
      <div className="cv-ui absolute top-3 right-3 flex flex-col p-1 z-20" data-cv-ui>
        <button type="button" className={btn} title="View controls" aria-label="Show view controls" onClick={() => setOpen(true)}><LayoutGrid size={17} /></button>
      </div>
    );
  }
  return (
    <div className="cv-ui absolute top-3 right-3 flex flex-col items-stretch p-1 z-20" role="toolbar" aria-label="Canvas view" data-cv-ui>
      {compact ? <button type="button" className={btn} title="Hide" aria-label="Hide view controls" onClick={() => setOpen(false)}><X size={16} /></button> : null}
      <button type="button" className={btn} title="Pan mode (drag to move the board)" aria-label="Pan mode" aria-pressed={mode === 'pan'} onClick={() => setMode('pan')}><Hand size={17} /></button>
      <button type="button" className={btn} title="Select mode (drag to select; Shift+drag in pan mode)" aria-label="Select mode" aria-pressed={mode === 'select'} onClick={() => setMode('select')}><MousePointer2 size={17} /></button>
      {sep}
      <button type="button" className={btn} title="Zoom in" aria-label="Zoom in" onClick={() => onZoom(1.25)}><Plus size={17} /></button>
      <button type="button" className="text-[11px] font-medium tabular-nums py-1 rounded-md" title="Reset zoom to 100%" aria-label={`Zoom ${pct}%, reset to 100%`} onClick={onReset}>{pct}%</button>
      <button type="button" className={btn} title="Zoom out" aria-label="Zoom out" onClick={() => onZoom(0.8)}><Minus size={17} /></button>
      <button type="button" className={btn} title="Zoom to fit (Shift+1)" aria-label="Zoom to fit" onClick={onFit}><Maximize size={16} /></button>
      <button type="button" className={btn} title="Zoom to selection (Shift+2)" aria-label="Zoom to selection" onClick={onSelection} disabled={!hasSelection}><Scan size={16} /></button>
      {sep}
      <button type="button" className={btn} title="Undo (Mod+Z)" aria-label="Undo" onClick={onUndo} disabled={!canUndo}><Undo2 size={16} /></button>
      <button type="button" className={btn} title="Redo (Mod+Shift+Z)" aria-label="Redo" onClick={onRedo} disabled={!canRedo}><Redo2 size={16} /></button>
    </div>
  );
}

export interface SelectionActions {
  color: string | undefined;
  setColor: (c: string | undefined) => void;
  edit?: () => void;
  zoomTo: () => void;
  remove: () => void;
  align?: (a: Align) => void;
  distribute?: (axis: 'h' | 'v') => void;
  /** Edge-only actions. */
  flip?: () => void;
  arrows?: ArrowMode;
  setArrows?: (m: ArrowMode) => void;
}

export function SelectionToolbar({ vp, bounds, board, actions }: { vp: ViewportStore; bounds: Rect; board: { width: number; height: number }; actions: SelectionActions }) {
  const v = useViewport(vp);
  const [pop, setPop] = useState<null | 'color' | 'align'>(null);
  const cx = (bounds.x + bounds.width / 2) * v.zoom + v.x;
  const top = bounds.y * v.zoom + v.y - 52;
  const below = top < 8;
  const y = below ? Math.min(board.height - 56, (bounds.y + bounds.height) * v.zoom + v.y + 12) : top;
  const W = 300;
  const x = Math.max(8, Math.min(board.width - W - 8, cx - W / 2));
  if (cx < -200 || cx > board.width + 200 || y > board.height + 100) return null;
  const color = canvasColor(actions.color);
  const nextArrows: Record<ArrowMode, ArrowMode> = { forward: 'both', both: 'none', none: 'forward' };
  return (
    <div className="absolute z-30 flex justify-center pointer-events-none" style={{ left: x, top: Math.max(8, y), width: W }} data-cv-ui>
      <div className="cv-ui pointer-events-auto relative flex items-center gap-0.5 p-1" role="toolbar" aria-label="Selection">
        <button type="button" className={btn} title="Set colour" aria-label="Set colour" aria-expanded={pop === 'color'} onClick={() => setPop(pop === 'color' ? null : 'color')}>
          {color ? <span className="w-[17px] h-[17px] rounded-full" style={{ background: color }} /> : <Palette size={17} />}
        </button>
        {actions.edit ? <button type="button" className={btn} title="Edit (Enter)" aria-label="Edit" onClick={actions.edit}><Pencil size={16} /></button> : null}
        {actions.flip ? <button type="button" className={btn} title="Flip direction" aria-label="Flip direction" onClick={actions.flip}><ArrowLeftRight size={16} /></button> : null}
        {actions.setArrows && actions.arrows ? (
          <button type="button" className={btn} title={`Arrows: ${actions.arrows} (click to change)`} aria-label="Toggle arrows" onClick={() => actions.setArrows!(nextArrows[actions.arrows!])}>
            {actions.arrows === 'forward' ? <MoveRight size={17} /> : actions.arrows === 'both' ? <MoveHorizontal size={17} /> : <LineIcon size={17} />}
          </button>
        ) : null}
        {actions.align ? <button type="button" className={btn} title="Align & distribute" aria-label="Align" aria-expanded={pop === 'align'} onClick={() => setPop(pop === 'align' ? null : 'align')}><AlignStartVertical size={16} /></button> : null}
        <button type="button" className={btn} title="Zoom to selection" aria-label="Zoom to selection" onClick={actions.zoomTo}><Scan size={16} /></button>
        <button type="button" className={`${btn} hover:!text-red-500`} title="Delete (Del)" aria-label="Delete" onClick={actions.remove}><Trash2 size={16} /></button>
        {pop === 'color' ? (
          <div className="cv-ui absolute left-0 top-full mt-1.5 flex items-center gap-1.5 p-2">
            <button type="button" className="cv-swatch flex items-center justify-center !p-0" style={{ background: 'transparent', borderColor: 'var(--cv-card-border)' }} title="No colour" aria-label="No colour" aria-pressed={!actions.color} onClick={() => { actions.setColor(undefined); setPop(null); }}><X size={12} /></button>
            {(Object.keys(CANVAS_COLORS) as (keyof typeof CANVAS_COLORS)[]).map((k) => (
              <button key={k} type="button" className="cv-swatch !p-0" style={{ background: CANVAS_COLORS[k] }} title={`Colour ${k}`} aria-label={`Colour ${k}`} aria-pressed={actions.color === k} onClick={() => { actions.setColor(k); setPop(null); }} />
            ))}
            <label className="cv-swatch relative overflow-hidden cursor-pointer" title="Custom colour" style={{ background: 'conic-gradient(#e93147,#e0ac00,#08b94e,#00bfbc,#7852ee,#e93147)' }}>
              <input type="color" aria-label="Custom colour" className="absolute inset-0 opacity-0 cursor-pointer" value={color && color.startsWith('#') && color.length === 7 ? color : '#888888'} onChange={(e) => actions.setColor(e.target.value)} />
            </label>
          </div>
        ) : null}
        {pop === 'align' && actions.align ? (
          <div className="cv-ui absolute left-0 top-full mt-1.5 grid grid-cols-4 gap-0.5 p-1">
            {([
              ['left', AlignStartVertical, 'Align left'], ['center', AlignCenterVertical, 'Align centre'], ['right', AlignEndVertical, 'Align right'],
              ['top', AlignStartHorizontal, 'Align top'], ['middle', AlignCenterHorizontal, 'Align middle'], ['bottom', AlignEndHorizontal, 'Align bottom'],
            ] as const).map(([a, Icon, label]) => (
              <button key={a} type="button" className={btn} title={label} aria-label={label} onClick={() => actions.align!(a)}><Icon size={16} /></button>
            ))}
            {actions.distribute ? <>
              <button type="button" className={btn} title="Distribute horizontally" aria-label="Distribute horizontally" onClick={() => actions.distribute!('h')}><AlignHorizontalSpaceAround size={16} /></button>
              <button type="button" className={btn} title="Distribute vertically" aria-label="Distribute vertically" onClick={() => actions.distribute!('v')}><AlignVerticalSpaceAround size={16} /></button>
            </> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
