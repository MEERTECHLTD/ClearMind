import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Svg, { Line, Polygon, Rect, Defs, Pattern, Path } from 'react-native-svg';
import {
  Plus,
  Trash2,
  Pencil,
  X,
  GitBranch,
  Network,
  MousePointer,
  Link2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  ArrowLeft,
} from 'lucide-react-native';
import type { MindMap, MindMapNode, MindMapEdge } from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import { generateResponse, isApiConfigured } from '../../services/gemini';
import {
  Screen,
  AppHeader,
  Card,
  Input,
  SegmentedControl,
  EmptyState,
  Spinner,
  confirmDialog,
  useToast,
} from '../../components/ui';

const NODE_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
];

const WORLD = 4000;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2;
const HELP_TEXT = 'Pinch to zoom · drag a node to move · tap Connect to link two ideas';

type MapType = 'mindmap' | 'decision-tree';
type Tool = 'select' | 'connect';

function clampW(v: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(v, min), max);
}

/* ───────────────────────── Node (memoised, stable gesture) ───────────────────────── */

type NodeViewProps = {
  node: MindMapNode;
  selected: boolean;
  connecting: boolean;
  tool: Tool;
  scale: SharedValue<number>;
  canvasPanRef: React.MutableRefObject<GestureType | undefined>;
  size?: { w: number; h: number };
  onTap: (id: string) => void;
  onDragBegin: (id: string) => void;
  onDragMove: (id: string, dx: number, dy: number) => void;
  onDragEnd: () => void;
  onMeasure: (id: string, w: number, h: number) => void;
};

const NodeView = React.memo(
  function NodeView({
    node,
    selected,
    connecting,
    tool,
    scale,
    canvasPanRef,
    size,
    onTap,
    onDragBegin,
    onDragMove,
    onDragEnd,
    onMeasure,
  }: NodeViewProps) {
    // Gesture objects depend ONLY on values that never change mid-drag, so the
    // active gesture is never torn down while a finger is down.
    const pan = useMemo(
      () =>
        Gesture.Pan()
          .blocksExternalGesture(canvasPanRef)
          .onBegin(() => {
            runOnJS(onDragBegin)(node.id);
          })
          .onChange((e) => {
            const s = scale.value || 1;
            runOnJS(onDragMove)(node.id, e.changeX / s, e.changeY / s);
          })
          .onEnd(() => {
            runOnJS(onDragEnd)();
          }),
      [node.id, canvasPanRef, scale, onDragBegin, onDragMove, onDragEnd],
    );

    const tap = useMemo(
      () =>
        Gesture.Tap()
          .maxDuration(260)
          .onEnd(() => {
            runOnJS(onTap)(node.id);
          }),
      [node.id, onTap],
    );

    const gesture = useMemo(
      () => (tool === 'connect' ? tap : Gesture.Exclusive(pan, tap)),
      [tool, pan, tap],
    );

    const w = size?.w ?? 0;
    const h = size?.h ?? 0;

    const ring = connecting
      ? 'border-2 border-accent'
      : selected
        ? 'border-2 border-white'
        : node.isRoot
          ? 'border-2 border-yellow-400'
          : 'border border-black/20';

    return (
      <GestureDetector gesture={gesture}>
        <View
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            if (width && height) onMeasure(node.id, width, height);
          }}
          style={{
            position: 'absolute',
            left: node.x,
            top: node.y,
            transform: [{ translateX: -w / 2 }, { translateY: -h / 2 }],
          }}
        >
          <View
            className={`px-4 py-2 rounded-2xl ${ring}`}
            style={{ backgroundColor: node.color, maxWidth: 220 }}
          >
            <Text className="text-white font-semibold text-center" numberOfLines={2}>
              {node.text || '…'}
            </Text>
          </View>
        </View>
      </GestureDetector>
    );
  },
  (a, b) =>
    a.node === b.node &&
    a.selected === b.selected &&
    a.connecting === b.connecting &&
    a.tool === b.tool &&
    a.size?.w === b.size?.w &&
    a.size?.h === b.size?.h,
);

/* ───────────────────────────────── Screen ───────────────────────────────── */

export default function MindMapScreen() {
  const { items: maps, loading, create, update, remove } = useCollection<MindMap>(STORES.MINDMAPS);
  const toast = useToast();

  // editor state
  const [selectedMap, setSelectedMap] = useState<MindMap | null>(null);
  const mapRef = useRef<MindMap | null>(null); // latest map for gesture-end commits
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({});
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [zoomPct, setZoomPct] = useState(100);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  // modal state
  const [editingNode, setEditingNode] = useState<MindMapNode | null>(null);
  const [nodeText, setNodeText] = useState('');
  const [editingEdge, setEditingEdge] = useState<MindMapEdge | null>(null);
  const [edgeLabel, setEdgeLabel] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<MapType>('mindmap');
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  // refs read by stable gesture callbacks
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const connectingRef = useRef(connectingFrom);
  connectingRef.current = connectingFrom;
  const centeredFor = useRef<string | null>(null);
  const canvasPanRef = useRef<GestureType | undefined>(undefined);

  // canvas transform (UI thread)
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const originWX = useSharedValue(0);
  const originWY = useSharedValue(0);

  const worldStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  const canvasPan = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .withRef(canvasPanRef)
        .onChange((e) => {
          tx.value += e.changeX;
          ty.value += e.changeY;
        }),
    [tx, ty],
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((e) => {
          savedScale.value = scale.value;
          originWX.value = (e.focalX - tx.value) / scale.value;
          originWY.value = (e.focalY - ty.value) / scale.value;
        })
        .onUpdate((e) => {
          const ns = clampW(savedScale.value * e.scale, MIN_SCALE, MAX_SCALE);
          scale.value = ns;
          tx.value = e.focalX - originWX.value * ns;
          ty.value = e.focalY - originWY.value * ns;
        })
        .onEnd(() => {
          runOnJS(setZoomPct)(Math.round(scale.value * 100));
        }),
    [tx, ty, scale, savedScale, originWX, originWY],
  );

  const canvasGesture = useMemo(() => Gesture.Simultaneous(canvasPan, pinch), [canvasPan, pinch]);

  /* ── persistence ── */

  // Persist through the hook so the list cards never go stale (a raw dbService.put
  // does not emit on the sync bus locally). updatedAt is bumped like the web view.
  const persist = useCallback(
    (map: MindMap) => {
      const updated = { ...map, updatedAt: new Date().toISOString() };
      mapRef.current = updated;
      setSelectedMap(updated);
      update(updated);
    },
    [update],
  );

  /* ── drag (live, commit once on end) ── */

  const onDragBegin = useCallback((id: string) => {
    setSelectedNode(id);
  }, []);

  const onDragMove = useCallback((id: string, dx: number, dy: number) => {
    setSelectedMap((prev) => {
      if (!prev) return prev;
      const nodes = prev.nodes.map((n) => (n.id === id ? { ...n, x: n.x + dx, y: n.y + dy } : n));
      const next = { ...prev, nodes };
      mapRef.current = next;
      return next;
    });
  }, []);

  const onDragEnd = useCallback(() => {
    if (mapRef.current) persist(mapRef.current);
  }, [persist]);

  const onMeasure = useCallback((id: string, w: number, h: number) => {
    setSizes((prev) => {
      const cur = prev[id];
      if (cur && Math.abs(cur.w - w) < 0.5 && Math.abs(cur.h - h) < 0.5) return prev;
      return { ...prev, [id]: { w, h } };
    });
  }, []);

  /* ── connecting ── */

  const connectNodes = useCallback(
    (fromId: string, toId: string) => {
      const map = mapRef.current;
      if (!map || fromId === toId) {
        setConnectingFrom(null);
        return;
      }
      const exists = map.edges.some(
        (e) => (e.from === fromId && e.to === toId) || (e.from === toId && e.to === fromId),
      );
      if (exists) {
        setConnectingFrom(null);
        return;
      }
      const newEdge: MindMapEdge = {
        id: newId(),
        from: fromId,
        to: toId,
        label: map.type === 'decision-tree' ? 'Option' : undefined,
      };
      persist({ ...map, edges: [...map.edges, newEdge] });
      setConnectingFrom(null);
      if (map.type === 'decision-tree') {
        setEditingEdge(newEdge);
        setEdgeLabel(newEdge.label || '');
      }
    },
    [persist],
  );

  const onNodeTap = useCallback(
    (id: string) => {
      if (toolRef.current === 'connect') {
        if (!connectingRef.current) setConnectingFrom(id);
        else connectNodes(connectingRef.current, id);
        return;
      }
      setSelectedNode((cur) => (cur === id ? cur : id));
    },
    [connectNodes],
  );

  /* ── node ops ── */

  const addNode = useCallback(
    (parentId?: string) => {
      const map = mapRef.current;
      if (!map) return;
      const parent = parentId ? map.nodes.find((n) => n.id === parentId) : null;
      const node: MindMapNode = {
        id: newId(),
        x: parent ? parent.x + 150 : 360 + Math.random() * 120,
        y: parent ? parent.y + (Math.random() > 0.5 ? 90 : -90) : 260 + Math.random() * 120,
        text: map.type === 'decision-tree' ? 'Decision' : 'New Idea',
        color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
        isDecision: map.type === 'decision-tree',
      };
      const edges = [...map.edges];
      if (parentId) {
        edges.push({
          id: newId(),
          from: parentId,
          to: node.id,
          label: map.type === 'decision-tree' ? 'Option' : undefined,
        });
      }
      persist({ ...map, nodes: [...map.nodes, node], edges });
      setSelectedNode(node.id);
    },
    [persist],
  );

  const deleteNode = useCallback(
    async (id: string) => {
      const map = mapRef.current;
      if (!map) return;
      const node = map.nodes.find((n) => n.id === id);
      if (node?.isRoot) {
        toast.show('The root node cannot be deleted', 'info');
        return;
      }
      const ok = await confirmDialog({
        title: 'Delete node',
        message: 'Remove this node and its connections?',
        confirmText: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      persist({
        ...map,
        nodes: map.nodes.filter((n) => n.id !== id),
        edges: map.edges.filter((e) => e.from !== id && e.to !== id),
      });
      setSelectedNode(null);
    },
    [persist, toast],
  );

  const changeColor = useCallback(
    (id: string, color: string) => {
      const map = mapRef.current;
      if (!map) return;
      persist({ ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, color } : n)) });
    },
    [persist],
  );

  const openNodeEditor = useCallback((node: MindMapNode) => {
    setEditingNode(node);
    setNodeText(node.text);
  }, []);

  const saveNodeText = useCallback(() => {
    const map = mapRef.current;
    if (!map || !editingNode) return;
    const text = nodeText.trim();
    persist({
      ...map,
      nodes: map.nodes.map((n) => (n.id === editingNode.id ? { ...n, text: text || n.text } : n)),
    });
    setEditingNode(null);
    setNodeText('');
  }, [persist, editingNode, nodeText]);

  /* ── edge ops ── */

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const map = mapRef.current;
      if (!map) return;
      persist({ ...map, edges: map.edges.filter((e) => e.id !== edgeId) });
      setEditingEdge(null);
      setEdgeLabel('');
    },
    [persist],
  );

  const saveEdgeLabel = useCallback(() => {
    const map = mapRef.current;
    if (!map || !editingEdge) return;
    persist({
      ...map,
      edges: map.edges.map((e) =>
        e.id === editingEdge.id ? { ...e, label: edgeLabel.trim() || undefined } : e,
      ),
    });
    setEditingEdge(null);
    setEdgeLabel('');
  }, [persist, editingEdge, edgeLabel]);

  const onEdgeTap = useCallback(
    async (edge: MindMapEdge) => {
      const map = mapRef.current;
      if (!map) return;
      if (map.type === 'decision-tree') {
        setEditingEdge(edge);
        setEdgeLabel(edge.label || '');
      } else {
        const ok = await confirmDialog({
          title: 'Delete connection',
          message: 'Remove this connection?',
          confirmText: 'Delete',
          destructive: true,
        });
        if (ok) deleteEdge(edge.id);
      }
    },
    [deleteEdge],
  );

  /* ── map open / close / delete / create ── */

  const openMap = useCallback((map: MindMap) => {
    mapRef.current = map;
    setSelectedMap(map);
    setSelectedNode(null);
    setConnectingFrom(null);
    setTool('select');
    setSizes({});
    centeredFor.current = null;
  }, []);

  const closeEditor = useCallback(() => {
    setSelectedMap(null);
    mapRef.current = null;
    setSelectedNode(null);
    setConnectingFrom(null);
  }, []);

  const deleteMap = useCallback(
    async (map: MindMap) => {
      const ok = await confirmDialog({
        title: 'Delete mind map',
        message: `Delete “${map.title}”?`,
        confirmText: 'Delete',
        destructive: true,
      });
      if (!ok) return;
      remove(map.id);
      if (mapRef.current?.id === map.id) closeEditor();
      toast.show('Mind map deleted', 'info');
    },
    [remove, toast, closeEditor],
  );

  const openCreate = useCallback(() => {
    setNewTitle('');
    setNewType('mindmap');
    setCreating(true);
  }, []);

  const createMap = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    const root: MindMapNode = {
      id: newId(),
      x: 400,
      y: 300,
      text: newType === 'decision-tree' ? 'Start' : 'Main Idea',
      color: NODE_COLORS[0],
      isRoot: true,
      isDecision: newType === 'decision-tree',
    };
    const map: MindMap = {
      id: newId(),
      title,
      nodes: [root],
      edges: [],
      type: newType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    create(map);
    setCreating(false);
    setNewTitle('');
    openMap(map);
  }, [newTitle, newType, create, openMap]);

  /* ── AI generation (ported from web) ── */

  const generateWithAI = useCallback(async () => {
    const topic = aiPrompt.trim();
    if (!topic || !isApiConfigured()) return;
    setAiBusy(true);
    try {
      const prompt = `Generate a mind map structure for the topic: "${topic}".
Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "title": "Topic Title",
  "nodes": [
    {"id": "1", "text": "Main Idea", "isRoot": true, "children": ["2", "3", "4"]},
    {"id": "2", "text": "Subtopic 1", "children": ["5", "6"]},
    {"id": "3", "text": "Subtopic 2", "children": []},
    {"id": "4", "text": "Subtopic 3", "children": ["7"]},
    {"id": "5", "text": "Detail 1", "children": []},
    {"id": "6", "text": "Detail 2", "children": []},
    {"id": "7", "text": "Detail 3", "children": []}
  ]
}
Create 5-10 nodes with a logical hierarchy. Keep text concise (2-4 words each).`;

      const response = await generateResponse(prompt);
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid AI response');
      const data = JSON.parse(jsonMatch[0]);

      const centerX = 400;
      const centerY = 300;
      const nodes: MindMapNode[] = [];
      const edges: MindMapEdge[] = [];
      const pos: Record<string, { x: number; y: number }> = {};

      const root = data.nodes?.find((n: any) => n.isRoot);
      if (root) {
        pos[root.id] = { x: centerX, y: centerY };
        const place = (
          parentId: string,
          px: number,
          py: number,
          level: number,
          startAngle: number,
          angleSpan: number,
        ) => {
          const parent = data.nodes.find((n: any) => n.id === parentId);
          if (!parent?.children?.length) return;
          const radius = 140 + level * 90;
          const step = angleSpan / parent.children.length;
          parent.children.forEach((childId: string, index: number) => {
            const angle = startAngle + step * (index + 0.5);
            const x = px + Math.cos(angle) * radius;
            const y = py + Math.sin(angle) * radius;
            pos[childId] = { x, y };
            place(childId, x, y, level + 1, angle - step / 2, step);
          });
        };
        place(root.id, centerX, centerY, 0, 0, Math.PI * 2);
      }

      (data.nodes || []).forEach((n: any, index: number) => {
        const p = pos[n.id] || {
          x: centerX + Math.random() * 200,
          y: centerY + Math.random() * 200,
        };
        nodes.push({
          id: n.id,
          x: p.x,
          y: p.y,
          text: n.text,
          color: NODE_COLORS[index % NODE_COLORS.length],
          isRoot: !!n.isRoot,
          isDecision: false,
        });
        if (n.children) {
          n.children.forEach((childId: string) => {
            edges.push({ id: newId(), from: n.id, to: childId });
          });
        }
      });

      const map: MindMap = {
        id: newId(),
        title: data.title || topic,
        nodes,
        edges,
        type: 'mindmap',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      create(map);
      setAiOpen(false);
      setAiPrompt('');
      openMap(map);
      toast.show('Mind map generated', 'success');
    } catch {
      toast.show('Failed to generate mind map. Please try again.', 'error');
    } finally {
      setAiBusy(false);
    }
  }, [aiPrompt, create, openMap, toast]);

  /* ── viewport / zoom ── */

  const onViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setViewport((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  }, []);

  // Centre the root in view once per opened map.
  React.useEffect(() => {
    if (!selectedMap || viewport.w === 0) return;
    if (centeredFor.current === selectedMap.id) return;
    centeredFor.current = selectedMap.id;
    const root = selectedMap.nodes.find((n) => n.isRoot) || selectedMap.nodes[0];
    const rx = root ? root.x : WORLD / 2;
    const ry = root ? root.y : WORLD / 2;
    scale.value = 1;
    savedScale.value = 1;
    tx.value = viewport.w / 2 - rx;
    ty.value = viewport.h / 2 - ry;
    setZoomPct(100);
  }, [selectedMap, viewport.w, viewport.h, scale, savedScale, tx, ty]);

  const zoomBy = useCallback(
    (factor: number) => {
      const ns = Math.min(Math.max(scale.value * factor, MIN_SCALE), MAX_SCALE);
      const cx = viewport.w / 2;
      const cy = viewport.h / 2;
      const wx = (cx - tx.value) / scale.value;
      const wy = (cy - ty.value) / scale.value;
      tx.value = cx - wx * ns;
      ty.value = cy - wy * ns;
      scale.value = ns;
      savedScale.value = ns;
      setZoomPct(Math.round(ns * 100));
    },
    [viewport.w, viewport.h, scale, savedScale, tx, ty],
  );

  const byId = useMemo(() => {
    const m: Record<string, MindMapNode> = {};
    selectedMap?.nodes.forEach((n) => (m[n.id] = n));
    return m;
  }, [selectedMap]);

  const selNode = selectedMap?.nodes.find((n) => n.id === selectedNode) || null;

  /* ───────────────────────── LIST VIEW ───────────────────────── */

  if (!selectedMap) {
    return (
      <Screen padded={false}>
        <AppHeader
          title="Mind Maps"
          subtitle="Mind maps & decision trees"
          right={
            isApiConfigured() ? (
              <Pressable
                onPress={() => {
                  setAiPrompt('');
                  setAiOpen(true);
                }}
                hitSlop={8}
                className="flex-row items-center bg-purple-600 rounded-full px-3 py-2 active:opacity-80"
              >
                <Sparkles size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm ml-1.5">AI</Text>
              </Pressable>
            ) : undefined
          }
        />

        {loading ? (
          <Spinner label="Loading mind maps…" />
        ) : maps.length === 0 ? (
          <EmptyState
            icon={<Network size={42} color="#3B82F6" />}
            title="No mind maps yet"
            subtitle="Map out an idea or sketch a decision tree."
            ctaTitle="New mind map"
            onCta={openCreate}
          />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
            {maps.map((map) => (
              <View key={map.id} className="mb-3">
                <Card onPress={() => openMap(map)}>
                  <View className="flex-row items-start">
                    <View className="mr-3 mt-0.5">
                      {map.type === 'decision-tree' ? (
                        <GitBranch size={22} color="#10B981" />
                      ) : (
                        <Network size={22} color="#3B82F6" />
                      )}
                    </View>
                    <View className="flex-1">
                      <Text className="text-ink text-base font-semibold" numberOfLines={1}>
                        {map.title}
                      </Text>
                      <Text className="text-ink-muted text-sm mt-1">
                        {map.nodes.length} nodes · {map.edges.length} connections
                      </Text>
                      <Text className="text-ink-muted text-xs mt-1">
                        Updated {new Date(map.updatedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => deleteMap(map)}
                      hitSlop={8}
                      className="p-1.5 active:opacity-60"
                    >
                      <Trash2 size={18} color="#9ca3af" />
                    </Pressable>
                  </View>
                </Card>
              </View>
            ))}
          </ScrollView>
        )}

        <Pressable
          onPress={openCreate}
          className="absolute bottom-6 right-5 w-14 h-14 rounded-full bg-accent items-center justify-center active:bg-accent-hover"
          style={{ elevation: 6 }}
        >
          <Plus size={28} color="#fff" />
        </Pressable>

        <CreateMapModal
          visible={creating}
          title={newTitle}
          type={newType}
          onTitle={setNewTitle}
          onType={setNewType}
          onCancel={() => setCreating(false)}
          onCreate={createMap}
        />
        <AiModal
          visible={aiOpen}
          prompt={aiPrompt}
          busy={aiBusy}
          onPrompt={setAiPrompt}
          onCancel={() => setAiOpen(false)}
          onGenerate={generateWithAI}
        />
      </Screen>
    );
  }

  /* ───────────────────────── EDITOR VIEW ───────────────────────── */

  return (
    <Screen padded={false}>
      {/* toolbar */}
      <View className="flex-row items-center justify-between px-3 py-2 border-b border-hairline bg-midnight-light">
        <View className="flex-row items-center flex-1 mr-2">
          <Pressable onPress={closeEditor} hitSlop={8} className="mr-2 p-1 active:opacity-60">
            <ArrowLeft size={22} color="#e2e8f0" />
          </Pressable>
          {selectedMap.type === 'decision-tree' ? (
            <GitBranch size={18} color="#10B981" />
          ) : (
            <Network size={18} color="#3B82F6" />
          )}
          <Text className="text-ink font-semibold ml-2 flex-1" numberOfLines={1}>
            {selectedMap.title}
          </Text>
        </View>

        <View className="flex-row items-center">
          <View className="flex-row bg-midnight rounded-full p-0.5 mr-1">
            <Pressable
              onPress={() => {
                setTool('select');
                setConnectingFrom(null);
              }}
              className={`p-2 rounded-full ${tool === 'select' ? 'bg-accent' : ''} active:opacity-80`}
            >
              <MousePointer size={16} color={tool === 'select' ? '#fff' : '#9ca3af'} />
            </Pressable>
            <Pressable
              onPress={() => setTool('connect')}
              className={`p-2 rounded-full ${tool === 'connect' ? 'bg-accent' : ''} active:opacity-80`}
            >
              <Link2 size={16} color={tool === 'connect' ? '#fff' : '#9ca3af'} />
            </Pressable>
          </View>

          <Pressable onPress={() => zoomBy(1 / 1.25)} hitSlop={6} className="p-1.5 active:opacity-60">
            <ZoomOut size={18} color="#9ca3af" />
          </Pressable>
          <Text className="text-ink-muted text-xs w-10 text-center">{zoomPct}%</Text>
          <Pressable onPress={() => zoomBy(1.25)} hitSlop={6} className="p-1.5 active:opacity-60">
            <ZoomIn size={18} color="#9ca3af" />
          </Pressable>

          <Pressable
            onPress={() => addNode(selectedNode || undefined)}
            className="flex-row items-center bg-accent rounded-full px-3 py-2 ml-1 active:bg-accent-hover"
          >
            <Plus size={16} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* canvas */}
      <View className="flex-1 overflow-hidden bg-midnight" onLayout={onViewportLayout}>
        <GestureDetector gesture={canvasGesture}>
          <View style={{ flex: 1 }}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: WORLD,
                  height: WORLD,
                  transformOrigin: 'top left',
                },
                worldStyle,
              ]}
            >
              <Svg
                width={WORLD}
                height={WORLD}
                pointerEvents="none"
                style={{ position: 'absolute', left: 0, top: 0 }}
              >
                <Defs>
                  <Pattern id="grid" width={40} height={40} patternUnits="userSpaceOnUse">
                    <Path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a2e" strokeWidth={1} />
                  </Pattern>
                </Defs>
                <Rect x={0} y={0} width={WORLD} height={WORLD} fill="url(#grid)" />

                {selectedMap.edges.map((edge) => {
                  const f = byId[edge.from];
                  const t = byId[edge.to];
                  if (!f || !t) return null;
                  return (
                    <React.Fragment key={edge.id}>
                      <Line x1={f.x} y1={f.y} x2={t.x} y2={t.y} stroke="#4B5563" strokeWidth={2} />
                      <Polygon points={arrowPoints(f, t)} fill="#4B5563" />
                    </React.Fragment>
                  );
                })}
              </Svg>

              {/* edge handles (tap target lives in world space) */}
              {selectedMap.edges.map((edge) => {
                const f = byId[edge.from];
                const t = byId[edge.to];
                if (!f || !t) return null;
                const mx = (f.x + t.x) / 2;
                const my = (f.y + t.y) / 2;
                const dt = selectedMap.type === 'decision-tree';
                return (
                  <Pressable
                    key={`h-${edge.id}`}
                    onPress={() => onEdgeTap(edge)}
                    hitSlop={8}
                    style={{ position: 'absolute', left: mx, top: my, transform: [{ translateX: -16 }, { translateY: -12 }] }}
                    className="flex-row items-center justify-center rounded-full bg-midnight-lighter border border-hairline px-2 py-1 active:opacity-80"
                  >
                    {dt ? (
                      <Text className="text-ink text-[11px]" numberOfLines={1}>
                        {edge.label || 'label'}
                      </Text>
                    ) : (
                      <X size={12} color="#9ca3af" />
                    )}
                  </Pressable>
                );
              })}

              {/* nodes */}
              {selectedMap.nodes.map((node) => (
                <NodeView
                  key={node.id}
                  node={node}
                  selected={selectedNode === node.id}
                  connecting={connectingFrom === node.id}
                  tool={tool}
                  scale={scale}
                  canvasPanRef={canvasPanRef}
                  size={sizes[node.id]}
                  onTap={onNodeTap}
                  onDragBegin={onDragBegin}
                  onDragMove={onDragMove}
                  onDragEnd={onDragEnd}
                  onMeasure={onMeasure}
                />
              ))}
            </Animated.View>
          </View>
        </GestureDetector>

        {connectingFrom ? (
          <View className="absolute top-3 self-center flex-row items-center bg-accent rounded-full px-3 py-1.5">
            <Text className="text-white text-sm font-medium">
              {connectingRef.current ? 'Tap another node to connect' : 'Tap a node to start'}
            </Text>
            <Pressable
              onPress={() => {
                setConnectingFrom(null);
                setTool('select');
              }}
              hitSlop={8}
              className="ml-2 active:opacity-60"
            >
              <X size={16} color="#fff" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* contextual action bar */}
      {selNode && tool === 'select' ? (
        <View className="border-t border-hairline bg-midnight-light px-3 py-2">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <ActionButton icon={<Pencil size={16} color="#e2e8f0" />} label="Edit" onPress={() => openNodeEditor(selNode)} />
            <ActionButton icon={<Plus size={16} color="#10B981" />} label="Add child" onPress={() => addNode(selNode.id)} />
            <ActionButton
              icon={<Link2 size={16} color="#3B82F6" />}
              label="Connect"
              onPress={() => {
                setTool('connect');
                setConnectingFrom(selNode.id);
              }}
            />
            {!selNode.isRoot ? (
              <ActionButton icon={<Trash2 size={16} color="#f87171" />} label="Delete" onPress={() => deleteNode(selNode.id)} />
            ) : null}
            <View className="flex-row items-center ml-1 pl-2 border-l border-hairline">
              {NODE_COLORS.map((color) => (
                <Pressable
                  key={color}
                  onPress={() => changeColor(selNode.id, color)}
                  className="mx-1 rounded-full"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: color,
                    borderWidth: selNode.color === color ? 2 : 0,
                    borderColor: '#fff',
                  }}
                />
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* help */}
      <View className="px-3 py-2 border-t border-hairline bg-midnight-light">
        <Text className="text-ink-muted text-xs text-center">{HELP_TEXT}</Text>
      </View>

      {/* node text modal */}
      <Modal
        visible={!!editingNode}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingNode(null)}
      >
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setEditingNode(null)}>
          <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
            <Text className="text-ink text-lg font-bold mb-4">Edit node</Text>
            <Input
              placeholder="Node text"
              value={nodeText}
              onChangeText={setNodeText}
              autoFocus
              className="mb-5"
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => setEditingNode(null)}
                className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80"
              >
                <Text className="text-ink font-semibold">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={saveNodeText}
                className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover"
              >
                <Text className="text-white font-bold">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* edge label modal (decision trees) */}
      <Modal
        visible={!!editingEdge}
        transparent
        animationType="slide"
        onRequestClose={() => setEditingEdge(null)}
      >
        <Pressable className="flex-1 bg-black/60 justify-end" onPress={() => setEditingEdge(null)}>
          <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
            <Text className="text-ink text-lg font-bold mb-4">Connection label</Text>
            <Input
              placeholder="e.g. Yes, No, Maybe…"
              value={edgeLabel}
              onChangeText={setEdgeLabel}
              autoFocus
              className="mb-5"
            />
            <View className="flex-row gap-3">
              <Pressable
                onPress={() => editingEdge && deleteEdge(editingEdge.id)}
                className="flex-1 items-center py-3.5 rounded-full bg-red-500/15 active:bg-red-500/25"
              >
                <Text className="text-red-400 font-semibold">Delete</Text>
              </Pressable>
              <Pressable
                onPress={saveEdgeLabel}
                className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover"
              >
                <Text className="text-white font-bold">Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

/* ───────────────────────────── helpers / sub-components ───────────────────────────── */

function arrowPoints(from: MindMapNode, to: MindMapNode): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ang = Math.atan2(dy, dx);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  const px = to.x - 20 * cos;
  const py = to.y - 20 * sin;
  return [
    [-6, -4],
    [0, 0],
    [-6, 4],
  ]
    .map(([x, y]) => `${px + (x * cos - y * sin)},${py + (x * sin + y * cos)}`)
    .join(' ');
}

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center bg-midnight rounded-full px-3 py-2 mr-2 active:opacity-80"
    >
      {icon}
      <Text className="text-ink text-sm font-medium ml-1.5">{label}</Text>
    </Pressable>
  );
}

function CreateMapModal({
  visible,
  title,
  type,
  onTitle,
  onType,
  onCancel,
  onCreate,
}: {
  visible: boolean;
  title: string;
  type: MapType;
  onTitle: (v: string) => void;
  onType: (v: MapType) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <Text className="text-ink text-lg font-bold mb-4">New mind map</Text>
          <Input placeholder="Mind map title" value={title} onChangeText={onTitle} autoFocus className="mb-4" />
          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Type</Text>
          <SegmentedControl<MapType>
            value={type}
            onChange={onType}
            segments={[
              { label: 'Mind Map', value: 'mindmap' },
              { label: 'Decision Tree', value: 'decision-tree' },
            ]}
            className="mb-5"
          />
          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80"
            >
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onCreate}
              className="flex-1 items-center py-3.5 rounded-full bg-accent active:bg-accent-hover"
            >
              <Text className="text-white font-bold">Create</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function AiModal({
  visible,
  prompt,
  busy,
  onPrompt,
  onCancel,
  onGenerate,
}: {
  visible: boolean;
  prompt: string;
  busy: boolean;
  onPrompt: (v: string) => void;
  onCancel: () => void;
  onGenerate: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable className="flex-1 bg-black/60 justify-end" onPress={busy ? undefined : onCancel}>
        <Pressable className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8">
          <View className="flex-row items-center mb-3">
            <Sparkles size={20} color="#a855f7" />
            <Text className="text-ink text-lg font-bold ml-2">AI mind map generator</Text>
          </View>
          <Text className="text-ink-muted text-sm mb-4">
            Enter a topic and AI will sketch a starter mind map for you.
          </Text>
          <Input
            placeholder="e.g. Learn React, Plan a trip…"
            value={prompt}
            onChangeText={onPrompt}
            editable={!busy}
            autoFocus
            className="mb-5"
          />
          <View className="flex-row gap-3">
            <Pressable
              onPress={onCancel}
              disabled={busy}
              className={`flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80 ${busy ? 'opacity-50' : ''}`}
            >
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onGenerate}
              disabled={busy || !prompt.trim()}
              className={`flex-1 flex-row items-center justify-center py-3.5 rounded-full bg-purple-600 active:opacity-80 ${
                busy || !prompt.trim() ? 'opacity-50' : ''
              }`}
            >
              <Sparkles size={16} color="#fff" />
              <Text className="text-white font-bold ml-1.5">{busy ? 'Generating…' : 'Generate'}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
