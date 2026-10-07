/** Canvas edges: bezier connectors with arrowheads (SVG, under the cards) and labels (HTML). */
import React, { memo, useEffect, useRef } from 'react';
import type { CanvasEdge, CanvasNode } from '../../../shared/notes';
import { canvasColor } from '../../../shared/notes';
import { arrowHead, arrowsOf, edgeGeometry, type EdgeGeom } from './model';

export const EdgeView = memo(function EdgeView({ edge, a, b, selected }: { edge: CanvasEdge; a: CanvasNode; b: CanvasNode; selected: boolean }) {
  const g = edgeGeometry(a, b, edge);
  const color = canvasColor(edge.color);
  const arrows = arrowsOf(edge);
  return (
    <g className={`cv-edge${selected ? ' cv-sel' : ''}`} data-edge-id={edge.id} {...(color ? { 'data-color': '' } : {})} style={color ? ({ '--cv-color': color } as React.CSSProperties) : undefined}>
      <path className="cv-edge-hit" d={g.path} />
      <path className="cv-edge-line" d={g.path} />
      {arrows.to ? <polygon className="cv-edge-head" points={arrowHead(g.to, g.toSide)} /> : null}
      {arrows.from ? <polygon className="cv-edge-head" points={arrowHead(g.from, g.fromSide)} /> : null}
    </g>
  );
});

export const EdgeLabel = memo(function EdgeLabel({ edge, a, b, selected, editing, onCommit }: {
  edge: CanvasEdge; a: CanvasNode; b: CanvasNode; selected: boolean; editing: boolean; onCommit: (id: string, label: string | null) => void;
}) {
  if (!edge.label && !editing) return null;
  const g = edgeGeometry(a, b, edge);
  return (
    <div className={`cv-edge-label${selected ? ' cv-sel' : ''}`} data-edge-id={edge.id} data-edge-label style={{ transform: `translate(${g.mid.x}px, ${g.mid.y}px) translate(-50%, -50%)` }}>
      {editing ? <LabelInput initial={edge.label ?? ''} onDone={(v) => onCommit(edge.id, v)} /> : edge.label}
    </div>
  );
});

function LabelInput({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Edge label"
      placeholder="Label"
      size={Math.max(8, initial.length + 2)}
      onBlur={(e) => finish(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish((e.target as HTMLInputElement).value); }
        if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      }}
    />
  );
}

/** Overlay above the cards: the in-progress connection and the selected edge's draggable ends. */
export function EdgeOverlay({ pending, ends }: { pending: EdgeGeom | null; ends: { id: string; g: EdgeGeom } | null }) {
  return (
    <svg className="cv-edges" style={{ zIndex: 5 }} aria-hidden>
      {pending ? (
        <g className="cv-edge cv-sel">
          <path className="cv-edge-line" d={pending.path} strokeDasharray="6 5" />
          <polygon className="cv-edge-head" points={arrowHead(pending.to, pending.toSide)} />
        </g>
      ) : null}
      {ends ? (
        <>
          <circle className="cv-edge-end" data-edge-end="from" data-edge-id={ends.id} cx={ends.g.from.x} cy={ends.g.from.y} r={7} />
          <circle className="cv-edge-end" data-edge-end="to" data-edge-id={ends.id} cx={ends.g.to.x} cy={ends.g.to.y} r={7} />
        </>
      ) : null}
    </svg>
  );
}
