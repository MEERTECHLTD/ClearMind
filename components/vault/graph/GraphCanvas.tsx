/**
 * React shell around GraphEngine: owns the <canvas>, resize/theme observers
 * and the screen-reader fallback list. Never re-renders per frame — data and
 * settings are pushed into the engine from effects.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import type { Graph, GraphNode } from '../../../shared/notes';
import type { GraphDisplaySettings, GraphForceSettings } from '../../../shared/notes/graphStyle';
import { GraphEngine } from './engine';

export interface GraphCanvasHandle {
  zoomToFit: () => void;
  zoomBy: (factor: number) => void;
  animate: () => void;
  refit: () => void;
}

export interface GraphCanvasProps {
  graph: Graph;
  colors: Map<string, string>;
  display: GraphDisplaySettings;
  forces: GraphForceSettings;
  activeId?: string | null;
  onOpen: (node: GraphNode, opts: { newTab: boolean }) => void;
  /** Keep the view fitted whenever the structure changes (local graph). */
  fitOnChange?: boolean;
  fitMaxZoom?: number;
  padding?: number;
  insetTop?: number;
  /** Width covered by an overlay on the right; zoom-to-fit keeps nodes out from under it. */
  insetRight?: number;
  /** Accessible name for the graph region. */
  label: string;
}

const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
const TYPE_LABEL: Record<GraphNode['type'], string> = { note: 'Note', tag: 'Tag', unresolved: 'Not created yet', attachment: 'Attachment' };

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(props, ref) {
  const { graph, colors, display, forces, activeId = null, onOpen, fitOnChange = false, fitMaxZoom, padding, insetTop, insetRight = 0, label } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GraphEngine | null>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // Create once per mount; everything else is pushed in by the effects below.
  useEffect(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const engine = new GraphEngine(canvas, { onOpen: (n, o) => onOpenRef.current(n, o), fitOnChange, fitMaxZoom, padding, insetTop });
    engineRef.current = engine;
    engine.setTheme(isDark());
    const r = wrap.getBoundingClientRect();
    engine.resize(r.width, r.height);
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) engine.resize(box.width, box.height);
    });
    ro.observe(wrap);
    const mo = new MutationObserver(() => engine.setTheme(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      engine.destroy();
      engineRef.current = null;
    };
    // Engine options are fixed for the panel's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.setDisplay(display); }, [display]);
  useEffect(() => { engineRef.current?.setForces(forces); }, [forces]);
  useEffect(() => { engineRef.current?.setColors(colors); }, [colors]);
  useEffect(() => { engineRef.current?.setData(graph); }, [graph]);
  useEffect(() => { engineRef.current?.setActive(activeId); }, [activeId]);
  useEffect(() => { engineRef.current?.setInsetRight(insetRight); }, [insetRight]);

  useImperativeHandle(ref, () => ({
    zoomToFit: () => engineRef.current?.zoomToFit(),
    zoomBy: (f) => engineRef.current?.zoomBy(f),
    animate: () => engineRef.current?.animate(),
    refit: () => engineRef.current?.refit(),
  }), []);

  const srNodes = useMemo(() => [...graph.nodes].sort((a, b) => a.label.localeCompare(b.label)), [graph]);

  return (
    <div ref={wrapRef} className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="block w-full h-full select-none"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label={`${label}: ${graph.nodes.length} nodes, ${graph.links.length} links`}
      />
      <ul className="sr-only" aria-label={`${label} nodes`}>
        {srNodes.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={(e) => onOpen(n, { newTab: e.metaKey || e.ctrlKey })}
              onFocus={() => engineRef.current?.focusNode(n.id)}
              onBlur={() => engineRef.current?.focusNode(null)}
            >
              {n.label} ({TYPE_LABEL[n.type]}, {n.degree} {n.degree === 1 ? 'link' : 'links'}{n.id === activeId ? ', current note' : ''})
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});
