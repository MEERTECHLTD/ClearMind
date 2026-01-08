import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LearningResource, LearningFolder, LearningContentType, LearningContentStatus, LearningSourcePlatform, LearningResourceNote } from '../../types';
import { dbService, STORES } from '../../services/db';
import { 
  Plus, ExternalLink, Edit2, Trash2, X, Save, Play, Pause, 
  Video, Headphones, Clock, Calendar, Tag, FolderPlus, Folder, 
  Search, Filter, Check, RotateCcw, AlertTriangle, Link, 
  ChevronDown, ChevronRight, BarChart2, StickyNote, Bookmark,
  Youtube, Globe, GraduationCap, Sparkles, Eye, EyeOff
} from 'lucide-react';

const PREFS_KEY = 'learning-vault-preferences';

// Helper to format duration
const formatDuration = (seconds?: number): string => {
  if (!seconds) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
};

// Helper to format date
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Helper to extract domain from URL
const extractDomain = (url: string): string => {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return 'unknown';
  }
};

// Platform detection from URL
const detectPlatform = (url: string): LearningSourcePlatform => {
  const urlLower = url.toLowerCase();
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) return 'youtube';
  if (urlLower.includes('vimeo.com')) return 'vimeo';
  if (urlLower.includes('spotify.com')) return 'spotify';
  if (urlLower.includes('podcasts.apple.com')) return 'apple-podcasts';
  if (urlLower.includes('soundcloud.com')) return 'soundcloud';
  if (urlLower.includes('coursera.org')) return 'coursera';
  if (urlLower.includes('udemy.com')) return 'udemy';
  if (urlLower.includes('khanacademy.org')) return 'khan-academy';
  if (urlLower.includes('ocw.mit.edu')) return 'mit-ocw';
  if (urlLower.includes('ted.com')) return 'ted';
  return 'other';
};

// Content type detection from URL
const detectContentType = (url: string): LearningContentType => {
  const urlLower = url.toLowerCase();
  const audioKeywords = ['podcast', 'spotify', 'soundcloud', 'audio', '.mp3', '.m4a', '.wav'];
  if (audioKeywords.some(keyword => urlLower.includes(keyword))) return 'audio';
  return 'video';
};

// Platform icon component
const PlatformIcon: React.FC<{ platform: LearningSourcePlatform; className?: string }> = ({ platform, className = '' }) => {
  const iconClass = `${className}`;
  switch (platform) {
    case 'youtube': return <Youtube className={`${iconClass} text-red-500`} />;
    case 'coursera': 
    case 'udemy':
    case 'khan-academy':
    case 'mit-ocw': return <GraduationCap className={`${iconClass} text-blue-500`} />;
    case 'ted': return <Sparkles className={`${iconClass} text-red-500`} />;
    default: return <Globe className={`${iconClass} text-gray-400`} />;
  }
};

const LearningVaultView: React.FC = () => {
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [folders, setFolders] = useState<LearningFolder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [editingResource, setEditingResource] = useState<LearningResource | null>(null);
  const [selectedResource, setSelectedResource] = useState<LearningResource | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  
  // Filters
  const [filterContentType, setFilterContentType] = useState<'all' | LearningContentType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | LearningContentStatus>('all');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [filterPlatform, setFilterPlatform] = useState<'all' | LearningSourcePlatform>('all');
  
  // Sorting
  const [sortBy, setSortBy] = useState<'savedAt' | 'duration' | 'title' | 'lastAccessed'>(() => {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      try { return JSON.parse(saved).sortBy || 'savedAt'; } catch { return 'savedAt'; }
    }
    return 'savedAt';
  });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Form data
  const [formData, setFormData] = useState({
    url: '',
    title: '',
    description: '',
    thumbnail: '',
    contentType: 'video' as LearningContentType,
    duration: '',
    sourcePlatform: 'other' as LearningSourcePlatform,
    author: '',
    tags: '',
    folder: ''
  });
  
  const [folderFormData, setFolderFormData] = useState({
    name: '',
    color: '#3B82F6'
  });
  
  const [noteContent, setNoteContent] = useState('');
  const [noteTimestamp, setNoteTimestamp] = useState('');

  // Save preferences to localStorage
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy }));
  }, [sortBy]);

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        const resourceData = await dbService.getAll<LearningResource>(STORES.LEARNING_RESOURCES);
        const folderData = await dbService.getAll<LearningFolder>(STORES.LEARNING_FOLDERS);
        setResources(resourceData);
        setFolders(folderData);
      } catch (err) {
        console.error('Failed to load learning vault data', err);
      } finally {
        setTimeout(() => setIsLoading(false), 300);
      }
    };
    loadData();

    // Listen for sync events
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'learningresources' || e.detail?.store === 'learningfolders') {
        loadData();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  // Handle URL input - just update the URL without auto-detecting
  const handleUrlChange = useCallback((url: string) => {
    setFormData(prev => ({ ...prev, url }));
  }, []);

  // Detect metadata from URL when button is clicked
  const handlePreview = useCallback(async () => {
    if (!formData.url.trim()) return;
    
    setIsPreviewLoading(true);
    
    try {
      // Auto-detect platform and content type
      const platform = detectPlatform(formData.url);
      const contentType = detectContentType(formData.url);
      
      // Generate a more descriptive default title based on platform
      let defaultTitle = '';
      if (platform !== 'other') {
        const platformNames: Record<LearningSourcePlatform, string> = {
          'youtube': 'YouTube',
          'vimeo': 'Vimeo',
          'spotify': 'Spotify',
          'apple-podcasts': 'Apple Podcasts',
          'soundcloud': 'SoundCloud',
          'coursera': 'Coursera',
          'udemy': 'Udemy',
          'khan-academy': 'Khan Academy',
          'mit-ocw': 'MIT OpenCourseWare',
          'ted': 'TED',
          'other': 'Other'
        };
        defaultTitle = `${contentType === 'audio' ? 'Audio' : 'Video'} from ${platformNames[platform]}`;
      }
      
      setFormData(prev => ({
        ...prev,
        sourcePlatform: platform,
        contentType: contentType,
        title: prev.title || defaultTitle,
      }));
    } finally {
      setTimeout(() => setIsPreviewLoading(false), 300);
    }
  }, [formData.url]);

  const resetForm = () => {
    setFormData({
      url: '',
      title: '',
      description: '',
      thumbnail: '',
      contentType: 'video',
      duration: '',
      sourcePlatform: 'other',
      author: '',
      tags: '',
      folder: ''
    });
  };

  const openAddModal = () => {
    resetForm();
    setEditingResource(null);
    setShowAddModal(true);
  };

  const openEditModal = (resource: LearningResource) => {
    const durationMinutes = resource.duration ? Math.floor(resource.duration / 60) : '';
    setFormData({
      url: resource.url,
      title: resource.title,
      description: resource.description || '',
      thumbnail: resource.thumbnail || '',
      contentType: resource.contentType,
      duration: durationMinutes.toString(),
      sourcePlatform: resource.sourcePlatform,
      author: resource.author || '',
      tags: resource.tags.join(', '),
      folder: resource.folder || ''
    });
    setEditingResource(resource);
    setShowAddModal(true);
  };

  const handleSaveResource = async () => {
    if (!formData.url.trim() || !formData.title.trim()) return;

    const durationSeconds = formData.duration ? parseInt(formData.duration) * 60 : undefined;
    const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);

    if (editingResource) {
      const updated: LearningResource = {
        ...editingResource,
        url: formData.url,
        title: formData.title,
        description: formData.description,
        thumbnail: formData.thumbnail,
        contentType: formData.contentType,
        duration: durationSeconds,
        sourcePlatform: formData.sourcePlatform,
        author: formData.author,
        tags,
        folder: formData.folder || undefined,
        updatedAt: new Date().toISOString()
      };
      await dbService.put(STORES.LEARNING_RESOURCES, updated);
      setResources(resources.map(r => r.id === editingResource.id ? updated : r));
    } else {
      const newResource: LearningResource = {
        id: Date.now().toString(),
        url: formData.url,
        title: formData.title,
        description: formData.description,
        thumbnail: formData.thumbnail,
        contentType: formData.contentType,
        duration: durationSeconds,
        sourcePlatform: formData.sourcePlatform,
        author: formData.author,
        status: 'unwatched',
        progress: 0,
        tags,
        folder: formData.folder || undefined,
        notes: [],
        isSourceAvailable: true,
        savedAt: new Date().toISOString()
      };
      await dbService.put(STORES.LEARNING_RESOURCES, newResource);
      setResources([newResource, ...resources]);
    }

    setShowAddModal(false);
    setEditingResource(null);
    resetForm();
  };

  const handleSaveFolder = async () => {
    if (!folderFormData.name.trim()) return;

    const newFolder: LearningFolder = {
      id: Date.now().toString(),
      name: folderFormData.name,
      color: folderFormData.color,
      createdAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_FOLDERS, newFolder);
    setFolders([...folders, newFolder]);
    setShowFolderModal(false);
    setFolderFormData({ name: '', color: '#3B82F6' });
  };

  const handleDeleteResource = async (id: string) => {
    if (!confirm('Are you sure you want to delete this learning resource?')) return;
    await dbService.delete(STORES.LEARNING_RESOURCES, id);
    setResources(resources.filter(r => r.id !== id));
    if (selectedResource?.id === id) setSelectedResource(null);
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Are you sure you want to delete this folder? Resources in this folder will be unassigned.')) return;
    
    // Unassign resources from this folder
    const folderName = folders.find(f => f.id === id)?.name;
    if (folderName) {
      const updatedResources = resources.map(r => {
        if (r.folder === folderName) {
          return { ...r, folder: undefined };
        }
        return r;
      });
      setResources(updatedResources);
      for (const r of updatedResources.filter(r => !r.folder)) {
        await dbService.put(STORES.LEARNING_RESOURCES, r);
      }
    }
    
    await dbService.delete(STORES.LEARNING_FOLDERS, id);
    setFolders(folders.filter(f => f.id !== id));
  };

  const toggleStatus = async (resource: LearningResource) => {
    let newStatus: LearningContentStatus;
    if (resource.status === 'unwatched') {
      newStatus = 'in-progress';
    } else if (resource.status === 'in-progress') {
      newStatus = 'completed';
    } else {
      newStatus = 'unwatched';
    }

    const updated: LearningResource = {
      ...resource,
      status: newStatus,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_RESOURCES, updated);
    setResources(resources.map(r => r.id === resource.id ? updated : r));
  };

  const markAsWatched = async (resource: LearningResource) => {
    const updated: LearningResource = {
      ...resource,
      status: 'completed',
      completedAt: new Date().toISOString(),
      progress: resource.duration,
      updatedAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_RESOURCES, updated);
    setResources(resources.map(r => r.id === resource.id ? updated : r));
  };

  const openResource = async (resource: LearningResource) => {
    // Update last accessed timestamp
    const updated: LearningResource = {
      ...resource,
      lastAccessedAt: new Date().toISOString(),
      status: resource.status === 'unwatched' ? 'in-progress' : resource.status,
      updatedAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_RESOURCES, updated);
    setResources(resources.map(r => r.id === resource.id ? updated : r));
    
    // Open in new tab
    window.open(resource.url, '_blank');
  };

  const addNote = async () => {
    if (!selectedResource || !noteContent.trim()) return;

    const timestampSeconds = noteTimestamp 
      ? parseInt(noteTimestamp.split(':')[0]) * 60 + parseInt(noteTimestamp.split(':')[1] || '0')
      : undefined;

    const newNote: LearningResourceNote = {
      id: Date.now().toString(),
      content: noteContent,
      timestamp: timestampSeconds,
      createdAt: new Date().toISOString()
    };

    const updated: LearningResource = {
      ...selectedResource,
      notes: [...selectedResource.notes, newNote],
      updatedAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_RESOURCES, updated);
    setResources(resources.map(r => r.id === selectedResource.id ? updated : r));
    setSelectedResource(updated);
    setNoteContent('');
    setNoteTimestamp('');
  };

  const deleteNote = async (noteId: string) => {
    if (!selectedResource) return;

    const updated: LearningResource = {
      ...selectedResource,
      notes: selectedResource.notes.filter(n => n.id !== noteId),
      updatedAt: new Date().toISOString()
    };
    await dbService.put(STORES.LEARNING_RESOURCES, updated);
    setResources(resources.map(r => r.id === selectedResource.id ? updated : r));
    setSelectedResource(updated);
  };

  // Filtered and sorted resources
  const filteredResources = useMemo(() => {
    let result = [...resources];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.title.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query) ||
        r.tags.some(t => t.toLowerCase().includes(query)) ||
        r.author?.toLowerCase().includes(query)
      );
    }

    // Content type filter
    if (filterContentType !== 'all') {
      result = result.filter(r => r.contentType === filterContentType);
    }

    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(r => r.status === filterStatus);
    }

    // Folder filter
    if (filterFolder !== 'all') {
      result = result.filter(r => r.folder === filterFolder);
    }

    // Platform filter
    if (filterPlatform !== 'all') {
      result = result.filter(r => r.sourcePlatform === filterPlatform);
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'savedAt':
          comparison = new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
          break;
        case 'duration':
          comparison = (a.duration || 0) - (b.duration || 0);
          break;
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'lastAccessed':
          comparison = new Date(a.lastAccessedAt || '0').getTime() - new Date(b.lastAccessedAt || '0').getTime();
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [resources, searchQuery, filterContentType, filterStatus, filterFolder, filterPlatform, sortBy, sortOrder]);

  // Calculate stats
  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const completed = resources.filter(r => r.status === 'completed');
    const totalWatchTime = completed.reduce((sum, r) => sum + (r.duration || 0), 0);
    
    const weeklyCompleted = completed.filter(r => r.completedAt && new Date(r.completedAt) >= weekAgo);
    const weeklyWatchTime = weeklyCompleted.reduce((sum, r) => sum + (r.duration || 0), 0);

    return {
      totalItems: resources.length,
      completedItems: completed.length,
      totalWatchTime,
      weeklyWatchTime,
      averageSessionLength: completed.length > 0 ? totalWatchTime / completed.length : 0
    };
  }, [resources]);

  // Calculate folder watch times
  const folderStats = useMemo(() => {
    const result: Record<string, number> = {};
    for (const folder of folders) {
      const folderResources = resources.filter(r => r.folder === folder.name && r.status === 'completed');
      result[folder.name] = folderResources.reduce((sum, r) => sum + (r.duration || 0), 0);
    }
    return result;
  }, [resources, folders]);

  const getStatusIcon = (status: LearningContentStatus) => {
    switch (status) {
      case 'unwatched': return <EyeOff size={14} className="text-gray-400" />;
      case 'in-progress': return <Play size={14} className="text-yellow-500" />;
      case 'completed': return <Check size={14} className="text-green-500" />;
    }
  };

  const getStatusLabel = (status: LearningContentStatus, contentType: LearningContentType) => {
    const action = contentType === 'audio' ? 'Listened' : 'Watched';
    switch (status) {
      case 'unwatched': return contentType === 'audio' ? 'Unlistened' : 'Unwatched';
      case 'in-progress': return 'In Progress';
      case 'completed': return action;
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading Learning Vault...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 h-full flex flex-col animate-fade-in overflow-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Learning Vault</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Save and organize your learning resources. Never lose a valuable link again.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button 
            onClick={() => setShowStatsPanel(!showStatsPanel)}
            className="bg-midnight-light hover:bg-gray-700 border dark:border-gray-700 border-gray-200 text-gray-300 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <BarChart2 size={16} />
            <span className="hidden sm:inline">Stats</span>
          </button>
          <button 
            onClick={() => setShowFolderModal(true)}
            className="bg-midnight-light hover:bg-gray-700 border dark:border-gray-700 border-gray-200 text-gray-300 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <FolderPlus size={16} />
            <span className="hidden sm:inline">New Folder</span>
          </button>
          <button 
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Resource
          </button>
        </div>
      </div>

      {/* Stats Panel */}
      {showStatsPanel && (
        <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border dark:border-gray-700 border-gray-200 rounded-xl">
          <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
            <BarChart2 size={16} />
            Progress Analytics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-white">{stats.totalItems}</p>
              <p className="text-xs text-gray-400">Total Items</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{stats.completedItems}</p>
              <p className="text-xs text-gray-400">Completed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{formatDuration(stats.totalWatchTime)}</p>
              <p className="text-xs text-gray-400">Total Time</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{formatDuration(stats.weeklyWatchTime)}</p>
              <p className="text-xs text-gray-400">This Week</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{formatDuration(stats.averageSessionLength)}</p>
              <p className="text-xs text-gray-400">Avg Session</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, tags, description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        {/* Filter dropdowns */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterContentType}
            onChange={(e) => setFilterContentType(e.target.value as any)}
            className="px-3 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
          
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="unwatched">Unwatched</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          
          <select
            value={filterFolder}
            onChange={(e) => setFilterFolder(e.target.value)}
            className="px-3 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Folders</option>
            {folders.map(f => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="savedAt">Date Saved</option>
            <option value="duration">Duration</option>
            <option value="title">Title</option>
            <option value="lastAccessed">Last Accessed</option>
          </select>
          
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="px-3 py-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Folders Quick Access */}
      {folders.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {folders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setFilterFolder(filterFolder === folder.name ? 'all' : folder.name)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap
                ${filterFolder === folder.name 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' 
                  : 'bg-midnight-light border dark:border-gray-700 border-gray-200 text-gray-400 hover:text-white'}`}
            >
              <Folder size={14} style={{ color: folder.color }} />
              {folder.name}
              <span className="text-xs text-gray-500">
                ({resources.filter(r => r.folder === folder.name).length})
              </span>
              {folderStats[folder.name] > 0 && (
                <span className="text-xs text-green-400">
                  {formatDuration(folderStats[folder.name])}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Resources Grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredResources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <Bookmark size={48} className="mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No resources found</p>
            <p className="text-sm text-gray-500">
              {resources.length === 0 
                ? 'Start building your learning library by adding your first resource.'
                : 'Try adjusting your filters or search query.'}
            </p>
            {resources.length === 0 && (
              <button
                onClick={openAddModal}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
              >
                <Plus size={16} />
                Add Your First Resource
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredResources.map(resource => (
              <div
                key={resource.id}
                className="group bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-xl overflow-hidden hover:border-blue-500/50 transition-all duration-200"
              >
                {/* Thumbnail */}
                <div 
                  className="relative h-36 bg-gray-800 cursor-pointer"
                  onClick={() => openResource(resource)}
                >
                  {resource.thumbnail ? (
                    <img 
                      src={resource.thumbnail} 
                      alt={resource.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {resource.contentType === 'video' ? (
                        <Video size={48} className="text-gray-600" />
                      ) : (
                        <Headphones size={48} className="text-gray-600" />
                      )}
                    </div>
                  )}
                  
                  {/* Overlay */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="flex items-center gap-2 text-white">
                      <Play size={24} />
                      <span className="text-sm font-medium">
                        {resource.contentType === 'video' ? 'Watch' : 'Listen'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Duration badge */}
                  {resource.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded text-xs text-white">
                      {formatDuration(resource.duration)}
                    </div>
                  )}
                  
                  {/* Content type badge */}
                  <div className="absolute top-2 left-2">
                    {resource.contentType === 'video' ? (
                      <Video size={18} className="text-white drop-shadow-lg" />
                    ) : (
                      <Headphones size={18} className="text-white drop-shadow-lg" />
                    )}
                  </div>
                  
                  {/* Platform badge */}
                  <div className="absolute top-2 right-2">
                    <PlatformIcon platform={resource.sourcePlatform} className="w-5 h-5 drop-shadow-lg" />
                  </div>
                  
                  {/* Unavailable warning */}
                  {!resource.isSourceAvailable && (
                    <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center">
                      <div className="bg-red-600 px-3 py-1 rounded-full flex items-center gap-2 text-sm text-white">
                        <AlertTriangle size={14} />
                        Source Unavailable
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Content */}
                <div className="p-4">
                  <h3 
                    className="font-medium text-white truncate mb-1 cursor-pointer hover:text-blue-400 transition-colors"
                    onClick={() => openResource(resource)}
                    title={resource.title}
                  >
                    {resource.title}
                  </h3>
                  
                  {resource.author && (
                    <p className="text-xs text-gray-400 truncate mb-2">{resource.author}</p>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
                    <span className="flex items-center gap-1">
                      {getStatusIcon(resource.status)}
                      {getStatusLabel(resource.status, resource.contentType)}
                    </span>
                    <span>•</span>
                    <span>{formatDate(resource.savedAt)}</span>
                  </div>
                  
                  {/* Tags */}
                  {resource.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {resource.tags.slice(0, 3).map(tag => (
                        <span 
                          key={tag}
                          className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
                        >
                          #{tag}
                        </span>
                      ))}
                      {resource.tags.length > 3 && (
                        <span className="text-[10px] text-gray-500">+{resource.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                  
                  {/* Folder badge */}
                  {resource.folder && (
                    <div className="flex items-center gap-1 text-xs text-gray-400 mb-3">
                      <Folder size={12} />
                      {resource.folder}
                    </div>
                  )}
                  
                  {/* Notes indicator */}
                  {resource.notes.length > 0 && (
                    <div className="flex items-center gap-1 text-xs text-purple-400 mb-3">
                      <StickyNote size={12} />
                      {resource.notes.length} note{resource.notes.length > 1 ? 's' : ''}
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t dark:border-gray-700 border-gray-200">
                    <button
                      onClick={() => toggleStatus(resource)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
                      title={resource.status === 'completed' ? 'Mark as unwatched' : 'Toggle status'}
                    >
                      {resource.status === 'completed' ? (
                        <>
                          <RotateCcw size={12} />
                          Reset
                        </>
                      ) : resource.status === 'in-progress' ? (
                        <>
                          <Check size={12} />
                          Complete
                        </>
                      ) : (
                        <>
                          <Play size={12} />
                          Start
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => { setSelectedResource(resource); setShowNotesModal(true); }}
                      className="p-1.5 text-gray-400 hover:text-purple-400 transition-colors"
                      title="Notes"
                    >
                      <StickyNote size={14} />
                    </button>
                    <button
                      onClick={() => openEditModal(resource)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteResource(resource.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Resource Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-700 border-gray-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold dark:text-white text-gray-900">
                  {editingResource ? 'Edit Resource' : 'Add Learning Resource'}
                </h3>
                <button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                {/* URL Input */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">URL *</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={formData.url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="flex-1 px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handlePreview}
                      disabled={!formData.url || isPreviewLoading}
                      className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white rounded-lg text-sm transition-colors"
                    >
                      {isPreviewLoading ? '...' : 'Detect'}
                    </button>
                  </div>
                </div>
                
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Resource title"
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of the content"
                    rows={2}
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>
                
                {/* Thumbnail */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Thumbnail URL</label>
                  <input
                    type="url"
                    value={formData.thumbnail}
                    onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                {/* Two columns */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Content Type</label>
                    <select
                      value={formData.contentType}
                      onChange={(e) => setFormData({ ...formData, contentType: e.target.value as LearningContentType })}
                      className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="video">Video</option>
                      <option value="audio">Audio</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Duration (minutes)</label>
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      placeholder="60"
                      min="0"
                      className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Platform</label>
                    <select
                      value={formData.sourcePlatform}
                      onChange={(e) => setFormData({ ...formData, sourcePlatform: e.target.value as LearningSourcePlatform })}
                      className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="youtube">YouTube</option>
                      <option value="vimeo">Vimeo</option>
                      <option value="coursera">Coursera</option>
                      <option value="udemy">Udemy</option>
                      <option value="khan-academy">Khan Academy</option>
                      <option value="mit-ocw">MIT OpenCourseWare</option>
                      <option value="ted">TED</option>
                      <option value="spotify">Spotify</option>
                      <option value="apple-podcasts">Apple Podcasts</option>
                      <option value="soundcloud">SoundCloud</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Folder</label>
                    <select
                      value={formData.folder}
                      onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                      className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">No Folder</option>
                      {folders.map(f => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                
                {/* Author */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Author / Channel</label>
                  <input
                    type="text"
                    value={formData.author}
                    onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                    placeholder="Channel name or author"
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                {/* Tags */}
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                    placeholder="Machine Learning, Python, Tutorial"
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveResource}
                  disabled={!formData.url.trim() || !formData.title.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <Save size={16} />
                  {editingResource ? 'Update' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Folder Modal */}
      {showFolderModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-700 border-gray-200 rounded-xl w-full max-w-md shadow-xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold dark:text-white text-gray-900">Create Folder</h3>
                <button onClick={() => setShowFolderModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Folder Name</label>
                  <input
                    type="text"
                    value={folderFormData.name}
                    onChange={(e) => setFolderFormData({ ...folderFormData, name: e.target.value })}
                    placeholder="e.g., Machine Learning, Backend"
                    className="w-full px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium dark:text-gray-300 text-gray-700 mb-1">Color</label>
                  <div className="flex gap-2">
                    {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map(color => (
                      <button
                        key={color}
                        onClick={() => setFolderFormData({ ...folderFormData, color })}
                        className={`w-8 h-8 rounded-full transition-transform ${folderFormData.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-midnight-light scale-110' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Existing folders */}
              {folders.length > 0 && (
                <div className="mt-6 pt-4 border-t dark:border-gray-700 border-gray-200">
                  <p className="text-sm dark:text-gray-400 text-gray-600 mb-2">Existing Folders</p>
                  <div className="space-y-2">
                    {folders.map(folder => (
                      <div key={folder.id} className="flex items-center justify-between p-2 dark:bg-midnight bg-gray-100 rounded-lg">
                        <div className="flex items-center gap-2">
                          <Folder size={16} style={{ color: folder.color }} />
                          <span className="text-sm dark:text-white text-gray-900">{folder.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteFolder(folder.id)}
                          className="text-gray-400 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveFolder}
                  disabled={!folderFormData.name.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <FolderPlus size={16} />
                  Create Folder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes Modal */}
      {showNotesModal && selectedResource && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-700 border-gray-200 rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col shadow-xl">
            <div className="p-6 border-b dark:border-gray-700 border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold dark:text-white text-gray-900">Notes</h3>
                  <p className="text-sm dark:text-gray-400 text-gray-600 truncate">{selectedResource.title}</p>
                </div>
                <button onClick={() => { setShowNotesModal(false); setSelectedResource(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                  <X size={20} />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              {/* Add note form */}
              <div className="mb-6">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={noteTimestamp}
                    onChange={(e) => setNoteTimestamp(e.target.value)}
                    placeholder="0:00 (optional)"
                    className="w-24 px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 px-3 py-2 dark:bg-midnight bg-gray-100 border dark:border-gray-700 border-gray-200 rounded-lg dark:text-white text-gray-900 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && addNote()}
                  />
                  <button
                    onClick={addNote}
                    disabled={!noteContent.trim()}
                    className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded-lg transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <p className="text-xs text-gray-500">Tip: Add a timestamp (e.g., 5:30) to link your note to a specific moment</p>
              </div>
              
              {/* Notes list */}
              {selectedResource.notes.length === 0 ? (
                <div className="text-center py-8 dark:text-gray-400 text-gray-500">
                  <StickyNote size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No notes yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedResource.notes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map(note => (
                    <div key={note.id} className="p-3 dark:bg-midnight bg-gray-100 rounded-lg group">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {note.timestamp !== undefined && (
                            <span className="inline-block bg-purple-500/20 text-purple-400 text-xs px-2 py-0.5 rounded mr-2">
                              {formatDuration(note.timestamp)}
                            </span>
                          )}
                          <p className="text-sm dark:text-gray-300 text-gray-700 mt-1">{note.content}</p>
                          <p className="text-xs text-gray-500 mt-1">{formatDate(note.createdAt)}</p>
                        </div>
                        <button
                          onClick={() => deleteNote(note.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningVaultView;
