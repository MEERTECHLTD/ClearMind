/**
 * SVG graph canvas: d3-force layout (ForceLayout, ticked per animation frame)
 * rendered with react-native-svg. Pan/zoom live in Reanimated shared values
 * applied to a <G> matrix via animated props, so gestures run on the UI thread
 * without React renders; React only re-renders while the layout is moving,
 * when selection changes, and once per gesture end (to refresh labels).
 *
 * Gestures: pan, pinch (focal), double-tap → fit, tap → select / open the
 * selected node, long-press + drag → move a node (pinned while dragging).
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useReducer, useRef, useState } from 'react';
import { View, Text, Pressable, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Path, Circle, Text as SvgText } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { Graph, GraphNode } from '@clearmind/shared/notes';
import { GRAPH_THEMES, fitTransform, labelAlpha } from '@clearmind/shared/notes/graphStyle';
import { T, useScheme } from '../../../lib/theme';
import { ForceLayout, type LayoutForces } from './layout';

const AnimatedG = Animated.createAnimatedComponent(G);

const K_MIN = 0.05;
const K_MAX = 8;
const HIT_DP = 24;
const MAX_LABELS = 80;
const RENDER_INTERVAL_MS = 40;

/** Circle as a path segment, so many nodes batch into one <Path>. */
const circleSeg = (x: number, y: number, r: number) =>
  `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0`;

export interface GraphCanvasHandle { fit: (animated?: boolean) => void }

export interface GraphCanvasProps {
  graph: Graph;
  activeId?: string | null;
  onOpen: (node: GraphNode) => void;
  /** Node id → colour (colour groups). */
  colors?: Map<string, string>;
  forces?: LayoutForces;
  /** Label fade threshold (-3 … 3; higher shows labels earlier). */
  textFade?: number;
  /** Always label the active node and its neighbours (local graph). */
  labelActiveNeighbours?: boolean;
  /** Fit padding (dp) and max zoom for fit. */
  fitPad?: number;
  fitMaxK?: number;
  accessibilityLabel: string;
  /** Select this node and centre on it once the layout settles (e.g. "Open in graph"). */
  focusId?: string | null;
  /**
   * Inside a vertical ScrollView (local graph card): one-finger pans only
   * start horizontally so vertical swipes still scroll the page.
   */
  scrollFriendly?: boolean;
}

const actionLabel = (n: GraphNode) => (n.type === 'unresolved' ? 'Create' : n.type === 'tag' ? 'Search' : 'Open');

export const GraphCanvas = forwardRef<GraphCanvasHandle, GraphCanvasProps>(function GraphCanvas(
  { graph, activeId, onOpen, colors, forces, textFade = 0, labelActiveNeighbours = false, fitPad = 40, fitMaxK = 2.5, accessibilityLabel, focusId, scrollFriendly = false },
  ref,
) {
  const scheme = useScheme();
  const theme = GRAPH_THEMES[scheme];
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  // View transform: screen = world·k + (tx, ty).
  const k = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const interacted = useSharedValue(false);
  const pinching = useSharedValue(false);
  const s0 = useSharedValue({ k: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  const panBase = useSharedValue({ x: 0, y: 0 });
  /** Committed view (React state) for label culling / font size. */
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const commitView = useCallback(() => setView({ k: k.value, tx: tx.value, ty: ty.value }), [k, tx, ty]);

  // ---------------------------------------------------------------- layout
  const layoutRef = useRef<ForceLayout | null>(null);
  if (!layoutRef.current) layoutRef.current = new ForceLayout(forces);
  const layout = layoutRef.current;

  const fit = useCallback((animated = false, commit = true) => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const t = fitTransform(layout.bounds(), w, h, fitPad, K_MIN, fitMaxK);
    if (animated) {
      const cfg = { duration: 320, easing: Easing.out(Easing.cubic) };
      k.value = withTiming(t.k, cfg);
      tx.value = withTiming(t.x, cfg);
      ty.value = withTiming(t.y, cfg);
    } else {
      k.value = t.k; tx.value = t.x; ty.value = t.y;
    }
    if (commit) setView({ k: t.k, tx: t.x, ty: t.y });
  }, [layout, fitPad, fitMaxK, k, tx, ty]);

  /** Pending "centre on node" request, consumed when the layout settles. */
  const focusPending = useRef<string | null>(focusId ?? null);
  useEffect(() => { focusPending.current = focusId ?? null; if (focusId) layout.reheat(0.05); }, [focusId, layout]);
  const focusSelected = useRef<string | null>(null);
  useEffect(() => {
    if (focusId && focusSelected.current !== focusId && graph.nodes.some((n) => n.id === focusId)) {
      focusSelected.current = focusId;
      setSelectedId(focusId);
    }
  }, [focusId, graph]);
  const centreOn = useCallback((id: string) => {
    const n = layout.byId.get(id);
    const { w, h } = sizeRef.current;
    if (!n || !w || !h) return false;
    const nk = Math.min(K_MAX, Math.max(k.value, 1.2));
    const t = { k: nk, x: w / 2 - (n.x ?? 0) * nk, y: h / 2 - (n.y ?? 0) * nk };
    const cfg = { duration: 420, easing: Easing.out(Easing.cubic) };
    interacted.value = true;
    k.value = withTiming(t.k, cfg);
    tx.value = withTiming(t.x, cfg);
    ty.value = withTiming(t.y, cfg);
    setView({ k: t.k, tx: t.x, ty: t.y });
    return true;
  }, [layout, k, tx, ty, interacted]);

  useImperativeHandle(ref, () => ({
    fit: (animated = true) => { interacted.value = false; fit(animated); },
  }), [fit, interacted]);

  useEffect(() => {
    let last = 0;
    layout.onFrame = () => {
      // While settling, re-render at most ~25×/s so the JS thread spends its
      // time ticking rather than reconciling SVG.
      const t = Date.now();
      if (t - last < RENDER_INTERVAL_MS) return;
      last = t;
      // Until the user moves the view, keep the growing layout fitted.
      if (!interacted.value) fit(false);
      bump();
    };
    layout.onSettle = () => {
      if (!interacted.value) fit(false);
      if (focusPending.current && centreOn(focusPending.current)) focusPending.current = null;
      bump();
    };
  }, [layout, fit, interacted, centreOn]);

  useEffect(() => { if (forces) { layout.setForces(forces); layout.reheat(0.3); } }, [layout, forces]);
  useEffect(() => { layout.setGraph(graph); }, [layout, graph]);
  useEffect(() => () => layout.dispose(), [layout]);
  useEffect(() => { if (selectedId && !graph.nodes.some((n) => n.id === selectedId)) setSelectedId(null); }, [graph, selectedId]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width === size.w && height === size.h) return;
    sizeRef.current = { w: width, h: height };
    setSize({ w: width, h: height });
    if (!interacted.value) fit(false);
  };

  // ---------------------------------------------------------------- gestures
  const toWorld = useCallback((x: number, y: number) => ({ x: (x - tx.value) / k.value, y: (y - ty.value) / k.value }), [k, tx, ty]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan().maxPointers(2);
    if (scrollFriendly) pan.activeOffsetX([-10, 10]).failOffsetY([-10, 10]);
    pan
      .onStart(() => {
        interacted.value = true;
        panBase.value = { x: tx.value, y: ty.value };
      })
      .onUpdate((e) => {
        if (pinching.value) { panBase.value = { x: tx.value - e.translationX, y: ty.value - e.translationY }; return; }
        tx.value = panBase.value.x + e.translationX;
        ty.value = panBase.value.y + e.translationY;
      })
      .onEnd(() => { runOnJS(commitView)(); });

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        interacted.value = true;
        pinching.value = true;
        s0.value = { k: k.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
      })
      .onUpdate((e) => {
        const b = s0.value;
        const nk = Math.min(K_MAX, Math.max(K_MIN, b.k * e.scale));
        const f = nk / b.k;
        k.value = nk;
        tx.value = e.focalX - (b.fx - b.tx) * f;
        ty.value = e.focalY - (b.fy - b.ty) * f;
      })
      .onEnd(() => { runOnJS(commitView)(); })
      .onFinalize(() => { pinching.value = false; });

    const doubleTap = Gesture.Tap().numberOfTaps(2).runOnJS(true).onEnd((_e, ok) => {
      if (!ok) return;
      interacted.value = false;
      fit(true);
    });

    const tap = Gesture.Tap().maxDuration(300).runOnJS(true).onEnd((e, ok) => {
      if (!ok) return;
      const w = toWorld(e.x, e.y);
      const hit = layout.hitTest(w.x, w.y, HIT_DP / k.value);
      if (!hit) { setSelectedId(null); return; }
      if (hit.id === selectedRef.current) onOpenRef.current(hit.node);
      else setSelectedId(hit.id);
    });

    const drag: { id: string | null; px: number; py: number } = { id: null, px: 0, py: 0 };
    const dragNode = Gesture.Pan().activateAfterLongPress(300).runOnJS(true)
      .onStart((e) => {
        interacted.value = true;
        const w = toWorld(e.x, e.y);
        const hit = layout.hitTest(w.x, w.y, HIT_DP / k.value);
        drag.id = hit?.id ?? null;
        drag.px = tx.value; drag.py = ty.value;
        if (hit) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          setSelectedId(hit.id);
          layout.pin(hit.id, w.x, w.y);
        }
      })
      .onUpdate((e) => {
        if (drag.id) { const w = toWorld(e.x, e.y); layout.pin(drag.id, w.x, w.y); }
        else { tx.value = drag.px + e.translationX; ty.value = drag.py + e.translationY; }
      })
      .onFinalize(() => {
        if (drag.id) layout.pin(drag.id, null, null);
        drag.id = null;
        commitView();
      });

    return Gesture.Race(dragNode, Gesture.Simultaneous(pan, pinch), Gesture.Exclusive(doubleTap, tap));
  }, [scrollFriendly, layout, fit, toWorld, commitView, k, tx, ty, interacted, pinching, s0, panBase]);

  const animatedProps = useAnimatedProps(() => ({ matrix: [k.value, 0, 0, k.value, tx.value, ty.value] }) as never);

  // ---------------------------------------------------------------- derived
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    for (const l of graph.links) {
      (adj.get(l.source) ?? adj.set(l.source, new Set()).get(l.source)!).add(l.target);
      (adj.get(l.target) ?? adj.set(l.target, new Set()).get(l.target)!).add(l.source);
    }
    return adj;
  }, [graph]);

  const hubId = selectedId ?? (labelActiveNeighbours ? activeId ?? null : null);
  const focus = useMemo(() => {
    if (!hubId) return null;
    return new Set([hubId, ...(adjacency.get(hubId) ?? [])]);
  }, [hubId, adjacency]);
  const dimOthers = !!selectedId;

  // Links: two batched paths (normal + highlighted).
  let dLinks = '';
  let dHi = '';
  for (const l of layout.links) {
    const seg = `M${(l.source.x ?? 0).toFixed(1)} ${(l.source.y ?? 0).toFixed(1)}L${(l.target.x ?? 0).toFixed(1)} ${(l.target.y ?? 0).toFixed(1)}`;
    if (hubId && (l.source.id === hubId || l.target.id === hubId)) dHi += seg;
    else dLinks += seg;
  }

  // Labels: highlighted nodes always; others when zoomed in, culled to the viewport, best-connected first.
  const kc = Math.max(view.k, 0.05);
  const alpha = labelAlpha(kc, textFade);
  const fontSize = 11 / kc;
  const labels: { id: string; x: number; y: number; r: number; text: string; strong: boolean; opacity: number }[] = [];
  const labelled = new Set<string>();
  if (focus) for (const id of focus) {
    const n = layout.byId.get(id);
    if (n) { labels.push({ id, x: n.x ?? 0, y: n.y ?? 0, r: n.r, text: n.node.label, strong: id === hubId, opacity: 1 }); labelled.add(id); }
  }
  if (activeId && !labelled.has(activeId)) {
    const n = layout.byId.get(activeId);
    if (n) { labels.push({ id: activeId, x: n.x ?? 0, y: n.y ?? 0, r: n.r, text: n.node.label, strong: true, opacity: 1 }); labelled.add(activeId); }
  }
  if (alpha > 0.02 && !dimOthers && size.w) {
    const x0 = -view.tx / kc, y0 = -view.ty / kc, x1 = x0 + size.w / kc, y1 = y0 + size.h / kc;
    const vis = layout.nodes.filter((n) => !labelled.has(n.id) && (n.x ?? 0) >= x0 && (n.x ?? 0) <= x1 && (n.y ?? 0) >= y0 && (n.y ?? 0) <= y1);
    vis.sort((a, b) => b.node.degree - a.node.degree);
    for (const n of vis.slice(0, MAX_LABELS)) labels.push({ id: n.id, x: n.x ?? 0, y: n.y ?? 0, r: n.r, text: n.node.label, strong: false, opacity: alpha });
  }

  const fillOf = (n: GraphNode) => {
    if (n.id === activeId) return theme.accent;
    const c = colors?.get(n.id);
    if (c) return c;
    return n.type === 'tag' ? theme.tag : n.type === 'unresolved' ? T.bg : n.type === 'attachment' ? theme.attachment : theme.note;
  };

  // Nodes: batched into one <Path> per (fill, stroke, faded) combination.
  const batchMap = new Map<string, { key: string; d: string; fill: string; stroke?: string; faded: boolean }>();
  for (const sn of layout.nodes) {
    const n = sn.node;
    const faded = dimOthers && !focus?.has(n.id);
    const fill = fillOf(n);
    const stroke = n.type === 'unresolved' ? colors?.get(n.id) ?? theme.unresolved : undefined;
    const key = `${fill}|${stroke ?? ''}|${faded ? 1 : 0}`;
    const b = batchMap.get(key) ?? batchMap.set(key, { key, d: '', fill, stroke, faded }).get(key)!;
    b.d += circleSeg(sn.x ?? 0, sn.y ?? 0, sn.r);
  }
  // Faded batches first so highlighted nodes draw on top.
  const nodeBatches = [...batchMap.values()].sort((a, b) => Number(b.faded) - Number(a.faded));

  const selected = selectedId ? layout.byId.get(selectedId)?.node ?? null : null;

  return (
    <View style={{ flex: 1, overflow: 'hidden' }} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View style={{ flex: 1 }} collapsable={false} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
          {size.w > 0 ? (
            <Svg width={size.w} height={size.h}>
              <AnimatedG animatedProps={animatedProps}>
                {dLinks ? (
                  <Path d={dLinks} stroke={theme.link} strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={dimOthers ? 0.35 : 1} fill="none" />
                ) : null}
                {dHi ? (
                  <Path d={dHi} stroke={dimOthers ? theme.linkHighlight : theme.link} strokeWidth={dimOthers ? 1.6 : 1} vectorEffect="non-scaling-stroke" fill="none" />
                ) : null}
                {nodeBatches.map((b) => (
                  <Path
                    key={b.key}
                    d={b.d}
                    fill={b.fill}
                    stroke={b.stroke}
                    strokeWidth={b.stroke ? 1.4 : undefined}
                    opacity={b.faded ? 0.18 : 1}
                  />
                ))}
                {[selectedId, activeId].filter((id, i, a): id is string => !!id && a.indexOf(id) === i).map((id) => {
                  const s = layout.byId.get(id);
                  return s ? (
                    <Circle key={`ring-${id}`} cx={s.x ?? 0} cy={s.y ?? 0} r={s.r + 3 / kc} fill="none" stroke={theme.accent} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ) : null;
                })}
                {labels.map((l) => (
                  <SvgText
                    key={`l-${l.id}`}
                    x={l.x}
                    y={l.y + l.r + fontSize * 1.1}
                    fontSize={fontSize}
                    fontWeight={l.strong ? '700' : '400'}
                    fill={l.strong ? theme.text : theme.textMuted}
                    opacity={l.opacity}
                    textAnchor="middle"
                  >
                    {l.text.length > 36 ? `${l.text.slice(0, 34)}…` : l.text}
                  </SvgText>
                ))}
              </AnimatedG>
            </Svg>
          ) : null}
        </View>
      </GestureDetector>

      {selected ? (
        <View pointerEvents="box-none" className="absolute left-3 right-3 bottom-3 items-center">
          <View className="flex-row items-center bg-midnight-light border border-line rounded-full pl-4 pr-1 py-1 max-w-full">
            <Text className="text-ink text-sm font-semibold flex-shrink" numberOfLines={1}>{selected.label}</Text>
            <Pressable
              onPress={() => onOpen(selected)}
              className="ml-3 bg-accent rounded-full px-4 py-2 active:opacity-80"
              accessibilityRole="button"
              accessibilityLabel={`${actionLabel(selected)} ${selected.label}`}
            >
              <Text className="text-white text-sm font-semibold">{actionLabel(selected)}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
});
