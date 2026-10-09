import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { LearningResource, LearningFolder, LearningContentType, LearningContentStatus, LearningSourcePlatform, LearningResourceNote } from '../../types';
import { dbService, STORES } from '../../services/db';
import {
  Plus, ExternalLink, Edit2, Trash2, Save, Play,
  Video, Headphones, Clock, Tag, FolderPlus, Folder,
  Search, Check, RotateCcw, AlertTriangle,
  BarChart2, StickyNote, Bookmark, ArrowUp, ArrowDown, ListPlus, Loader2, MoreHorizontal,
  Youtube, Globe, GraduationCap, Sparkles, EyeOff
} from 'lucide-react';
import {
  FullPage, Card, IconBtn, Field, inputCls, Modal, ModalBody, ModalFooter, Popover, MenuItem, Empty, PageLoading, useCreateLinkedTask, cx,
} from '../ui-kit';

/** Compact secondary action on resource cards. */
const smallBtn = 'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 transition-colors';

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

// Helper to format date and time
const formatDateTime = (dateStr: string): string => {
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timeFormatted = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateFormatted} at ${timeFormatted}`;
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

// Interface for fetched metadata
interface FetchedMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
  author?: string;
  duration?: number; // in seconds
  platform?: LearningSourcePlatform;
  contentType?: LearningContentType;
}

// Extract YouTube video ID from various URL formats
const extractYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Extract Vimeo video ID
const extractVimeoVideoId = (url: string): string | null => {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : null;
};

// Fetch metadata from URL using multiple strategies
const fetchMetadataFromUrl = async (url: string): Promise<FetchedMetadata> => {
  const platform = detectPlatform(url);
  const contentType = detectContentType(url);
  const metadata: FetchedMetadata = { platform, contentType };

  try {
    // Strategy 1: Try noembed.com (supports YouTube, Vimeo, SoundCloud, etc.)
    const noembedResponse = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (noembedResponse.ok) {
      const data = await noembedResponse.json();
      if (data && !data.error) {
        metadata.title = data.title;
        metadata.author = data.author_name;
        metadata.thumbnail = data.thumbnail_url;
        
        // noembed doesn't always return duration, so we'll try other methods
        if (data.duration) {
          metadata.duration = typeof data.duration === 'number' ? data.duration : parseInt(data.duration);
        }
      }
    }
  } catch (e) {
    console.log('noembed fetch failed, trying alternatives');
  }

  // Strategy 2: Platform-specific fallbacks for thumbnail and additional data
  try {
    if (platform === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        // Get high quality thumbnail
        if (!metadata.thumbnail) {
          metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        } else {
          // Upgrade to higher quality thumbnail
          metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        }
        
        // Try to get duration via youtube-nocookie embed page scraping
        // Note: This is a best-effort approach
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const oembedResponse = await fetch(oembedUrl);
          if (oembedResponse.ok) {
            const oembedData = await oembedResponse.json();
            if (oembedData.title && !metadata.title) metadata.title = oembedData.title;
            if (oembedData.author_name && !metadata.author) metadata.author = oembedData.author_name;
          }
        } catch (e) {
          console.log('YouTube oEmbed fallback failed');
        }
      }
    } else if (platform === 'vimeo') {
      const videoId = extractVimeoVideoId(url);
      if (videoId) {
        try {
          const vimeoOembed = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
          if (vimeoOembed.ok) {
            const vimeoData = await vimeoOembed.json();
            if (vimeoData.title && !metadata.title) metadata.title = vimeoData.title;
            if (vimeoData.author_name && !metadata.author) metadata.author = vimeoData.author_name;
            if (vimeoData.thumbnail_url) metadata.thumbnail = vimeoData.thumbnail_url;
            if (vimeoData.duration) metadata.duration = vimeoData.duration;
          }
        } catch (e) {
          console.log('Vimeo oEmbed fallback failed');
        }
      }
    } else if (platform === 'ted') {
      try {
        const tedOembed = await fetch(`https://www.ted.com/services/v1/oembed.json?url=${encodeURIComponent(url)}`);
        if (tedOembed.ok) {
          const tedData = await tedOembed.json();
          if (tedData.title && !metadata.title) metadata.title = tedData.title;
          if (tedData.author_name && !metadata.author) metadata.author = tedData.author_name;
          if (tedData.thumbnail_url) metadata.thumbnail = tedData.thumbnail_url;
        }
      } catch (e) {
        console.log('TED oEmbed fallback failed');
      }
    }
  } catch (e) {
    console.log('Platform-specific fetch failed:', e);
  }

  // Strategy 3: If still no thumbnail for YouTube, try fallback thumbnails
  if (platform === 'youtube' && !metadata.thumbnail) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      // Try different thumbnail qualities
      const thumbnailUrls = [
        `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
      ];
      metadata.thumbnail = thumbnailUrls[0]; // Use maxres by default
    }
  }

  return metadata;
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
    default: return <Globe className={`${iconClass} text-gray-500 dark:text-gray-400`} />;
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
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debounced search - only update searchQuery after user stops typing
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(searchInput);
    }, 300);
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchInput]);
  
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

    // Listen for sync events - but don't reload if we just deleted something
    let recentlyDeleted: string[] = [];
    const handleSync = async (e: CustomEvent) => {
      if (e.detail?.store === 'learningresources' || e.detail?.store === 'learningfolders') {
        // Reload but filter out any items that might have been restored from cloud
        try {
          const resourceData = await dbService.getAll<LearningResource>(STORES.LEARNING_RESOURCES);
          const folderData = await dbService.getAll<LearningFolder>(STORES.LEARNING_FOLDERS);
          // Filter to only non-deleted items (getAll already does this, but double-check)
          setResources(resourceData.filter(r => !(r as any).deleted));
          setFolders(folderData.filter(f => !(f as any).deleted));
        } catch (err) {
          console.error('Failed to reload after sync', err);
        }
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
      // Fetch real metadata from the URL
      const metadata = await fetchMetadataFromUrl(formData.url);
      
      // Fallback platform names for title generation
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
      
      // Generate fallback title if metadata didn't return one
      const platform = metadata.platform || detectPlatform(formData.url);
      const contentType = metadata.contentType || detectContentType(formData.url);
      const fallbackTitle = platform !== 'other' 
        ? `${contentType === 'audio' ? 'Audio' : 'Video'} from ${platformNames[platform]}`
        : '';
      
      // Convert duration from seconds to minutes for the form
      const durationMinutes = metadata.duration 
        ? Math.ceil(metadata.duration / 60).toString()
        : '';
      
      setFormData(prev => ({
        ...prev,
        sourcePlatform: metadata.platform || prev.sourcePlatform,
        contentType: metadata.contentType || prev.contentType,
        title: metadata.title || prev.title || fallbackTitle,
        description: metadata.description || prev.description,
        thumbnail: metadata.thumbnail || prev.thumbnail,
        author: metadata.author || prev.author,
        duration: durationMinutes || prev.duration,
      }));
    } catch (error) {
      console.error('Failed to fetch metadata:', error);
      // Fallback to basic detection
      const platform = detectPlatform(formData.url);
      const contentType = detectContentType(formData.url);
      setFormData(prev => ({
        ...prev,
        sourcePlatform: platform,
        contentType: contentType,
      }));
    } finally {
      setIsPreviewLoading(false);
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

    try {
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
        setResources(prev => prev.map(r => r.id === editingResource.id ? updated : r));
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
        setResources(prev => [newResource, ...prev]);
      }
    } catch (err) {
      console.error('Failed to save resource:', err);
    } finally {
      // Always close modal and reset form
      setShowAddModal(false);
      setEditingResource(null);
      resetForm();
    }
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
    if (!confirm('Are you sure you want to permanently delete this learning resource? This action cannot be undone.')) return;
    // Use hardDelete for permanent deletion from local and cloud
    await dbService.hardDelete(STORES.LEARNING_RESOURCES, id);
    setResources(resources.filter(r => r.id !== id));
    if (selectedResource?.id === id) setSelectedResource(null);
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this folder? Resources in this folder will be unassigned. This action cannot be undone.')) return;
    
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
    
    // Use hardDelete for permanent deletion from local and cloud
    await dbService.hardDelete(STORES.LEARNING_FOLDERS, id);
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

  const openResource = (resource: LearningResource) => {
    // Open URL immediately to avoid popup blocker
    window.open(resource.url, '_blank', 'noopener,noreferrer');
    
    // Update last accessed timestamp in background (non-blocking)
    const updated: LearningResource = {
      ...resource,
      lastAccessedAt: new Date().toISOString(),
      status: resource.status === 'unwatched' ? 'in-progress' : resource.status,
      updatedAt: new Date().toISOString()
    };
    dbService.put(STORES.LEARNING_RESOURCES, updated).then(() => {
      setResources(prev => prev.map(r => r.id === resource.id ? updated : r));
    }).catch(console.error);
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
      case 'unwatched': return <EyeOff size={14} className={cx.faint} />;
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

  const createLinkedTask = useCreateLinkedTask();
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);

  // Synergy: turn a resource into a real task (shared task domain).
  const addStudyTask = (resource: LearningResource) => {
    createLinkedTask({ title: `Study: ${resource.title}`, description: resource.url });
  };

  if (isLoading) {
    return <PageLoading />;
  }

  const closeAddModal = () => { setShowAddModal(false); resetForm(); };
  const closeNotesModal = () => { setShowNotesModal(false); setSelectedResource(null); };

  return (
    <FullPage
      title="Learning Vault"
      subtitle="Save and organize your learning resources. Never lose a valuable link again."
      actions={
        <>
          <button
            onClick={() => setShowStatsPanel(!showStatsPanel)}
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}
            aria-label="Stats"
            aria-pressed={showStatsPanel}
          >
            <BarChart2 size={18} />
            <span className="hidden sm:inline">Stats</span>
          </button>
          <button
            onClick={() => setShowFolderModal(true)}
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}
            aria-label="New folder"
          >
            <FolderPlus size={18} />
            <span className="hidden sm:inline">New Folder</span>
          </button>
          <button onClick={openAddModal} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <Plus size={18} />
            Add Resource
          </button>
        </>
      }
    >
      {/* Stats Panel */}
      {showStatsPanel && (
        <Card title="Progress analytics" className="mb-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Total Items', value: String(stats.totalItems), cls: cx.text },
              { label: 'Completed', value: String(stats.completedItems), cls: 'text-green-600 dark:text-green-400' },
              { label: 'Total Time', value: formatDuration(stats.totalWatchTime), cls: cx.text },
              { label: 'This Week', value: formatDuration(stats.weeklyWatchTime), cls: cx.text },
              { label: 'Avg Session', value: formatDuration(stats.averageSessionLength), cls: cx.text },
            ].map(s => (
              <div key={s.label}>
                <p className={`text-2xl font-bold tabular-nums ${s.cls}`}>{s.value}</p>
                <p className={`text-xs ${cx.muted}`}>{s.label}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${cx.faint}`} aria-hidden />
          <input
            type="text"
            aria-label="Search resources"
            placeholder="Search by title, tags, description..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className={`${inputCls} pl-9`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by type" value={filterContentType} onChange={(e) => setFilterContentType(e.target.value as any)} className={cx.input}>
            <option value="all">All Types</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>

          <select aria-label="Filter by status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className={cx.input}>
            <option value="all">All Status</option>
            <option value="unwatched">Unwatched</option>
            <option value="in-progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <select aria-label="Filter by folder" value={filterFolder} onChange={(e) => setFilterFolder(e.target.value)} className={cx.input}>
            <option value="all">All Folders</option>
            {folders.map(f => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
          </select>

          <select aria-label="Sort by" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className={cx.input}>
            <option value="savedAt">Date Saved</option>
            <option value="duration">Duration</option>
            <option value="title">Title</option>
            <option value="lastAccessed">Last Accessed</option>
          </select>

          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className={`${cx.input} !px-2.5 ${cx.hover} ${cx.muted}`}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            aria-label={sortOrder === 'asc' ? 'Sort ascending (click for descending)' : 'Sort descending (click for ascending)'}
          >
            {sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          </button>
        </div>
      </div>

      {/* Folders Quick Access */}
      {folders.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {folders.map(folder => {
            const active = filterFolder === folder.name;
            return (
              <button
                key={folder.id}
                onClick={() => setFilterFolder(active ? 'all' : folder.name)}
                aria-pressed={active}
                className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm border transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                    : `${cx.border} ${cx.muted} ${cx.hover}`
                }`}
              >
                <Folder size={14} style={{ color: folder.color }} />
                {folder.name}
                <span className={`text-xs ${cx.faint}`}>
                  {resources.filter(r => r.folder === folder.name).length}
                </span>
                {folderStats[folder.name] > 0 && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    {formatDuration(folderStats[folder.name])}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Resources Grid */}
      {filteredResources.length === 0 ? (
        <div>
          <Empty
            icon={<Bookmark size={30} className={cx.muted} />}
            title={resources.length === 0 ? 'Your learning library is empty' : 'No resources found'}
            subtitle={resources.length === 0
              ? 'Start building your learning library by adding your first resource.'
              : 'Try adjusting your filters or search query.'}
          />
          {resources.length === 0 && (
            <div className="flex justify-center -mt-8">
              <button onClick={openAddModal} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
                <Plus size={16} />
                Add Your First Resource
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredResources.map(resource => (
            <div
              key={resource.id}
              className={`group rounded-xl border ${cx.border} ${cx.card} overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-colors`}
            >
              {/* Thumbnail */}
              <button
                type="button"
                className="relative block w-full h-36 bg-gray-100 dark:bg-white/5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                onClick={() => openResource(resource)}
                aria-label={`${resource.contentType === 'video' ? 'Watch' : 'Listen to'} ${resource.title}`}
              >
                {resource.thumbnail ? (
                  <img
                    src={resource.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span className="w-full h-full flex items-center justify-center">
                    {resource.contentType === 'video' ? (
                      <Video size={30} className={cx.faint} />
                    ) : (
                      <Headphones size={30} className={cx.faint} />
                    )}
                  </span>
                )}

                {/* Overlay */}
                <span className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="flex items-center gap-2 text-white">
                    <Play size={18} />
                    <span className="text-sm font-medium">
                      {resource.contentType === 'video' ? 'Watch' : 'Listen'}
                    </span>
                  </span>
                </span>

                {/* Duration badge */}
                {resource.duration && (
                  <span className="absolute bottom-2 right-2 bg-black/75 px-1.5 py-0.5 rounded-md text-xs text-white tabular-nums">
                    {formatDuration(resource.duration)}
                  </span>
                )}

                {/* Content type badge */}
                <span className="absolute top-2 left-2 bg-black/50 rounded-md p-1">
                  {resource.contentType === 'video' ? (
                    <Video size={14} className="text-white" />
                  ) : (
                    <Headphones size={14} className="text-white" />
                  )}
                </span>

                {/* Platform badge */}
                <span className="absolute top-2 right-2 bg-white/90 dark:bg-black/60 rounded-md p-1">
                  <PlatformIcon platform={resource.sourcePlatform} className="w-3.5 h-3.5" />
                </span>

                {/* Unavailable warning */}
                {!resource.isSourceAvailable && (
                  <span className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="bg-red-600 px-3 py-1 rounded-full flex items-center gap-2 text-sm text-white">
                      <AlertTriangle size={14} />
                      Source Unavailable
                    </span>
                  </span>
                )}
              </button>

              {/* Content */}
              <div className="p-4">
                <button
                  type="button"
                  className={`block w-full text-left text-sm font-semibold truncate mb-0.5 ${cx.text} hover:text-blue-600 dark:hover:text-blue-400 transition-colors`}
                  onClick={() => openResource(resource)}
                  title={resource.title}
                >
                  {resource.title}
                </button>

                {resource.author && (
                  <p className={`text-xs truncate mb-2 ${cx.muted}`}>{resource.author}</p>
                )}

                <div className={`flex items-center gap-2 text-xs mb-3 whitespace-nowrap min-w-0 ${cx.muted}`}>
                  <span className="flex items-center gap-1 shrink-0">
                    {getStatusIcon(resource.status)}
                    {getStatusLabel(resource.status, resource.contentType)}
                  </span>
                  <span className={cx.faint}>·</span>
                  <span className="truncate" title={formatDateTime(resource.savedAt)}>
                    Added {formatDate(resource.savedAt)}
                  </span>
                </div>

                {/* Tags / folder / notes */}
                {(resource.tags.length > 0 || resource.folder || resource.notes.length > 0) && (
                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs mb-3 ${cx.muted}`}>
                    {resource.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="inline-flex items-center gap-1"><Tag size={11} />{tag}</span>
                    ))}
                    {resource.tags.length > 3 && (
                      <span className={cx.faint}>+{resource.tags.length - 3}</span>
                    )}
                    {resource.folder && (
                      <span className="inline-flex items-center gap-1"><Folder size={12} />{resource.folder}</span>
                    )}
                    {resource.notes.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <StickyNote size={12} />
                        {resource.notes.length} note{resource.notes.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className={`flex items-center gap-1 pt-2 border-t ${cx.border}`}>
                  <button
                    onClick={() => toggleStatus(resource)}
                    className={smallBtn}
                    title={resource.status === 'completed' ? 'Mark as unwatched' : 'Toggle status'}
                  >
                    {resource.status === 'completed' ? (
                      <>
                        <RotateCcw size={14} />
                        Reset
                      </>
                    ) : resource.status === 'in-progress' ? (
                      <>
                        <Check size={14} />
                        Complete
                      </>
                    ) : (
                      <>
                        <Play size={14} />
                        Start
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => openResource(resource)}
                    className={smallBtn}
                    title="Open URL"
                    aria-label="Open URL"
                  >
                    <ExternalLink size={14} />
                    <span className="hidden sm:inline">Open</span>
                  </button>
                  <div className="flex-1" />
                  <IconBtn label="Notes" onClick={() => { setSelectedResource(resource); setShowNotesModal(true); }}>
                    <StickyNote size={16} />
                  </IconBtn>
                  <IconBtn label="More actions" onClick={(e) => setMenu({ id: resource.id, el: e.currentTarget })}>
                    <MoreHorizontal size={16} />
                  </IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Card overflow menu */}
      {(() => {
        const r = menu ? resources.find(x => x.id === menu.id) : undefined;
        return (
          <Popover anchor={menu?.el ?? null} open={!!r} onClose={() => setMenu(null)} width={220}>
            {r ? (
              <>
                <MenuItem icon={<ListPlus size={16} />} label="Add study task" onClick={() => { setMenu(null); addStudyTask(r); }} />
                <MenuItem icon={<Edit2 size={16} />} label="Edit" onClick={() => { setMenu(null); openEditModal(r); }} />
                <MenuItem icon={<Trash2 size={16} />} label="Delete" danger onClick={() => { setMenu(null); handleDeleteResource(r.id); }} />
              </>
            ) : null}
          </Popover>
        );
      })()}

      {/* Add/Edit Resource Modal */}
      <Modal open={showAddModal} onClose={closeAddModal} title={editingResource ? 'Edit Resource' : 'Add Learning Resource'}>
        <ModalBody>
          <Field label="URL *">
            <div className="flex gap-2">
              <input
                type="url"
                value={formData.url}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className={`flex-1 min-w-0 ${cx.input}`}
              />
              <button
                type="button"
                onClick={handlePreview}
                disabled={!formData.url || isPreviewLoading}
                className={`inline-flex items-center gap-1.5 ${cx.btnGhost} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {isPreviewLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Detect
              </button>
            </div>
          </Field>

          <Field label="Title *">
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Resource title"
              className={inputCls}
            />
          </Field>

          <Field label="Description">
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of the content"
              rows={2}
              className={`${inputCls} resize-none`}
            />
          </Field>

          <Field label="Thumbnail URL">
            <input
              type="url"
              value={formData.thumbnail}
              onChange={(e) => setFormData({ ...formData, thumbnail: e.target.value })}
              placeholder="https://..."
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Content Type">
              <select
                value={formData.contentType}
                onChange={(e) => setFormData({ ...formData, contentType: e.target.value as LearningContentType })}
                className={inputCls}
              >
                <option value="video">Video</option>
                <option value="audio">Audio</option>
              </select>
            </Field>

            <Field label="Duration (minutes)">
              <input
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="60"
                min="0"
                className={inputCls}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Platform">
              <select
                value={formData.sourcePlatform}
                onChange={(e) => setFormData({ ...formData, sourcePlatform: e.target.value as LearningSourcePlatform })}
                className={inputCls}
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
            </Field>

            <Field label="Folder">
              <select
                value={formData.folder}
                onChange={(e) => setFormData({ ...formData, folder: e.target.value })}
                className={inputCls}
              >
                <option value="">No Folder</option>
                {folders.map(f => (
                  <option key={f.id} value={f.name}>{f.name}</option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Author / Channel">
            <input
              type="text"
              value={formData.author}
              onChange={(e) => setFormData({ ...formData, author: e.target.value })}
              placeholder="Channel name or author"
              className={inputCls}
            />
          </Field>

          <Field label="Tags (comma-separated)">
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="Machine Learning, Python, Tutorial"
              className={inputCls}
            />
          </Field>
        </ModalBody>
        <ModalFooter>
          <button onClick={closeAddModal} className={cx.btnGhost}>Cancel</button>
          <button
            onClick={handleSaveResource}
            disabled={!formData.url.trim() || !formData.title.trim()}
            className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}
          >
            <Save size={16} />
            {editingResource ? 'Update' : 'Save'}
          </button>
        </ModalFooter>
      </Modal>

      {/* Folder Modal */}
      <Modal open={showFolderModal} onClose={() => setShowFolderModal(false)} title="Create Folder">
        <ModalBody>
          <Field label="Folder Name">
            <input
              type="text"
              value={folderFormData.name}
              onChange={(e) => setFolderFormData({ ...folderFormData, name: e.target.value })}
              placeholder="e.g., Machine Learning, Backend"
              className={inputCls}
            />
          </Field>

          <div>
            <span className={`block text-xs font-medium mb-1 ${cx.muted}`}>Color</span>
            <div className="flex gap-2" role="radiogroup" aria-label="Folder color">
              {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'].map(color => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={folderFormData.color === color}
                  aria-label={`Color ${color}`}
                  title={color}
                  onClick={() => setFolderFormData({ ...folderFormData, color })}
                  className={`w-7 h-7 rounded-full transition-transform ${folderFormData.color === color ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] scale-110' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Existing folders */}
          {folders.length > 0 && (
            <div className={`pt-4 border-t ${cx.border}`}>
              <p className={`text-xs font-medium mb-1 ${cx.muted}`}>Existing Folders</p>
              <div>
                {folders.map(folder => (
                  <div key={folder.id} className={`flex items-center justify-between py-1.5 border-b last:border-b-0 ${cx.border}`}>
                    <div className="flex items-center gap-2">
                      <Folder size={16} style={{ color: folder.color }} />
                      <span className={`text-sm ${cx.text}`}>{folder.name}</span>
                    </div>
                    <IconBtn label={`Delete folder ${folder.name}`} danger onClick={() => handleDeleteFolder(folder.id)}>
                      <Trash2 size={16} />
                    </IconBtn>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button onClick={() => setShowFolderModal(false)} className={cx.btnGhost}>Cancel</button>
          <button
            onClick={handleSaveFolder}
            disabled={!folderFormData.name.trim()}
            className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}
          >
            <FolderPlus size={16} />
            Create Folder
          </button>
        </ModalFooter>
      </Modal>

      {/* Notes Modal */}
      <Modal open={showNotesModal && !!selectedResource} onClose={closeNotesModal} title="Notes">
        {selectedResource ? (
          <ModalBody>
            <p className={`text-sm truncate -mt-1 ${cx.muted}`}>{selectedResource.title}</p>
            {/* Add note form */}
            <div>
              <div className="flex gap-2 mb-1.5">
                <input
                  type="text"
                  aria-label="Timestamp (optional)"
                  value={noteTimestamp}
                  onChange={(e) => setNoteTimestamp(e.target.value)}
                  placeholder="0:00 (optional)"
                  className={`w-36 ${cx.input}`}
                />
                <input
                  type="text"
                  aria-label="Note"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add a note..."
                  className={`flex-1 min-w-0 ${cx.input}`}
                  onKeyPress={(e) => e.key === 'Enter' && addNote()}
                />
                <button
                  onClick={addNote}
                  disabled={!noteContent.trim()}
                  className={cx.btnPrimary}
                  aria-label="Add note"
                  title="Add note"
                >
                  <Plus size={16} />
                </button>
              </div>
              <p className={`text-xs ${cx.faint}`}>Tip: Add a timestamp (e.g., 5:30) to link your note to a specific moment</p>
            </div>

            {/* Notes list */}
            {selectedResource.notes.length === 0 ? (
              <div className="flex flex-col items-center text-center py-8">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-3">
                  <StickyNote size={20} className={cx.muted} />
                </div>
                <p className={`text-sm font-semibold ${cx.text}`}>No notes yet</p>
              </div>
            ) : (
              <div>
                {selectedResource.notes.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)).map(note => (
                  <div key={note.id} className={`group flex items-start gap-3 py-2.5 border-b last:border-b-0 ${cx.border}`}>
                    <div className="flex-1 min-w-0">
                      {note.timestamp !== undefined && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 mb-0.5">
                          <Clock size={12} />
                          {formatDuration(note.timestamp)}
                        </span>
                      )}
                      <p className={`text-sm ${cx.text}`}>{note.content}</p>
                      <p className={`text-xs mt-0.5 ${cx.faint}`}>{formatDate(note.createdAt)}</p>
                    </div>
                    <IconBtn
                      label="Delete note"
                      danger
                      onClick={() => deleteNote(note.id)}
                      className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 size={16} />
                    </IconBtn>
                  </div>
                ))}
              </div>
            )}
          </ModalBody>
        ) : null}
      </Modal>
    </FullPage>
  );
};

export default LearningVaultView;
