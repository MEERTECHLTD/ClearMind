import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Modal,
  ScrollView,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  Plus,
  ExternalLink,
  Pencil,
  Trash2,
  X,
  Save,
  Play,
  Video,
  Headphones,
  FolderPlus,
  Folder,
  Search,
  Check,
  RotateCcw,
  TriangleAlert,
  ChartColumn,
  StickyNote,
  Bookmark,
  Youtube,
  Globe,
  GraduationCap,
  Sparkles,
  EyeOff,
  ArrowUpDown,
} from 'lucide-react-native';
import type {
  LearningResource,
  LearningFolder,
  LearningContentType,
  LearningContentStatus,
  LearningSourcePlatform,
  LearningResourceNote,
} from '@clearmind/shared';
import { STORES } from '../../services/db';
import { newId } from '../../lib/id';
import { useCollection } from '../../hooks/useCollection';
import {
  Screen,
  AppHeader,
  Input,
  TextArea,
  Select,
  Fab,
  EmptyState,
  Spinner,
  Badge,
  confirmDialog,
  useToast,
} from '../../components/ui';

// ----------------------------------------------------------------------------
// Pure helpers (ported from web; date formatting done manually for Hermes)
// ----------------------------------------------------------------------------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// Platform detection from URL (verbatim port)
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

// Content type detection from URL (verbatim port)
const detectContentType = (url: string): LearningContentType => {
  const urlLower = url.toLowerCase();
  const audioKeywords = ['podcast', 'spotify', 'soundcloud', 'audio', '.mp3', '.m4a', '.wav'];
  if (audioKeywords.some((keyword) => urlLower.includes(keyword))) return 'audio';
  return 'video';
};

interface FetchedMetadata {
  title?: string;
  description?: string;
  thumbnail?: string;
  author?: string;
  duration?: number; // in seconds
  platform?: LearningSourcePlatform;
  contentType?: LearningContentType;
}

const extractYouTubeVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const extractVimeoVideoId = (url: string): string | null => {
  const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return match ? match[1] : null;
};

// Best-effort metadata fetch via oEmbed providers (verbatim port of strategies).
// CORE CRUD never depends on this succeeding — every branch is guarded.
const fetchMetadataFromUrl = async (url: string): Promise<FetchedMetadata> => {
  const platform = detectPlatform(url);
  const contentType = detectContentType(url);
  const metadata: FetchedMetadata = { platform, contentType };

  try {
    const noembedResponse = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (noembedResponse.ok) {
      const data = await noembedResponse.json();
      if (data && !data.error) {
        metadata.title = data.title;
        metadata.author = data.author_name;
        metadata.thumbnail = data.thumbnail_url;
        if (data.duration) {
          metadata.duration = typeof data.duration === 'number' ? data.duration : parseInt(data.duration);
        }
      }
    }
  } catch (e) {
    // noembed failed, try alternatives
  }

  try {
    if (platform === 'youtube') {
      const videoId = extractYouTubeVideoId(url);
      if (videoId) {
        metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        try {
          const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
          const oembedResponse = await fetch(oembedUrl);
          if (oembedResponse.ok) {
            const oembedData = await oembedResponse.json();
            if (oembedData.title && !metadata.title) metadata.title = oembedData.title;
            if (oembedData.author_name && !metadata.author) metadata.author = oembedData.author_name;
          }
        } catch (e) {
          // YouTube oEmbed fallback failed
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
          // Vimeo oEmbed fallback failed
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
        // TED oEmbed fallback failed
      }
    }
  } catch (e) {
    // Platform-specific fetch failed
  }

  if (platform === 'youtube' && !metadata.thumbnail) {
    const videoId = extractYouTubeVideoId(url);
    if (videoId) {
      metadata.thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
  }

  return metadata;
};

const PLATFORM_NAMES: Record<LearningSourcePlatform, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  spotify: 'Spotify',
  'apple-podcasts': 'Apple Podcasts',
  soundcloud: 'SoundCloud',
  coursera: 'Coursera',
  udemy: 'Udemy',
  'khan-academy': 'Khan Academy',
  'mit-ocw': 'MIT OpenCourseWare',
  ted: 'TED',
  other: 'Other',
};

const PLATFORM_OPTIONS = (Object.keys(PLATFORM_NAMES) as LearningSourcePlatform[]).map((p) => ({
  label: PLATFORM_NAMES[p],
  value: p,
}));

const FOLDER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function PlatformIcon({ platform, size = 18 }: { platform: LearningSourcePlatform; size?: number }) {
  switch (platform) {
    case 'youtube':
      return <Youtube size={size} color="#ef4444" />;
    case 'coursera':
    case 'udemy':
    case 'khan-academy':
    case 'mit-ocw':
      return <GraduationCap size={size} color="#3B82F6" />;
    case 'ted':
      return <Sparkles size={size} color="#ef4444" />;
    default:
      return <Globe size={size} color="#9ca3af" />;
  }
}

function statusIcon(status: LearningContentStatus, size = 14) {
  switch (status) {
    case 'unwatched':
      return <EyeOff size={size} color="#9ca3af" />;
    case 'in-progress':
      return <Play size={size} color="#f59e0b" />;
    case 'completed':
      return <Check size={size} color="#10b981" />;
  }
}

function statusLabel(status: LearningContentStatus, contentType: LearningContentType): string {
  const action = contentType === 'audio' ? 'Listened' : 'Watched';
  switch (status) {
    case 'unwatched':
      return contentType === 'audio' ? 'Unlistened' : 'Unwatched';
    case 'in-progress':
      return 'In Progress';
    case 'completed':
      return action;
  }
}

type SortKey = 'savedAt' | 'duration' | 'title' | 'lastAccessed';

// ----------------------------------------------------------------------------
// Screen
// ----------------------------------------------------------------------------
export default function LearningVaultScreen() {
  const {
    items: resources,
    loading,
    create: createResource,
    update: updateResource,
    remove: removeResource,
  } = useCollection<LearningResource>(STORES.LEARNING_RESOURCES);
  const {
    items: folders,
    create: createFolder,
    remove: removeFolder,
  } = useCollection<LearningFolder>(STORES.LEARNING_FOLDERS);
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [filterContentType, setFilterContentType] = useState<'all' | LearningContentType>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | LearningContentStatus>('all');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortKey>('savedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showStats, setShowStats] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LearningResource | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [notesId, setNotesId] = useState<string | null>(null);

  // Derive the notes-modal target each render so it always reflects latest data.
  const notesResource = notesId ? resources.find((r) => r.id === notesId) ?? null : null;

  const filtered = useMemo(() => {
    let result = [...resources];
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.description?.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.author?.toLowerCase().includes(q)
      );
    }
    if (filterContentType !== 'all') result = result.filter((r) => r.contentType === filterContentType);
    if (filterStatus !== 'all') result = result.filter((r) => r.status === filterStatus);
    if (filterFolder !== 'all') result = result.filter((r) => r.folder === filterFolder);

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'savedAt':
          cmp = new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime();
          break;
        case 'duration':
          cmp = (a.duration || 0) - (b.duration || 0);
          break;
        case 'title':
          cmp = a.title.localeCompare(b.title);
          break;
        case 'lastAccessed':
          cmp = new Date(a.lastAccessedAt || '0').getTime() - new Date(b.lastAccessedAt || '0').getTime();
          break;
      }
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [resources, search, filterContentType, filterStatus, filterFolder, sortBy, sortOrder]);

  const stats = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const completed = resources.filter((r) => r.status === 'completed');
    const totalWatchTime = completed.reduce((s, r) => s + (r.duration || 0), 0);
    const weekly = completed.filter((r) => r.completedAt && new Date(r.completedAt) >= weekAgo);
    const weeklyWatchTime = weekly.reduce((s, r) => s + (r.duration || 0), 0);
    return {
      totalItems: resources.length,
      completedItems: completed.length,
      totalWatchTime,
      weeklyWatchTime,
      averageSessionLength: completed.length > 0 ? totalWatchTime / completed.length : 0,
    };
  }, [resources]);

  const folderStats = useMemo(() => {
    const result: Record<string, number> = {};
    for (const f of folders) {
      const fr = resources.filter((r) => r.folder === f.name && r.status === 'completed');
      result[f.name] = fr.reduce((s, r) => s + (r.duration || 0), 0);
    }
    return result;
  }, [resources, folders]);

  const folderOptions = useMemo(
    () => [{ label: 'All Folders', value: 'all' }, ...folders.map((f) => ({ label: f.name, value: f.name }))],
    [folders]
  );

  const openAdd = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (r: LearningResource) => {
    setEditing(r);
    setFormOpen(true);
  };

  const handleSaveResource = (data: ResourceFormData) => {
    const durationSeconds = data.duration ? parseInt(data.duration) * 60 : undefined;
    const tags = data.tags.split(',').map((t) => t.trim()).filter(Boolean);
    if (editing) {
      updateResource({
        ...editing,
        url: data.url,
        title: data.title,
        description: data.description || undefined,
        thumbnail: data.thumbnail || undefined,
        contentType: data.contentType,
        duration: durationSeconds,
        sourcePlatform: data.sourcePlatform,
        author: data.author || undefined,
        tags,
        folder: data.folder || undefined,
        updatedAt: new Date().toISOString(),
      });
      toast.show('Resource updated', 'success');
    } else {
      createResource({
        id: newId(),
        url: data.url,
        title: data.title,
        description: data.description || undefined,
        thumbnail: data.thumbnail || undefined,
        contentType: data.contentType,
        duration: durationSeconds,
        sourcePlatform: data.sourcePlatform,
        author: data.author || undefined,
        status: 'unwatched',
        progress: 0,
        tags,
        folder: data.folder || undefined,
        notes: [],
        isSourceAvailable: true,
        savedAt: new Date().toISOString(),
      });
      toast.show('Resource saved', 'success');
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDeleteResource = async (r: LearningResource) => {
    if (
      await confirmDialog({
        title: 'Delete resource',
        message: `Permanently delete “${r.title}”? This cannot be undone.`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      removeResource(r.id);
      if (notesId === r.id) setNotesId(null);
      toast.show('Resource deleted', 'info');
    }
  };

  const toggleStatus = (r: LearningResource) => {
    const next: LearningContentStatus =
      r.status === 'unwatched' ? 'in-progress' : r.status === 'in-progress' ? 'completed' : 'unwatched';
    updateResource({
      ...r,
      status: next,
      completedAt: next === 'completed' ? new Date().toISOString() : undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const openResource = (r: LearningResource) => {
    Linking.openURL(r.url).catch(() => toast.show('Could not open link', 'error'));
    updateResource({
      ...r,
      lastAccessedAt: new Date().toISOString(),
      status: r.status === 'unwatched' ? 'in-progress' : r.status,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleCreateFolder = (name: string, color: string) => {
    createFolder({ id: newId(), name, color, createdAt: new Date().toISOString() });
    toast.show('Folder created', 'success');
  };

  const handleDeleteFolder = async (f: LearningFolder) => {
    if (
      await confirmDialog({
        title: 'Delete folder',
        message: `Delete “${f.name}”? Resources in it will be unassigned.`,
        confirmText: 'Delete',
        destructive: true,
      })
    ) {
      resources
        .filter((r) => r.folder === f.name)
        .forEach((r) => updateResource({ ...r, folder: undefined, updatedAt: new Date().toISOString() }));
      removeFolder(f.id);
      if (filterFolder === f.name) setFilterFolder('all');
      toast.show('Folder deleted', 'info');
    }
  };

  const addNote = (content: string, timestampStr: string) => {
    if (!notesResource || !content.trim()) return;
    const timestamp = timestampStr
      ? parseInt(timestampStr.split(':')[0]) * 60 + parseInt(timestampStr.split(':')[1] || '0')
      : undefined;
    const note: LearningResourceNote = {
      id: newId(),
      content: content.trim(),
      timestamp: Number.isNaN(timestamp as number) ? undefined : timestamp,
      createdAt: new Date().toISOString(),
    };
    updateResource({
      ...notesResource,
      notes: [...notesResource.notes, note],
      updatedAt: new Date().toISOString(),
    });
  };

  const deleteNote = (noteId: string) => {
    if (!notesResource) return;
    updateResource({
      ...notesResource,
      notes: notesResource.notes.filter((n) => n.id !== noteId),
      updatedAt: new Date().toISOString(),
    });
  };

  if (loading) return <Spinner label="Loading Learning Vault…" />;

  const ListHeader = (
    <View className="px-4 pt-4">
      {/* Search */}
      <View className="relative mb-3">
        <View className="absolute left-3 top-0 bottom-0 justify-center z-10">
          <Search size={16} color="#9ca3af" />
        </View>
        <Input
          placeholder="Search title, tags, author…"
          value={search}
          onChangeText={setSearch}
          style={{ paddingLeft: 36 }}
        />
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1">
        <Select<'all' | LearningContentType>
          value={filterContentType}
          onChange={setFilterContentType}
          options={[
            { label: 'All Types', value: 'all' },
            { label: 'Video', value: 'video' },
            { label: 'Audio', value: 'audio' },
          ]}
          className="w-36 mr-2"
        />
        <Select<'all' | LearningContentStatus>
          value={filterStatus}
          onChange={setFilterStatus}
          options={[
            { label: 'All Status', value: 'all' },
            { label: 'Unwatched', value: 'unwatched' },
            { label: 'In Progress', value: 'in-progress' },
            { label: 'Completed', value: 'completed' },
          ]}
          className="w-40 mr-2"
        />
        <Select<string> value={filterFolder} onChange={setFilterFolder} options={folderOptions} className="w-40 mr-2" />
        <Select<SortKey>
          value={sortBy}
          onChange={setSortBy}
          options={[
            { label: 'Date Saved', value: 'savedAt' },
            { label: 'Duration', value: 'duration' },
            { label: 'Title', value: 'title' },
            { label: 'Last Accessed', value: 'lastAccessed' },
          ]}
          className="w-40 mr-2"
        />
        <Pressable
          onPress={() => setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
          className="flex-row items-center justify-center bg-midnight-light rounded-2xl px-4 border border-hairline active:opacity-80"
        >
          <ArrowUpDown size={16} color="#9ca3af" />
          <Text className="text-ink-muted text-xs ml-1.5">{sortOrder === 'asc' ? 'Asc' : 'Desc'}</Text>
        </Pressable>
      </ScrollView>

      {/* Folder quick-access chips */}
      {folders.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3">
          {folders.map((f) => {
            const active = filterFolder === f.name;
            const count = resources.filter((r) => r.folder === f.name).length;
            return (
              <Pressable
                key={f.id}
                onPress={() => setFilterFolder(active ? 'all' : f.name)}
                className={`flex-row items-center px-3 py-1.5 rounded-full mr-2 border ${
                  active ? 'bg-accent/15 border-accent/50' : 'bg-midnight-light border-hairline'
                }`}
              >
                <Folder size={14} color={f.color || '#9ca3af'} />
                <Text className={`text-sm ml-1.5 ${active ? 'text-accent font-semibold' : 'text-ink'}`}>{f.name}</Text>
                <Text className="text-ink-muted text-xs ml-1">({count})</Text>
                {folderStats[f.name] > 0 && (
                  <Text className="text-emerald-400 text-xs ml-1">{formatDuration(folderStats[f.name])}</Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Stats panel */}
      {showStats && (
        <View className="mt-3 p-4 rounded-2xl bg-midnight-light border border-hairline">
          <View className="flex-row items-center mb-3">
            <ChartColumn size={16} color="#9ca3af" />
            <Text className="text-ink-muted text-sm font-semibold ml-2">Progress Analytics</Text>
          </View>
          <View className="flex-row flex-wrap">
            <StatTile label="Total" value={String(stats.totalItems)} color="#e2e8f0" />
            <StatTile label="Completed" value={String(stats.completedItems)} color="#10b981" />
            <StatTile label="Total Time" value={formatDuration(stats.totalWatchTime)} color="#3B82F6" />
            <StatTile label="This Week" value={formatDuration(stats.weeklyWatchTime)} color="#a855f7" />
            <StatTile label="Avg Session" value={formatDuration(stats.averageSessionLength)} color="#f59e0b" />
          </View>
        </View>
      )}

      <Text className="text-ink-muted text-xs mt-3 mb-1">
        {filtered.length} of {resources.length} resources
      </Text>
    </View>
  );

  return (
    <Screen padded={false}>
      <AppHeader
        title="Learning Vault"
        subtitle={`${stats.completedItems} / ${resources.length} completed`}
        right={
          <View className="flex-row items-center">
            <Pressable onPress={() => setShowStats((s) => !s)} hitSlop={8} className="p-2 active:opacity-60">
              <ChartColumn size={20} color={showStats ? '#3B82F6' : '#9ca3af'} />
            </Pressable>
            <Pressable onPress={() => setFolderOpen(true)} hitSlop={8} className="p-2 active:opacity-60">
              <FolderPlus size={20} color="#9ca3af" />
            </Pressable>
          </View>
        }
      />

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 96 }}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          <EmptyState
            icon={<Bookmark size={40} color="#3B82F6" />}
            title={resources.length === 0 ? 'No resources yet' : 'No matches'}
            subtitle={
              resources.length === 0
                ? 'Paste a link to bank it forever and never lose a valuable resource again.'
                : 'Try adjusting your filters or search.'
            }
            ctaTitle={resources.length === 0 ? 'Add your first resource' : undefined}
            onCta={resources.length === 0 ? openAdd : undefined}
          />
        }
        renderItem={({ item }) => (
          <View className="px-4">
            <ResourceCard
              resource={item}
              onOpen={() => openResource(item)}
              onToggle={() => toggleStatus(item)}
              onNotes={() => setNotesId(item.id)}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDeleteResource(item)}
            />
          </View>
        )}
      />

      <Fab onPress={openAdd} />

      <ResourceFormModal
        visible={formOpen}
        initial={editing}
        folders={folders}
        onCancel={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSaveResource}
        onDetectFail={() => toast.show('Could not auto-detect — fill in manually', 'info')}
      />

      <FolderModal
        visible={folderOpen}
        folders={folders}
        onClose={() => setFolderOpen(false)}
        onCreate={handleCreateFolder}
        onDelete={handleDeleteFolder}
      />

      <NotesModal
        resource={notesResource}
        onClose={() => setNotesId(null)}
        onAddNote={addNote}
        onDeleteNote={deleteNote}
      />
    </Screen>
  );
}

// ----------------------------------------------------------------------------
// Stat tile
// ----------------------------------------------------------------------------
function StatTile({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View className="w-1/3 items-center py-2">
      <Text className="text-xl font-extrabold" style={{ color }}>
        {value}
      </Text>
      <Text className="text-ink-muted text-xs mt-0.5">{label}</Text>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Resource card
// ----------------------------------------------------------------------------
function ResourceCard({
  resource,
  onOpen,
  onToggle,
  onNotes,
  onEdit,
  onDelete,
}: {
  resource: LearningResource;
  onOpen: () => void;
  onToggle: () => void;
  onNotes: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toggleMeta =
    resource.status === 'completed'
      ? { icon: <RotateCcw size={14} color="#e2e8f0" />, label: 'Reset' }
      : resource.status === 'in-progress'
      ? { icon: <Check size={14} color="#e2e8f0" />, label: 'Complete' }
      : { icon: <Play size={14} color="#e2e8f0" />, label: 'Start' };

  return (
    <View className="rounded-2xl bg-midnight-light border border-hairline overflow-hidden">
      {/* Thumbnail */}
      <Pressable onPress={onOpen} className="active:opacity-90">
        <View className="h-40 bg-midnight-lighter items-center justify-center">
          {resource.thumbnail ? (
            <Image source={{ uri: resource.thumbnail }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
          ) : resource.contentType === 'video' ? (
            <Video size={44} color="#4b5563" />
          ) : (
            <Headphones size={44} color="#4b5563" />
          )}

          {/* Top-left content type */}
          <View className="absolute top-2 left-2 bg-black/60 rounded-full p-1.5">
            {resource.contentType === 'video' ? (
              <Video size={14} color="#fff" />
            ) : (
              <Headphones size={14} color="#fff" />
            )}
          </View>
          {/* Top-right platform */}
          <View className="absolute top-2 right-2 bg-black/60 rounded-full p-1.5">
            <PlatformIcon platform={resource.sourcePlatform} size={14} />
          </View>
          {/* Duration */}
          {resource.duration ? (
            <View className="absolute bottom-2 right-2 bg-black/80 px-2 py-0.5 rounded">
              <Text className="text-white text-xs">{formatDuration(resource.duration)}</Text>
            </View>
          ) : null}
          {/* Unavailable */}
          {!resource.isSourceAvailable && (
            <View className="absolute inset-0 bg-red-900/50 items-center justify-center">
              <View className="flex-row items-center bg-red-600 px-3 py-1 rounded-full">
                <TriangleAlert size={14} color="#fff" />
                <Text className="text-white text-xs ml-1">Source Unavailable</Text>
              </View>
            </View>
          )}
        </View>
      </Pressable>

      {/* Body */}
      <View className="p-4">
        <Pressable onPress={onOpen}>
          <Text className="text-ink font-semibold text-base" numberOfLines={2}>
            {resource.title}
          </Text>
        </Pressable>
        {resource.author ? (
          <Text className="text-ink-muted text-xs mt-0.5" numberOfLines={1}>
            {resource.author}
          </Text>
        ) : null}

        <View className="flex-row items-center flex-wrap mt-2">
          {statusIcon(resource.status)}
          <Text className="text-ink-muted text-xs ml-1">{statusLabel(resource.status, resource.contentType)}</Text>
          <Text className="text-ink-muted text-xs mx-1">•</Text>
          <Text className="text-ink-muted text-xs">Added {formatDate(resource.savedAt)}</Text>
        </View>

        {resource.tags.length > 0 && (
          <View className="flex-row flex-wrap mt-2">
            {resource.tags.slice(0, 4).map((tag) => (
              <View key={tag} className="bg-midnight-lighter px-2 py-0.5 rounded mr-1 mb-1">
                <Text className="text-ink-muted text-[10px]">#{tag}</Text>
              </View>
            ))}
            {resource.tags.length > 4 ? (
              <Text className="text-ink-muted text-[10px] mt-0.5">+{resource.tags.length - 4}</Text>
            ) : null}
          </View>
        )}

        <View className="flex-row items-center mt-2">
          {resource.folder ? (
            <View className="flex-row items-center mr-3">
              <Folder size={12} color="#9ca3af" />
              <Text className="text-ink-muted text-xs ml-1">{resource.folder}</Text>
            </View>
          ) : null}
          {resource.notes.length > 0 ? (
            <View className="flex-row items-center">
              <StickyNote size={12} color="#a855f7" />
              <Text className="text-purple-400 text-xs ml-1">
                {resource.notes.length} note{resource.notes.length > 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Actions */}
        <View className="flex-row items-center mt-3 pt-3 border-t border-hairline">
          <Pressable
            onPress={onToggle}
            className="flex-1 flex-row items-center justify-center py-2 rounded-lg bg-midnight-lighter active:opacity-80 mr-2"
          >
            {toggleMeta.icon}
            <Text className="text-ink text-xs ml-1.5">{toggleMeta.label}</Text>
          </Pressable>
          <Pressable
            onPress={onOpen}
            className="flex-row items-center justify-center px-3 py-2 rounded-lg bg-accent active:bg-accent-hover mr-1"
          >
            <ExternalLink size={14} color="#fff" />
            <Text className="text-white text-xs ml-1 font-medium">Open</Text>
          </Pressable>
          <Pressable onPress={onNotes} hitSlop={6} className="p-2 active:opacity-60">
            <StickyNote size={16} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={6} className="p-2 active:opacity-60">
            <Pencil size={16} color="#9ca3af" />
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={6} className="p-2 active:opacity-60">
            <Trash2 size={16} color="#9ca3af" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------------
// Resource form modal (add / edit)
// ----------------------------------------------------------------------------
interface ResourceFormData {
  url: string;
  title: string;
  description: string;
  thumbnail: string;
  contentType: LearningContentType;
  duration: string;
  sourcePlatform: LearningSourcePlatform;
  author: string;
  tags: string;
  folder: string;
}

const EMPTY_FORM: ResourceFormData = {
  url: '',
  title: '',
  description: '',
  thumbnail: '',
  contentType: 'video',
  duration: '',
  sourcePlatform: 'other',
  author: '',
  tags: '',
  folder: '',
};

function ResourceFormModal({
  visible,
  initial,
  folders,
  onCancel,
  onSave,
  onDetectFail,
}: {
  visible: boolean;
  initial: LearningResource | null;
  folders: LearningFolder[];
  onCancel: () => void;
  onSave: (d: ResourceFormData) => void;
  onDetectFail: () => void;
}) {
  const [form, setForm] = useState<ResourceFormData>(EMPTY_FORM);
  const [detecting, setDetecting] = useState(false);

  // Reset when (re)opened.
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setDetecting(false);
      if (initial) {
        setForm({
          url: initial.url,
          title: initial.title,
          description: initial.description || '',
          thumbnail: initial.thumbnail || '',
          contentType: initial.contentType,
          duration: initial.duration ? String(Math.floor(initial.duration / 60)) : '',
          sourcePlatform: initial.sourcePlatform,
          author: initial.author || '',
          tags: initial.tags.join(', '),
          folder: initial.folder || '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }

  const set = <K extends keyof ResourceFormData>(key: K, value: ResourceFormData[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleDetect = async () => {
    if (!form.url.trim()) return;
    setDetecting(true);
    try {
      const meta = await fetchMetadataFromUrl(form.url);
      const platform = meta.platform || detectPlatform(form.url);
      const contentType = meta.contentType || detectContentType(form.url);
      const fallbackTitle =
        platform !== 'other' ? `${contentType === 'audio' ? 'Audio' : 'Video'} from ${PLATFORM_NAMES[platform]}` : '';
      const durationMinutes = meta.duration ? String(Math.ceil(meta.duration / 60)) : '';
      setForm((p) => ({
        ...p,
        sourcePlatform: meta.platform || p.sourcePlatform,
        contentType: meta.contentType || p.contentType,
        title: meta.title || p.title || fallbackTitle,
        description: meta.description || p.description,
        thumbnail: meta.thumbnail || p.thumbnail,
        author: meta.author || p.author,
        duration: durationMinutes || p.duration,
      }));
    } catch (e) {
      const platform = detectPlatform(form.url);
      setForm((p) => ({ ...p, sourcePlatform: platform, contentType: detectContentType(form.url) }));
      onDetectFail();
    } finally {
      setDetecting(false);
    }
  };

  const canSave = form.url.trim().length > 0 && form.title.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave({ ...form, url: form.url.trim(), title: form.title.trim() });
  };

  const folderSelectOptions = [{ label: 'No Folder', value: '' }, ...folders.map((f) => ({ label: f.name, value: f.name }))];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        className="bg-black/60 justify-end"
      >
        <View className="bg-midnight rounded-t-3xl border-t border-hairline" style={{ maxHeight: '92%' }}>
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3">
            <Text className="text-ink text-lg font-bold">{initial ? 'Edit Resource' : 'Add Learning Resource'}</Text>
            <Pressable onPress={onCancel} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
            <Text className="text-ink-muted text-xs mb-1.5 ml-1">URL *</Text>
            <View className="flex-row mb-3">
              <Input
                placeholder="https://youtube.com/watch?v=…"
                value={form.url}
                onChangeText={(v) => set('url', v)}
                autoCapitalize="none"
                keyboardType="url"
                className="flex-1 mr-2"
              />
              <Pressable
                onPress={handleDetect}
                disabled={!form.url.trim() || detecting}
                className={`items-center justify-center px-4 rounded-2xl ${
                  !form.url.trim() || detecting ? 'bg-midnight-lighter' : 'bg-accent active:bg-accent-hover'
                }`}
              >
                {detecting ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Detect</Text>}
              </Pressable>
            </View>

            <Input label="Title *" placeholder="Resource title" value={form.title} onChangeText={(v) => set('title', v)} className="mb-3" />
            <TextArea
              label="Description"
              placeholder="Brief description"
              value={form.description}
              onChangeText={(v) => set('description', v)}
              minHeight={70}
              className="mb-3"
            />
            <Input
              label="Thumbnail URL"
              placeholder="https://…"
              value={form.thumbnail}
              onChangeText={(v) => set('thumbnail', v)}
              autoCapitalize="none"
              className="mb-3"
            />

            <View className="flex-row mb-3">
              <Select<LearningContentType>
                label="Content Type"
                value={form.contentType}
                onChange={(v) => set('contentType', v)}
                options={[
                  { label: 'Video', value: 'video' },
                  { label: 'Audio', value: 'audio' },
                ]}
                className="flex-1 mr-2"
              />
              <Input
                label="Duration (min)"
                placeholder="60"
                value={form.duration}
                onChangeText={(v) => set('duration', v)}
                keyboardType="number-pad"
                className="flex-1"
              />
            </View>

            <Select<LearningSourcePlatform>
              label="Platform"
              value={form.sourcePlatform}
              onChange={(v) => set('sourcePlatform', v)}
              options={PLATFORM_OPTIONS}
              className="mb-3"
            />
            <Select<string>
              label="Folder"
              value={form.folder}
              onChange={(v) => set('folder', v)}
              options={folderSelectOptions}
              className="mb-3"
            />
            <Input
              label="Author / Channel"
              placeholder="Channel name or author"
              value={form.author}
              onChangeText={(v) => set('author', v)}
              className="mb-3"
            />
            <Input
              label="Tags (comma-separated)"
              placeholder="Machine Learning, Python"
              value={form.tags}
              onChangeText={(v) => set('tags', v)}
              autoCapitalize="none"
              className="mb-3"
            />
          </ScrollView>

          <View className="flex-row px-5 pt-3 pb-8 border-t border-hairline">
            <Pressable onPress={onCancel} className="flex-1 items-center py-3.5 rounded-full bg-midnight-lighter active:opacity-80 mr-3">
              <Text className="text-ink font-semibold">Cancel</Text>
            </Pressable>
            <Pressable
              onPress={save}
              disabled={!canSave}
              className={`flex-1 flex-row items-center justify-center py-3.5 rounded-full ${
                canSave ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter opacity-50'
              }`}
            >
              <Save size={16} color="#fff" />
              <Text className="text-white font-bold ml-2">{initial ? 'Update' : 'Save'}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Folder modal
// ----------------------------------------------------------------------------
function FolderModal({
  visible,
  folders,
  onClose,
  onCreate,
  onDelete,
}: {
  visible: boolean;
  folders: LearningFolder[];
  onClose: () => void;
  onCreate: (name: string, color: string) => void;
  onDelete: (f: LearningFolder) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(FOLDER_COLORS[0]);

  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setName('');
      setColor(FOLDER_COLORS[0]);
    }
  }

  const create = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), color);
    setName('');
    setColor(FOLDER_COLORS[0]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        className="bg-black/60 justify-end"
      >
        <View className="bg-midnight rounded-t-3xl border-t border-hairline px-5 pt-5 pb-8" style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-ink text-lg font-bold">Folders</Text>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <Input label="Folder name" placeholder="e.g. Machine Learning" value={name} onChangeText={setName} className="mb-3" />
          <Text className="text-ink-muted text-xs mb-1.5 ml-1">Color</Text>
          <View className="flex-row mb-4">
            {FOLDER_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                className="w-9 h-9 rounded-full mr-2 items-center justify-center"
                style={{ backgroundColor: c }}
              >
                {color === c ? <Check size={16} color="#fff" /> : null}
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={create}
            disabled={!name.trim()}
            className={`flex-row items-center justify-center py-3.5 rounded-full mb-4 ${
              name.trim() ? 'bg-accent active:bg-accent-hover' : 'bg-midnight-lighter opacity-50'
            }`}
          >
            <FolderPlus size={16} color="#fff" />
            <Text className="text-white font-bold ml-2">Create Folder</Text>
          </Pressable>

          {folders.length > 0 && (
            <>
              <Text className="text-ink-muted text-xs mb-2 ml-1">Existing</Text>
              <ScrollView style={{ maxHeight: 240 }}>
                {folders.map((f) => (
                  <View
                    key={f.id}
                    className="flex-row items-center justify-between bg-midnight-light rounded-xl px-3 py-2.5 mb-2 border border-hairline"
                  >
                    <View className="flex-row items-center">
                      <Folder size={16} color={f.color || '#9ca3af'} />
                      <Text className="text-ink text-sm ml-2">{f.name}</Text>
                    </View>
                    <Pressable onPress={() => onDelete(f)} hitSlop={8} className="p-1 active:opacity-60">
                      <Trash2 size={16} color="#9ca3af" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Notes modal
// ----------------------------------------------------------------------------
function NotesModal({
  resource,
  onClose,
  onAddNote,
  onDeleteNote,
}: {
  resource: LearningResource | null;
  onClose: () => void;
  onAddNote: (content: string, timestamp: string) => void;
  onDeleteNote: (noteId: string) => void;
}) {
  const [content, setContent] = useState('');
  const [timestamp, setTimestamp] = useState('');

  const visible = resource !== null;
  const [lastVisible, setLastVisible] = useState(false);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) {
      setContent('');
      setTimestamp('');
    }
  }

  const add = () => {
    if (!content.trim()) return;
    onAddNote(content, timestamp);
    setContent('');
    setTimestamp('');
  };

  const sortedNotes = resource ? [...resource.notes].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)) : [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        className="bg-black/60 justify-end"
      >
        <View className="bg-midnight rounded-t-3xl border-t border-hairline" style={{ maxHeight: '85%' }}>
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-hairline">
            <View className="flex-1 mr-3">
              <Text className="text-ink text-lg font-bold">Notes</Text>
              {resource ? (
                <Text className="text-ink-muted text-xs" numberOfLines={1}>
                  {resource.title}
                </Text>
              ) : null}
            </View>
            <Pressable onPress={onClose} hitSlop={8} className="p-1 active:opacity-60">
              <X size={22} color="#9ca3af" />
            </Pressable>
          </View>

          <View className="px-5 pt-4">
            <View className="flex-row mb-1.5">
              <Input
                placeholder="0:00"
                value={timestamp}
                onChangeText={setTimestamp}
                keyboardType="numbers-and-punctuation"
                className="w-20 mr-2"
              />
              <Input placeholder="Add a note…" value={content} onChangeText={setContent} className="flex-1 mr-2" />
              <Pressable
                onPress={add}
                disabled={!content.trim()}
                className={`items-center justify-center px-4 rounded-2xl ${
                  content.trim() ? 'bg-purple-600 active:opacity-80' : 'bg-midnight-lighter opacity-50'
                }`}
              >
                <Plus size={18} color="#fff" />
              </Pressable>
            </View>
            <Text className="text-ink-muted text-[11px] mb-3">Tip: add a timestamp (e.g. 5:30) to link a moment.</Text>
          </View>

          <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
            {sortedNotes.length === 0 ? (
              <View className="items-center py-10">
                <StickyNote size={32} color="#4b5563" />
                <Text className="text-ink-muted mt-2">No notes yet</Text>
              </View>
            ) : (
              sortedNotes.map((note) => (
                <View key={note.id} className="bg-midnight-light rounded-xl p-3 mb-2 border border-hairline">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 mr-2">
                      {note.timestamp !== undefined ? (
                        <View className="self-start mb-1">
                          <Badge label={formatDuration(note.timestamp)} tone="accent" />
                        </View>
                      ) : null}
                      <Text className="text-ink text-sm">{note.content}</Text>
                      <Text className="text-ink-muted text-xs mt-1">{formatDate(note.createdAt)}</Text>
                    </View>
                    <Pressable onPress={() => onDeleteNote(note.id)} hitSlop={8} className="p-1 active:opacity-60">
                      <Trash2 size={14} color="#9ca3af" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
