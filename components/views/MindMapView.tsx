import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Trash2, Edit3, Save, X, GitBranch, Network, MousePointer, Link2, ZoomIn, ZoomOut, Move } from 'lucide-react';
import { MindMap, MindMapNode, MindMapEdge } from '../../types';
import { dbService, STORES } from '../../services/db';

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
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const draggedNode = useRef<string | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    loadMindMaps();
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
            <h1 className="text-2xl font-bold text-white">Mind Maps</h1>
            <p className="text-gray-400">Create mind maps and decision trees</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={18} />
            <span>New Map</span>
          </button>
        </div>

        {isCreating && (
          <div className="bg-midnight-light p-4 rounded-xl mb-6 border border-gray-700">
            <div className="flex flex-col gap-4">
              <input
                type="text"
                placeholder="Mind map title..."
                value={newMapTitle}
                onChange={(e) => setNewMapTitle(e.target.value)}
                className="bg-midnight border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500"
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
                  <span className="text-gray-300">Mind Map</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={newMapType === 'decision-tree'}
                    onChange={() => setNewMapType('decision-tree')}
                    className="text-blue-500"
                  />
                  <GitBranch size={18} className="text-green-400" />
                  <span className="text-gray-300">Decision Tree</span>
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
                className="bg-midnight-light p-4 rounded-xl border border-gray-700 hover:border-gray-600 cursor-pointer transition-colors group"
                onClick={() => setSelectedMap(map)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {map.type === 'decision-tree' ? (
                      <GitBranch size={20} className="text-green-400" />
                    ) : (
                      <Network size={20} className="text-blue-400" />
                    )}
                    <h3 className="font-semibold text-white">{map.title}</h3>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteMindMap(map.id); }}
                    className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <p className="text-sm text-gray-400">
                  {map.nodes.length} nodes • {map.edges.length} connections
                </p>
                <p className="text-xs text-gray-500 mt-2">
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
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 bg-midnight-light border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedMap(null)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
          <div className="flex items-center gap-2">
            {selectedMap.type === 'decision-tree' ? (
              <GitBranch size={20} className="text-green-400" />
            ) : (
              <Network size={20} className="text-blue-400" />
            )}
            <h2 className="font-semibold text-white">{selectedMap.title}</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Tools */}
          <div className="flex bg-midnight rounded-lg p-1 gap-1">
            <button
              onClick={() => { setTool('select'); setConnectingFrom(null); }}
              className={`p-2 rounded-lg transition-colors ${tool === 'select' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Select & Move"
            >
              <MousePointer size={18} />
            </button>
            <button
              onClick={() => setTool('connect')}
              className={`p-2 rounded-lg transition-colors ${tool === 'connect' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              title="Connect Nodes"
            >
              <Link2 size={18} />
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-midnight rounded-lg p-1">
            <button
              onClick={() => setZoom(z => Math.max(0.25, z - 0.25))}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ZoomOut size={18} />
            </button>
            <span className="text-gray-400 text-sm w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.25))}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          {/* Add Node */}
          <button
            onClick={() => addNode(selectedNode || undefined)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors text-sm"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">Add Node</span>
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
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

        {/* Edge Label Editor Modal */}
        {editingEdge && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
            <div className="bg-midnight-light p-4 rounded-xl border border-gray-700">
              <h3 className="text-white font-semibold mb-3">Edit Connection Label</h3>
              <input
                type="text"
                value={edgeLabelText}
                onChange={(e) => setEdgeLabelText(e.target.value)}
                placeholder="e.g., Yes, No, Maybe..."
                className="bg-midnight border border-gray-600 rounded-lg px-3 py-2 text-white w-full mb-3 focus:outline-none focus:border-blue-500"
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

      {/* Help text */}
      <div className="p-2 bg-midnight-light border-t border-gray-700 text-xs text-gray-500 text-center">
        Double-click to edit • Drag to move • Alt+Drag to pan • Use Connect tool to link nodes
      </div>
    </div>
  );
};

export default MindMapView;
