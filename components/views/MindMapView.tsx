import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Pencil, GitBranch, Network, MousePointer, Link2, ZoomIn, ZoomOut, Sparkles, Loader2, ChevronLeft, ListPlus } from 'lucide-react';
import { MindMap, MindMapNode, MindMapEdge } from '../../types';
import { dbService, STORES } from '../../services/db';
import { generateResponse, isApiConfigured } from '../../services/geminiService';
import {
  cx, PageShell, Card, Segmented, Modal, ModalBody, ModalFooter, Field, IconBtn, Empty, inputCls,
  useTaskToast, useCreateLinkedTask,
} from '../ui-kit';

const NODE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

const MindMapView: React.FC = () => {
  const [mindMaps, setMindMaps] = useState<MindMap[]>([]);
  const [selectedMap, setSelectedMap] = useState<MindMap | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newMapTitle, setNewMapTitle] = useState('');
  const [newMapType, setNewMapType] = useState<'mindmap' | 'decision-tree'>('mindmap');
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editingNodeText, setEditingNodeText] = useState('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'connect'>('select');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const [edgeLabelText, setEdgeLabelText] = useState('');
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const toast = useTaskToast();
  const createLinkedTask = useCreateLinkedTask();

  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const draggedNode = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadMindMaps();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'mindmaps') {
        loadMindMaps();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const loadMindMaps = async () => {
    const maps = await dbService.getAll<MindMap>(STORES.MINDMAPS);
    setMindMaps(maps);
  };

  const createMindMap = async () => {
    if (!newMapTitle.trim()) return;

    const centerX = 400;
    const centerY = 300;

    const rootNode: MindMapNode = {
      id: crypto.randomUUID(),
      x: centerX,
      y: centerY,
      text: newMapType === 'decision-tree' ? 'Start' : 'Main Idea',
      color: NODE_COLORS[0],
      isRoot: true,
      isDecision: newMapType === 'decision-tree',
    };

    const newMap: MindMap = {
      id: crypto.randomUUID(),
      title: newMapTitle,
      nodes: [rootNode],
      edges: [],
      type: newMapType,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dbService.put(STORES.MINDMAPS, newMap);
    setMindMaps([...mindMaps, newMap]);
    setNewMapTitle('');
    setIsCreating(false);
    setSelectedMap(newMap);
  };

  const deleteMindMap = async (id: string) => {
    if (!confirm('Delete this mind map?')) return;
    await dbService.delete(STORES.MINDMAPS, id);
    setMindMaps(mindMaps.filter(m => m.id !== id));
    if (selectedMap?.id === id) {
      setSelectedMap(null);
    }
  };

  const saveMap = async (map: MindMap) => {
    const updated = { ...map, updatedAt: new Date().toISOString() };
    await dbService.put(STORES.MINDMAPS, updated);
    setMindMaps(mindMaps.map(m => m.id === updated.id ? updated : m));
    setSelectedMap(updated);
  };

  const generateWithAI = async () => {
    if (!aiPrompt.trim() || !isApiConfigured()) return;
    
    setIsGenerating(true);
    try {
      const prompt = `Generate a mind map structure for the topic: "${aiPrompt}". 
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
      
      // Parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Invalid AI response');
      
      const data = JSON.parse(jsonMatch[0]);
      
      // Convert to mindmap structure with positions
      const centerX = 400;
      const centerY = 300;
      const nodes: MindMapNode[] = [];
      const edges: MindMapEdge[] = [];
      const nodePositions: Record<string, {x: number, y: number}> = {};
      
      // Calculate positions in radial layout
      const rootNode = data.nodes.find((n: any) => n.isRoot);
      if (rootNode) {
        nodePositions[rootNode.id] = { x: centerX, y: centerY };
        
        // Position children in circles
        const positionChildren = (parentId: string, parentX: number, parentY: number, level: number, startAngle: number, angleSpan: number) => {
          const parent = data.nodes.find((n: any) => n.id === parentId);
          if (!parent?.children?.length) return;
          
          const radius = 120 + level * 80;
          const angleStep = angleSpan / parent.children.length;
          
          parent.children.forEach((childId: string, index: number) => {
            const angle = startAngle + angleStep * (index + 0.5);
            const x = parentX + Math.cos(angle) * radius;
            const y = parentY + Math.sin(angle) * radius;
            nodePositions[childId] = { x, y };
            positionChildren(childId, x, y, level + 1, angle - angleStep / 2, angleStep);
          });
        };
        
        positionChildren(rootNode.id, centerX, centerY, 0, 0, Math.PI * 2);
      }
      
      // Create nodes and edges
      data.nodes.forEach((n: any, index: number) => {
        const pos = nodePositions[n.id] || { x: centerX + Math.random() * 200, y: centerY + Math.random() * 200 };
        nodes.push({
          id: n.id,
          x: pos.x,
          y: pos.y,
          text: n.text,
          color: NODE_COLORS[index % NODE_COLORS.length],
          isRoot: n.isRoot || false,
          isDecision: false,
        });
        
        if (n.children) {
          n.children.forEach((childId: string) => {
            edges.push({
              id: crypto.randomUUID(),
              from: n.id,
              to: childId,
            });
          });
        }
      });
      
      const newMap: MindMap = {
        id: crypto.randomUUID(),
        title: data.title || aiPrompt,
        nodes,
        edges,
        type: 'mindmap',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await dbService.put(STORES.MINDMAPS, newMap);
      setMindMaps([...mindMaps, newMap]);
      setSelectedMap(newMap);
      setShowAiModal(false);
      setAiPrompt('');
    } catch (error) {
      console.error('AI generation failed:', error);
      toast('Failed to generate mind map. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const addNode = async (parentId?: string) => {
    if (!selectedMap) return;

    const parent = parentId ? selectedMap.nodes.find(n => n.id === parentId) : null;
    const newNode: MindMapNode = {
      id: crypto.randomUUID(),
      x: parent ? parent.x + 150 : 200 + Math.random() * 200,
      y: parent ? parent.y + (Math.random() > 0.5 ? 80 : -80) : 200 + Math.random() * 200,
      text: selectedMap.type === 'decision-tree' ? 'Decision' : 'New Idea',
      color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)],
      isDecision: selectedMap.type === 'decision-tree',
    };

    const newEdges = [...selectedMap.edges];
    if (parentId) {
      newEdges.push({
        id: crypto.randomUUID(),
        from: parentId,
        to: newNode.id,
        label: selectedMap.type === 'decision-tree' ? 'Option' : undefined,
      });
    }

    const updated = {
      ...selectedMap,
      nodes: [...selectedMap.nodes, newNode],
      edges: newEdges,
    };

    await saveMap(updated);
    setSelectedNode(newNode.id);
  };

  const deleteNode = async (nodeId: string) => {
    if (!selectedMap) return;
    const node = selectedMap.nodes.find(n => n.id === nodeId);
    if (node?.isRoot) return; // Can't delete root

    const updated = {
      ...selectedMap,
      nodes: selectedMap.nodes.filter(n => n.id !== nodeId),
      edges: selectedMap.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    };

    await saveMap(updated);
    setSelectedNode(null);
  };

  const updateNodeText = async () => {
    if (!selectedMap || !editingNode) return;

    const updated = {
      ...selectedMap,
      nodes: selectedMap.nodes.map(n =>
        n.id === editingNode ? { ...n, text: editingNodeText } : n
      ),
    };

    await saveMap(updated);
    setEditingNode(null);
    setEditingNodeText('');
  };

  const connectNodes = async (toId: string) => {
    if (!selectedMap || !connectingFrom || connectingFrom === toId) {
      setConnectingFrom(null);
      return;
    }

    // Check if edge already exists
    const exists = selectedMap.edges.some(
      e => (e.from === connectingFrom && e.to === toId) || (e.from === toId && e.to === connectingFrom)
    );

    if (exists) {
      setConnectingFrom(null);
      return;
    }

    const newEdge: MindMapEdge = {
      id: crypto.randomUUID(),
      from: connectingFrom,
      to: toId,
      label: selectedMap.type === 'decision-tree' ? 'Option' : undefined,
    };

    const updated = {
      ...selectedMap,
      edges: [...selectedMap.edges, newEdge],
    };

    await saveMap(updated);
    setConnectingFrom(null);
    setEditingEdge(newEdge.id);
    setEdgeLabelText(newEdge.label || '');
  };

  const updateEdgeLabel = async () => {
    if (!selectedMap || !editingEdge) return;

    const updated = {
      ...selectedMap,
      edges: selectedMap.edges.map(e =>
        e.id === editingEdge ? { ...e, label: edgeLabelText || undefined } : e
      ),
    };

    await saveMap(updated);
    setEditingEdge(null);
    setEdgeLabelText('');
  };

  const deleteEdge = async (edgeId: string) => {
    if (!selectedMap) return;

    const updated = {
      ...selectedMap,
      edges: selectedMap.edges.filter(e => e.id !== edgeId),
    };

    await saveMap(updated);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (tool === 'connect') {
      if (connectingFrom) {
        connectNodes(nodeId);
      } else {
        setConnectingFrom(nodeId);
      }
      return;
    }

    e.stopPropagation();
    isDragging.current = true;
    draggedNode.current = nodeId;
    
    const node = selectedMap?.nodes.find(n => n.id === nodeId);
    if (node) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: (e.clientX - rect.left) / zoom - pan.x - node.x,
          y: (e.clientY - rect.top) / zoom - pan.y - node.y,
        };
      }
    }
    setSelectedNode(nodeId);
  };

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPan(prev => ({ x: prev.x + dx / zoom, y: prev.y + dy / zoom }));
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!isDragging.current || !draggedNode.current || !selectedMap) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom - pan.x - dragOffset.current.x;
    const y = (e.clientY - rect.top) / zoom - pan.y - dragOffset.current.y;

    const updated = {
      ...selectedMap,
      nodes: selectedMap.nodes.map(n =>
        n.id === draggedNode.current ? { ...n, x, y } : n
      ),
    };

    setSelectedMap(updated);
  }, [selectedMap, zoom, pan, isPanning, dragStart]);

  const handleMouseUp = useCallback(async () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDragging.current && selectedMap) {
      await saveMap(selectedMap);
    }
    isDragging.current = false;
    draggedNode.current = null;
  }, [selectedMap, isPanning]);

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  // Touch event handlers for mobile
  const handleCanvasTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single finger - start panning
      setIsPanning(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    } else if (e.touches.length === 2) {
      // Two fingers - pinch to zoom (store initial distance)
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      lastPinchDistance.current = distance;
    }
  };

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault(); // Prevent page scrolling

    if (e.touches.length === 2 && lastPinchDistance.current > 0) {
      // Pinch to zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
      const scale = distance / lastPinchDistance.current;
      setZoom(prev => Math.min(Math.max(prev * scale, 0.25), 2));
      lastPinchDistance.current = distance;
      return;
    }

    if (isPanning && e.touches.length === 1) {
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;
      setPan(prev => ({ x: prev.x + dx / zoom, y: prev.y + dy / zoom }));
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
      return;
    }

    if (!isDragging.current || !draggedNode.current || !selectedMap) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || e.touches.length !== 1) return;

    const x = (e.touches[0].clientX - rect.left) / zoom - pan.x - dragOffset.current.x;
    const y = (e.touches[0].clientY - rect.top) / zoom - pan.y - dragOffset.current.y;

    const updated = {
      ...selectedMap,
      nodes: selectedMap.nodes.map(n =>
        n.id === draggedNode.current ? { ...n, x, y } : n
      ),
    };

    setSelectedMap(updated);
  }, [selectedMap, zoom, pan, isPanning, dragStart]);

  const handleTouchEnd = useCallback(async () => {
    lastPinchDistance.current = 0;
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDragging.current && selectedMap) {
      await saveMap(selectedMap);
    }
    isDragging.current = false;
    draggedNode.current = null;
  }, [selectedMap, isPanning]);

  const handleNodeTouchStart = (e: React.TouchEvent, nodeId: string) => {
    if (tool === 'connect') {
      if (connectingFrom) {
        connectNodes(nodeId);
      } else {
        setConnectingFrom(nodeId);
      }
      return;
    }

    e.stopPropagation();
    isDragging.current = true;
    draggedNode.current = nodeId;
    
    const node = selectedMap?.nodes.find(n => n.id === nodeId);
    if (node && e.touches.length === 1) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        dragOffset.current = {
          x: (e.touches[0].clientX - rect.left) / zoom - pan.x - node.x,
          y: (e.touches[0].clientY - rect.top) / zoom - pan.y - node.y,
        };
      }
    }
    setSelectedNode(nodeId);
  };

  // Ref for pinch zoom
  const lastPinchDistance = useRef(0);

  const changeNodeColor = async (nodeId: string, color: string) => {
    if (!selectedMap) return;

    const updated = {
      ...selectedMap,
      nodes: selectedMap.nodes.map(n =>
        n.id === nodeId ? { ...n, color } : n
      ),
    };

    await saveMap(updated);
  };

  const closeAiModal = () => {
    if (isGenerating) return;
    setShowAiModal(false);
    setAiPrompt('');
  };

  const closeEdgeEditor = () => {
    setEditingEdge(null);
    setEdgeLabelText('');
  };

  const createTaskFromNode = (nodeId: string) => {
    const node = selectedMap?.nodes.find(n => n.id === nodeId);
    if (node) createLinkedTask({ title: node.text });
  };

  const aiModal = (
    <Modal open={showAiModal} onClose={closeAiModal} title="AI mind map generator">
      <ModalBody>
        <p className={`text-sm ${cx.muted}`}>Enter a topic and AI will generate a mind map for you.</p>
        <Field label="Topic">
          <input
            type="text"
            placeholder="e.g., Learn React, Plan vacation..."
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            className={inputCls}
            autoFocus
            disabled={isGenerating}
            onKeyDown={(e) => e.key === 'Enter' && !isGenerating && generateWithAI()}
          />
        </Field>
      </ModalBody>
      <ModalFooter>
        <button onClick={closeAiModal} className={cx.btnGhost} disabled={isGenerating}>Cancel</button>
        <button
          onClick={generateWithAI}
          disabled={!aiPrompt.trim() || isGenerating}
          className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}
        >
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {isGenerating ? 'Generating…' : 'Generate'}
        </button>
      </ModalFooter>
    </Modal>
  );

  // List view when no map selected
  if (!selectedMap) {
    return (
      <PageShell
        title="Mind Maps"
        subtitle="Create mind maps and decision trees"
        wide
        actions={
          <div className="flex items-center gap-2">
            {isApiConfigured() && (
              <button onClick={() => setShowAiModal(true)} className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`} aria-label="AI generate" title="AI generate">
                <Sparkles size={18} />
                <span className="hidden sm:inline">AI generate</span>
              </button>
            )}
            <button onClick={() => setIsCreating(true)} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`} aria-label="New map" title="New map">
              <Plus size={18} />
              <span className="hidden sm:inline">New map</span>
            </button>
          </div>
        }
      >
        {isCreating && (
          <Card className="mb-4">
            <div className="flex flex-col gap-4">
              <Field label="Title">
                <input
                  type="text"
                  placeholder="Mind map title..."
                  value={newMapTitle}
                  onChange={(e) => setNewMapTitle(e.target.value)}
                  className={inputCls}
                  autoFocus
                />
              </Field>
              <div>
                <span className={`block text-xs font-medium mb-1 ${cx.muted}`}>Type</span>
                <Segmented
                  label="Map type"
                  value={newMapType}
                  onChange={setNewMapType}
                  options={[{ value: 'mindmap', label: 'Mind map' }, { value: 'decision-tree', label: 'Decision tree' }]}
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setIsCreating(false); setNewMapTitle(''); }} className={cx.btnGhost}>Cancel</button>
                <button onClick={createMindMap} disabled={!newMapTitle.trim()} className={cx.btnPrimary}>Create</button>
              </div>
            </div>
          </Card>
        )}

        {aiModal}

        {mindMaps.length === 0 && !isCreating ? (
          <Empty
            icon={<Network size={30} className={cx.muted} />}
            title="No mind maps yet"
            subtitle="Map out an idea or a decision — create your first one."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mindMaps.map((map) => (
              <div
                key={map.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${map.title}`}
                className={`group rounded-xl border ${cx.border} ${cx.card} p-4 cursor-pointer transition-colors hover:border-gray-300 dark:hover:border-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
                onClick={() => setSelectedMap(map)}
                onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) setSelectedMap(map); }}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeIcon type={map.type} />
                    <h3 className={`text-sm font-semibold truncate ${cx.text}`}>{map.title}</h3>
                  </div>
                  <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity -mt-1 -mr-1">
                    <IconBtn label="Delete mind map" danger onClick={(e) => { e.stopPropagation(); deleteMindMap(map.id); }}>
                      <Trash2 size={16} />
                    </IconBtn>
                  </div>
                </div>
                <p className={`text-sm ${cx.muted}`}>
                  {map.nodes.length} nodes · {map.edges.length} connections
                </p>
                <p className={`text-xs mt-2 ${cx.faint}`}>
                  Updated {new Date(map.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  const selected = selectedNode ? selectedMap.nodes.find(n => n.id === selectedNode) : null;
  const toolBtn = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${active ? 'bg-white dark:bg-[#1A1F2B] text-gray-900 dark:text-gray-100 shadow-sm' : `${cx.muted} hover:text-gray-800 dark:hover:text-gray-200`}`;

  // Canvas view when map is selected
  return (
    <div className="h-full flex flex-col overflow-hidden bg-white dark:bg-[#05050A]">
      <header className="flex flex-wrap items-center gap-2 px-4 sm:px-8 pt-6 mb-4 shrink-0">
        <button onClick={() => setSelectedMap(null)} className={`p-1 -ml-1 rounded-md ${cx.hover} ${cx.muted}`} aria-label="Back to mind maps" title="Back to mind maps">
          <ChevronLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className={`text-2xl font-bold truncate ${cx.text}`}>{selectedMap.title}</h1>
          <p className={`text-sm mt-0.5 flex items-center gap-1.5 ${cx.muted}`}>
            <TypeIcon type={selectedMap.type} size={14} />
            {selectedMap.type === 'decision-tree' ? 'Decision tree' : 'Mind map'} · {selectedMap.nodes.length} nodes · {selectedMap.edges.length} connections
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tools */}
          <div role="radiogroup" aria-label="Canvas tool" className="inline-flex rounded-lg bg-gray-100 dark:bg-white/5 p-0.5 gap-0.5">
            <button
              role="radio"
              aria-checked={tool === 'select'}
              onClick={() => { setTool('select'); setConnectingFrom(null); }}
              className={toolBtn(tool === 'select')}
              title="Select & move"
              aria-label="Select & move"
            >
              <MousePointer size={16} />
            </button>
            <button
              role="radio"
              aria-checked={tool === 'connect'}
              onClick={() => setTool('connect')}
              className={toolBtn(tool === 'connect')}
              title="Connect nodes"
              aria-label="Connect nodes"
            >
              <Link2 size={16} />
            </button>
          </div>

          {/* Zoom */}
          <div className="hidden xs:flex items-center rounded-lg bg-gray-100 dark:bg-white/5 p-0.5">
            <IconBtn label="Zoom out" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}><ZoomOut size={16} /></IconBtn>
            <span className={`text-xs w-10 text-center tabular-nums ${cx.muted}`}>{Math.round(zoom * 100)}%</span>
            <IconBtn label="Zoom in" onClick={() => setZoom(z => Math.min(2, z + 0.25))}><ZoomIn size={16} /></IconBtn>
          </div>

          {selected && (
            <button onClick={() => createTaskFromNode(selected.id)} className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`} title="Create task from node" aria-label="Create task from node">
              <ListPlus size={18} />
              <span className="hidden md:inline">Create task</span>
            </button>
          )}

          {/* Add Node */}
          <button onClick={() => addNode(selectedNode || undefined)} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`} aria-label="Add node" title="Add node">
            <Plus size={18} />
            <span className="hidden sm:inline">Add node</span>
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 px-4 sm:px-8 pb-4 flex flex-col">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className={`flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing touch-none rounded-xl border ${cx.border} bg-gray-50 dark:bg-[#0A0D14]`}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {connectingFrom && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-gray-900 text-white dark:bg-[#1A1F2E] border border-gray-700 px-3 py-1.5 rounded-lg text-sm shadow-lg z-30" role="status">
              Click another node to connect
            </div>
          )}

          <svg
            className="absolute inset-0 w-full h-full pointer-events-none text-gray-200 dark:text-white/5"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
              transformOrigin: '0 0',
            }}
          >
            {/* Grid pattern */}
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="4000" height="4000" x="-2000" y="-2000" fill="url(#grid)" />

            {/* Edges */}
            {selectedMap.edges.map((edge) => {
              const fromNode = selectedMap.nodes.find(n => n.id === edge.from);
              const toNode = selectedMap.nodes.find(n => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const midX = (fromNode.x + toNode.x) / 2;
              const midY = (fromNode.y + toNode.y) / 2;

              return (
                <g key={edge.id}>
                  <line
                    x1={fromNode.x}
                    y1={fromNode.y}
                    x2={toNode.x}
                    y2={toNode.y}
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    className="pointer-events-auto cursor-pointer hover:stroke-red-400"
                    onClick={() => {
                      if (selectedMap.type === 'decision-tree') {
                        setEditingEdge(edge.id);
                        setEdgeLabelText(edge.label || '');
                      } else if (confirm('Delete this connection?')) {
                        deleteEdge(edge.id);
                      }
                    }}
                  />
                  {/* Arrow */}
                  <polygon
                    points="-6,-4 0,0 -6,4"
                    fill="#9CA3AF"
                    transform={`translate(${toNode.x}, ${toNode.y}) rotate(${Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x) * 180 / Math.PI}) translate(-20, 0)`}
                  />
                  {/* Edge label */}
                  {edge.label && (
                    <text
                      x={midX}
                      y={midY - 10}
                      textAnchor="middle"
                      className="fill-gray-500 dark:fill-gray-400 text-xs pointer-events-auto cursor-pointer"
                      onClick={() => {
                        setEditingEdge(edge.id);
                        setEdgeLabelText(edge.label || '');
                      }}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Nodes */}
          <div
            className="absolute inset-0"
            style={{
              transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
              transformOrigin: '0 0',
            }}
          >
            {selectedMap.nodes.map((node) => (
              <div
                key={node.id}
                className={`absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 ${
                  selectedNode === node.id ? 'z-20' : 'z-10'
                } ${connectingFrom === node.id ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}
                style={{ left: node.x, top: node.y }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
                onDoubleClick={() => {
                  setEditingNode(node.id);
                  setEditingNodeText(node.text);
                }}
              >
                <div
                  className={`px-4 py-2 rounded-xl shadow-md cursor-pointer select-none transition-transform ring-offset-2 ring-offset-gray-50 dark:ring-offset-[#0A0D14] ${
                    selectedNode === node.id ? 'scale-110 ring-2 ring-blue-500/60' : ''
                  } ${node.isRoot && selectedNode !== node.id ? 'ring-2 ring-amber-400' : ''}`}
                  style={{ backgroundColor: node.color }}
                >
                  {editingNode === node.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingNodeText}
                        onChange={(e) => setEditingNodeText(e.target.value)}
                        aria-label="Node text"
                        className="bg-transparent border-none outline-none text-white text-center text-sm font-medium min-w-[60px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateNodeText();
                          if (e.key === 'Escape') {
                            setEditingNode(null);
                            setEditingNodeText('');
                          }
                        }}
                        onBlur={updateNodeText}
                      />
                    </div>
                  ) : (
                    <span className="text-white text-sm font-medium whitespace-nowrap">{node.text}</span>
                  )}
                </div>

                {/* Node Actions */}
                {selectedNode === node.id && !editingNode && (
                  <div className={`flex items-center gap-0.5 mt-2 rounded-lg p-0.5 border shadow-lg ${cx.card} ${cx.border}`}>
                    <IconBtn label="Add child node" onClick={() => addNode(node.id)}><Plus size={16} /></IconBtn>
                    <IconBtn label="Edit text" onClick={() => { setEditingNode(node.id); setEditingNodeText(node.text); }}><Pencil size={16} /></IconBtn>
                    <IconBtn label="Create task from node" onClick={() => createTaskFromNode(node.id)}><ListPlus size={16} /></IconBtn>
                    {!node.isRoot && (
                      <IconBtn label="Delete node" danger onClick={() => deleteNode(node.id)}><Trash2 size={16} /></IconBtn>
                    )}
                    {/* Color picker */}
                    <div className={`flex gap-1 ml-1 pl-1.5 pr-1 border-l ${cx.border}`}>
                      {NODE_COLORS.slice(0, 4).map((color) => (
                        <button
                          key={color}
                          onClick={() => changeNodeColor(node.id, color)}
                          className={`w-4 h-4 rounded-full hover:scale-125 transition-transform ${node.color === color ? 'ring-2 ring-offset-1 ring-gray-400 dark:ring-offset-[#0F1219]' : ''}`}
                          style={{ backgroundColor: color }}
                          aria-label={`Set node colour ${color}`}
                          title={`Set node colour ${color}`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Help text */}
        <p className={`pt-2 text-xs text-center ${cx.faint}`}>
          <span className="hidden sm:inline">Double-click to edit · Drag to move · Alt+Drag to pan · Use Connect tool to link nodes</span>
          <span className="sm:hidden">Double-tap to edit · Drag to move</span>
        </p>
      </div>

      {/* Edge Label Editor */}
      <Modal open={!!editingEdge} onClose={closeEdgeEditor} title="Edit connection label">
        <ModalBody>
          <Field label="Label">
            <input
              type="text"
              value={edgeLabelText}
              onChange={(e) => setEdgeLabelText(e.target.value)}
              placeholder="e.g., Yes, No, Maybe..."
              className={inputCls}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') updateEdgeLabel();
              }}
            />
          </Field>
        </ModalBody>
        <ModalFooter>
          <button
            onClick={() => {
              if (editingEdge && confirm('Delete this connection?')) {
                deleteEdge(editingEdge);
                closeEdgeEditor();
              }
            }}
            className="mr-auto px-3 py-1.5 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
          >
            Delete
          </button>
          <button onClick={closeEdgeEditor} className={cx.btnGhost}>Cancel</button>
          <button onClick={updateEdgeLabel} className={cx.btnPrimary}>Save</button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

function TypeIcon({ type, size = 16 }: { type: MindMap['type']; size?: number }) {
  return type === 'decision-tree'
    ? <GitBranch size={size} className="text-green-600 dark:text-green-400 shrink-0" aria-hidden />
    : <Network size={size} className="text-blue-600 dark:text-blue-400 shrink-0" aria-hidden />;
}

export default MindMapView;
