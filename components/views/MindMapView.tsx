import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Edit3, Save, X, GitBranch, Network, MousePointer, Link2, ZoomIn, ZoomOut, Move, Sparkles, Loader2 } from 'lucide-react';
import { MindMap, MindMapNode, MindMapEdge } from '../../types';
import { dbService, STORES } from '../../services/db';
import { generateResponse, isApiConfigured } from '../../services/geminiService';

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
        type: 'mind-map',
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
      alert('Failed to generate mind map. Please try again.');
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

  // List view when no map selected
  if (!selectedMap) {
    return (
      <div className="h-full overflow-auto p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold dark:text-white text-gray-900">Mind Maps</h1>
            <p className="dark:text-gray-400 text-gray-600">Create mind maps and decision trees</p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {isApiConfigured() && (
              <button
                onClick={() => setShowAiModal(true)}
                className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 px-3 sm:px-4 py-2 rounded-lg transition-colors flex-1 sm:flex-none"
              >
                <Sparkles size={18} />
                <span className="hidden xs:inline">AI Generate</span>
              </button>
            )}
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 sm:px-4 py-2 rounded-lg transition-colors flex-1 sm:flex-none"
            >
              <Plus size={18} />
              <span className="hidden xs:inline">New Map</span>
            </button>
          </div>
        </div>

        {isCreating && (
          <div className="bg-midnight-light p-4 rounded-xl mb-6 border dark:border-gray-700 border-gray-300">
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Mind map title..."
                value={newMapTitle}
                onChange={(e) => setNewMapTitle(e.target.value)}
                className="bg-midnight border dark:border-gray-600 border-gray-300 rounded-lg px-4 py-2 dark:text-white text-gray-900 dark:placeholder-gray-400 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newMapType === 'mindmap'}
                    onChange={() => setNewMapType('mindmap')}
                    className="text-blue-500"
                  />
                  <Network size={18} className="text-blue-400" />
                  <span className="dark:text-gray-300 text-gray-700">Mind Map</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newMapType === 'decision-tree'}
                    onChange={() => setNewMapType('decision-tree')}
                    className="text-blue-500"
                  />
                  <GitBranch size={18} className="text-green-400" />
                  <span className="dark:text-gray-300 text-gray-700">Decision Tree</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createMindMap}
                  className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => { setIsCreating(false); setNewMapTitle(''); }}
                  className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI Generation Modal - Mobile Responsive */}
        {showAiModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
            <div className="bg-midnight-light p-4 sm:p-6 rounded-xl border dark:border-gray-700 border-gray-300 w-full max-w-md mx-2">
              <div className="flex items-center gap-2 mb-3 sm:mb-4">
                <Sparkles size={20} className="text-purple-400 sm:hidden" />
                <Sparkles size={24} className="text-purple-400 hidden sm:block" />
                <h2 className="text-lg sm:text-xl font-bold dark:text-white text-gray-900">AI Mind Map Generator</h2>
              </div>
              <p className="dark:text-gray-400 text-gray-600 mb-3 sm:mb-4 text-xs sm:text-sm">
                Enter a topic and AI will generate a mind map for you.
              </p>
              <input
                type="text"
                placeholder="e.g., Learn React, Plan vacation..."
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                className="w-full bg-midnight border dark:border-gray-600 border-gray-300 rounded-lg px-3 sm:px-4 py-2 sm:py-3 dark:text-white text-gray-900 dark:placeholder-gray-400 placeholder-gray-500 text-sm sm:text-base focus:outline-none focus:border-purple-500 mb-3 sm:mb-4"
                autoFocus
                disabled={isGenerating}
                onKeyDown={(e) => e.key === 'Enter' && !isGenerating && generateWithAI()}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowAiModal(false); setAiPrompt(''); }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  onClick={generateWithAI}
                  disabled={!aiPrompt.trim() || isGenerating}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {mindMaps.length === 0 && !isCreating ? (
          <div className="text-center py-16 text-gray-500">
            <Network size={48} className="mx-auto mb-4 opacity-50" />
            <p>No mind maps yet. Create your first one!</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mindMaps.map((map) => (
              <div
                key={map.id}
                className="bg-midnight-light p-4 rounded-xl border dark:border-gray-700 border-gray-300 dark:hover:border-gray-600 hover:border-gray-400 cursor-pointer transition-colors group"
                onClick={() => setSelectedMap(map)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {map.type === 'decision-tree' ? (
                      <GitBranch size={20} className="text-green-400" />
                    ) : (
                      <Network size={20} className="text-blue-400" />
                    )}
                    <h3 className="font-semibold dark:text-white text-gray-900">{map.title}</h3>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMindMap(map.id); }}
                    className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="text-sm dark:text-gray-400 text-gray-600">
                  {map.nodes.length} nodes • {map.edges.length} connections
                </p>
                <p className="text-xs dark:text-gray-500 text-gray-500 mt-2">
                  Updated {new Date(map.updatedAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Canvas view when map is selected
  return (
    <div className="h-full flex flex-col bg-midnight">
      {/* Toolbar - Mobile Responsive */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 sm:p-3 bg-midnight-light border-b border-gray-700">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => setSelectedMap(null)}
            className="dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 transition-colors p-1"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            {selectedMap.type === 'decision-tree' ? (
              <GitBranch size={18} className="text-green-400 flex-shrink-0" />
            ) : (
              <Network size={18} className="text-blue-400 flex-shrink-0" />
            )}
            <h2 className="font-semibold dark:text-white text-gray-900 text-sm sm:text-base truncate max-w-[120px] sm:max-w-none">{selectedMap.title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
          {/* Tools */}
          <div className="flex bg-midnight rounded-lg p-0.5 sm:p-1 gap-0.5 sm:gap-1">
            <button
              onClick={() => { setTool('select'); setConnectingFrom(null); }}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-blue-600 text-white' : 'dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900'}`}
              title="Select & Move"
            >
              <MousePointer size={16} />
            </button>
            <button
              onClick={() => setTool('connect')}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${tool === 'connect' ? 'bg-blue-600 text-white' : 'dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900'}`}
              title="Connect Nodes"
            >
              <Link2 size={16} />
            </button>
          </div>

          {/* Zoom - Hidden on very small screens */}
          <div className="hidden xs:flex items-center gap-0.5 sm:gap-1 bg-midnight rounded-lg p-0.5 sm:p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
              className="p-1.5 sm:p-2 dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <span className="dark:text-gray-400 text-gray-600 text-xs sm:text-sm w-8 sm:w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.25))}
              className="p-1.5 sm:p-2 dark:text-gray-400 text-gray-600 dark:hover:text-white hover:text-gray-900 transition-colors"
            >
              <ZoomIn size={16} />
            </button>
          </div>

          {/* Add Node */}
          <button
            onClick={() => addNode(selectedNode || undefined)}
            className="flex items-center gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg transition-colors text-xs sm:text-sm"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Add Node</span>
            <span className="sm:hidden">Add</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleCanvasTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {connectingFrom && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-blue-600 px-3 py-1 rounded-full text-sm z-10">
            Click another node to connect
          </div>
        )}

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
            transformOrigin: '0 0',
          }}
        >
          {/* Grid pattern */}
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a2e" strokeWidth="1"/>
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
                  stroke="#4B5563"
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
                  fill="#4B5563"
                  transform={`translate(${toNode.x}, ${toNode.y}) rotate(${Math.atan2(toNode.y - fromNode.y, toNode.x - fromNode.x) * 180 / Math.PI}) translate(-20, 0)`}
                />
                {/* Edge label */}
                {edge.label && (
                  <text
                    x={midX}
                    y={midY - 10}
                    textAnchor="middle"
                    className="fill-gray-400 text-xs pointer-events-auto cursor-pointer"
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
              } ${connectingFrom === node.id ? 'ring-2 ring-blue-500' : ''}`}
              style={{ left: node.x, top: node.y }}
              onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
              onTouchStart={(e) => handleNodeTouchStart(e, node.id)}
              onDoubleClick={() => {
                setEditingNode(node.id);
                setEditingNodeText(node.text);
              }}
            >
              <div
                className={`px-4 py-2 rounded-xl shadow-lg cursor-pointer select-none transition-transform ${
                  selectedNode === node.id ? 'scale-110 ring-2 ring-white/50' : ''
                } ${node.isRoot ? 'ring-2 ring-yellow-400' : ''}`}
                style={{ backgroundColor: node.color }}
              >
                {editingNode === node.id ? (
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="text"
                      value={editingNodeText}
                      onChange={(e) => setEditingNodeText(e.target.value)}
                      className="bg-transparent border-none outline-none text-white text-center min-w-[60px]"
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
                  <span className="text-white font-medium whitespace-nowrap">{node.text}</span>
                )}
              </div>

              {/* Node Actions */}
              {selectedNode === node.id && !editingNode && (
                <div className="flex gap-1 mt-2 bg-midnight-light rounded-lg p-1">
                  <button
                    onClick={() => addNode(node.id)}
                    className="p-1 text-gray-400 hover:text-green-400 transition-colors"
                    title="Add child node"
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    onClick={() => {
                      setEditingNode(node.id);
                      setEditingNodeText(node.text);
                    }}
                    className="p-1 text-gray-400 hover:text-blue-400 transition-colors"
                    title="Edit text"
                  >
                    <Edit3 size={14} />
                  </button>
                  {!node.isRoot && (
                    <button
                      onClick={() => deleteNode(node.id)}
                      className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete node"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {/* Color picker */}
                  <div className="flex gap-0.5 ml-1 pl-1 border-l border-gray-600">
                    {NODE_COLORS.slice(0, 4).map((color) => (
                      <button
                        key={color}
                        onClick={() => changeNodeColor(node.id, color)}
                        className="w-4 h-4 rounded-full hover:scale-125 transition-transform"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Edge Label Editor Modal - Mobile Responsive */}
        {editingEdge && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30 p-3">
            <div className="bg-midnight-light p-3 sm:p-4 rounded-xl border dark:border-gray-700 border-gray-300 w-full max-w-xs sm:max-w-sm mx-2">
              <h3 className="dark:text-white text-gray-900 font-semibold mb-2 sm:mb-3 text-sm sm:text-base">Edit Connection Label</h3>
              <input
                type="text"
                value={edgeLabelText}
                onChange={(e) => setEdgeLabelText(e.target.value)}
                placeholder="e.g., Yes, No, Maybe..."
                className="bg-midnight border dark:border-gray-600 border-gray-300 rounded-lg px-3 py-2 dark:text-white text-gray-900 dark:placeholder-gray-400 placeholder-gray-500 text-sm sm:text-base w-full mb-2 sm:mb-3 focus:outline-none focus:border-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') updateEdgeLabel();
                  if (e.key === 'Escape') {
                    setEditingEdge(null);
                    setEdgeLabelText('');
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setEditingEdge(null);
                    setEdgeLabelText('');
                  }}
                  className="px-3 py-1 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this connection?')) {
                      deleteEdge(editingEdge);
                      setEditingEdge(null);
                      setEdgeLabelText('');
                    }
                  }}
                  className="px-3 py-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={updateEdgeLabel}
                  className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg transition-colors"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Help text - Mobile Responsive */}
      <div className="p-2 bg-midnight-light border-t border-gray-700 text-xs text-gray-500 text-center">
        <span className="hidden sm:inline">Double-click to edit • Drag to move • Alt+Drag to pan • Use Connect tool to link nodes</span>
        <span className="sm:hidden">Double-tap to edit • Drag to move</span>
      </div>
    </div>
  );
};

export default MindMapView;
