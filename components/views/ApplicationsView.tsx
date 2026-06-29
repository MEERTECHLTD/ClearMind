import React, { useState, useEffect, useMemo } from 'react';
import { Application, ApplicationContact, ApplicationRequirement, Workspace } from '../../types';
import { dbService, STORES } from '../../services/db';
import { workspaceService } from '../../services/workspaceService';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';
import {
  AppType,
  AppStatus,
  APPLICATION_TYPES,
  APPLICATION_STATUSES,
  APPLICATION_PRIORITIES,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_BOARD_ORDER,
  TYPE_COLOR,
  priorityValue,
  showGrantFields,
  showFunderField,
  applicationDeadline,
  isReminderEligible,
  isDeadlineSoon,
  relativeDeadline,
  REMINDER_PRESETS,
  reminderPresetKey,
  reminderDaysForKey,
  DEFAULT_REMINDER_LEAD_DAYS,
} from '@clearmind/shared/applications';
import {
  Plus, ExternalLink, Edit2, Trash2, X, Save, Calendar, Briefcase, GraduationCap,
  FileText, Check, Clock, XCircle, Send, FolderOpen, ArrowUpDown, Layers, Award,
  Search, Bell, Tag as TagIcon, Users, ListChecks, LayoutGrid, List, ChevronDown,
  ChevronRight, CircleDollarSign, Hash, Building2,
  Share2, Crown, UserPlus, Globe, Lock, Mail, Link2,
} from 'lucide-react';

const PREFS_KEY = 'application-preferences';

// Collision-resistant id (Date.now() alone collides on same-millisecond creates).
const newId = (): string =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Web icon maps (lucide-react components can't live in the platform-agnostic shared
// core). Colours/labels/options DO come from @clearmind/shared. Read-time fallbacks
// keep any legacy/out-of-union value from throwing.
const TYPE_ICON: Record<AppType, React.FC<{ size?: number; className?: string }>> = {
  job: Briefcase, grant: GraduationCap, scholarship: Award, other: FileText,
};
const STATUS_ICON: Record<AppStatus, React.FC<{ size?: number }>> = {
  draft: FileText, open: FolderOpen, submitted: Send, closed: Clock, accepted: Check, rejected: XCircle,
};
const PRIORITY_COLOR: Record<Application['priority'], string> = {
  High: '#f87171', Medium: '#fbbf24', Low: '#34d399',
};

type FormData = {
  name: string;
  link: string;
  type: AppType;
  status: AppStatus;
  priority: Application['priority'];
  openingDate: string;
  closingDate: string;
  submissionDeadline: string;
  submittedDate: string;
  notes: string;
  organization: string;
  funder: string;
  awardAmount: string;
  referenceNumber: string;
  reminderLeadDays: number[];
  tags: string[];
  contacts: ApplicationContact[];
  requirements: ApplicationRequirement[];
};

const emptyForm = (): FormData => ({
  name: '', link: '', type: 'job', status: 'draft', priority: 'Medium',
  openingDate: '', closingDate: '', submissionDeadline: '', submittedDate: '',
  notes: '', organization: '', funder: '', awardAmount: '', referenceNumber: '',
  reminderLeadDays: [...DEFAULT_REMINDER_LEAD_DAYS], tags: [], contacts: [], requirements: [],
});

// Clear all dedupe keys for an application so a changed deadline / lead-time re-arms.
const clearReminderKeys = (id: string): void => {
  try {
    const remove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(`app-notified-${id}-`) || k.startsWith(`app-deadline-${id}-`) || k === `app-deadline-today-${id}`)) {
        remove.push(k);
      }
    }
    remove.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
};

const formatDate = (dateStr?: string): string | null => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const ApplicationsView: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [filter, setFilter] = useState<'all' | AppType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AppStatus>('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Collaboration: shared workspaces (null active = personal local-first list).
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const activeWorkspace = activeWsId ? workspaces.find((w) => w.id === activeWsId) ?? null : null;

  const readPref = <T,>(key: string, fallback: T): T => {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) { try { return (JSON.parse(saved)[key] as T) ?? fallback; } catch { return fallback; } }
    return fallback;
  };
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'created' | 'name'>(() => readPref('sortBy', 'deadline'));
  const [groupBy, setGroupBy] = useState<'none' | 'type' | 'status' | 'priority'>(() => readPref('groupBy', 'none'));
  const [viewMode, setViewMode] = useState<'cards' | 'board'>(() => readPref('viewMode', 'cards'));

  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [showMoreDates, setShowMoreDates] = useState(false);

  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, groupBy, viewMode }));
  }, [sortBy, groupBy, viewMode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // Subscribe to the user's workspaces (owned + shared) once auth resolves, and
  // honour an incoming invite link (?joinWorkspace=<id>) by joining + opening it.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    const params = new URLSearchParams(window.location.search);
    let pendingJoin = params.get('joinWorkspace');
    if (pendingJoin) {
      params.delete('joinWorkspace');
      window.history.replaceState({}, '', window.location.pathname + (params.toString() ? `?${params}` : ''));
    }
    let unsubWs: (() => void) | null = null;
    const unsubAuth = firebaseService.onAuthChange(async (user) => {
      unsubWs?.();
      unsubWs = null;
      if (user?.email) {
        unsubWs = workspaceService.subscribe(setWorkspaces);
        if (pendingJoin) {
          const id = pendingJoin;
          pendingJoin = null;
          try {
            await workspaceService.join(id);
            setToast('Joined shared workspace');
          } catch (e) {
            console.warn('join workspace:', e); // already a member / denied — still try to open it
          }
          setActiveWsId(id);
        }
      } else {
        setWorkspaces([]);
        setActiveWsId(null);
        if (pendingJoin) setToast('Sign in with an email account to join the shared workspace');
      }
    });
    return () => {
      unsubAuth();
      unsubWs?.();
    };
  }, []);

  // If the active workspace is deleted or access is revoked, fall back to personal.
  useEffect(() => {
    if (activeWsId && !workspaces.some((w) => w.id === activeWsId)) setActiveWsId(null);
  }, [workspaces, activeWsId]);

  // Data source: personal (local-first) when no workspace is active; otherwise a
  // LIVE Firestore subscription to the shared workspace's applications.
  useEffect(() => {
    setIsLoading(true);
    if (activeWsId) {
      const unsub = workspaceService.subscribeApplications(activeWsId, (apps) => {
        setApplications(apps);
        setIsLoading(false);
      });
      return unsub;
    }
    let cancelled = false;
    const loadLocal = async () => {
      try {
        const data = await dbService.getAll<Application>(STORES.APPLICATIONS);
        if (!cancelled) setApplications(data);
      } catch (err) {
        console.error('Failed to load applications', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadLocal();
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'applications') loadLocal();
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('clearmind-sync', handleSync as EventListener);
    };
  }, [activeWsId]);

  const openAddModal = () => {
    setFormData(emptyForm());
    setShowMoreDates(false);
    setEditingApplication(null);
    setShowModal(true);
  };

  const openEditModal = (app: Application) => {
    setFormData({
      name: app.name,
      link: app.link || '',
      type: app.type,
      status: app.status,
      priority: app.priority || 'Medium',
      openingDate: app.openingDate || '',
      closingDate: app.closingDate || '',
      submissionDeadline: app.submissionDeadline || '',
      submittedDate: app.submittedDate || '',
      notes: app.notes || '',
      organization: app.organization || '',
      funder: app.funder || '',
      awardAmount: app.awardAmount || '',
      referenceNumber: app.referenceNumber || '',
      reminderLeadDays: app.reminderLeadDays ?? [...DEFAULT_REMINDER_LEAD_DAYS],
      tags: app.tags ? [...app.tags] : [],
      contacts: app.contacts ? app.contacts.map((c) => ({ ...c })) : [],
      requirements: app.requirements ? app.requirements.map((r) => ({ ...r })) : [],
    });
    setShowMoreDates(!!(app.closingDate || app.submittedDate || (app.type !== 'grant' && app.openingDate)));
    setEditingApplication(app);
    setShowModal(true);
  };

  // Trim empties so we never persist blank tags/contacts/requirements.
  const cleanForm = (): Partial<Application> => ({
    name: formData.name.trim(),
    link: formData.link.trim() || undefined,
    type: formData.type,
    status: formData.status,
    priority: formData.priority,
    openingDate: formData.openingDate || undefined,
    closingDate: formData.closingDate || undefined,
    submissionDeadline: formData.submissionDeadline || undefined,
    submittedDate: formData.submittedDate || undefined,
    notes: formData.notes.trim() || undefined,
    organization: formData.organization.trim() || undefined,
    funder: showFunderField(formData.type) ? (formData.funder.trim() || undefined) : undefined,
    awardAmount: showGrantFields(formData.type) ? (formData.awardAmount.trim() || undefined) : undefined,
    referenceNumber: showGrantFields(formData.type) ? (formData.referenceNumber.trim() || undefined) : undefined,
    reminderLeadDays: formData.reminderLeadDays,
    tags: formData.tags.length ? formData.tags : undefined,
    contacts: formData.contacts.filter((c) => c.name.trim()).length
      ? formData.contacts.filter((c) => c.name.trim())
      : undefined,
    requirements: formData.requirements.filter((r) => r.label.trim()).length
      ? formData.requirements.filter((r) => r.label.trim())
      : undefined,
  });

  // Persist to the active source: the personal local-first store, or — when a
  // shared workspace is active — the live Firestore workspace (onSnapshot also
  // reconciles, but we update optimistically for snappiness).
  const persistApp = async (app: Application, opts?: { rearm?: boolean }) => {
    if (activeWsId) {
      await workspaceService.putApplication(activeWsId, app);
    } else {
      if (opts?.rearm) clearReminderKeys(app.id);
      await dbService.put(STORES.APPLICATIONS, app);
    }
    setApplications((prev) =>
      prev.some((a) => a.id === app.id) ? prev.map((a) => (a.id === app.id ? app : a)) : [app, ...prev]
    );
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    const cleaned = cleanForm();
    try {
      if (editingApplication) {
        const updated: Application = { ...editingApplication, ...cleaned, updatedAt: new Date().toISOString() } as Application;
        // Re-arm reminders (personal only) if the deadline or lead-time ladder changed.
        const deadlineChanged = applicationDeadline(editingApplication) !== applicationDeadline(updated);
        const leadChanged = JSON.stringify(editingApplication.reminderLeadDays ?? null) !== JSON.stringify(updated.reminderLeadDays ?? null);
        await persistApp(updated, { rearm: deadlineChanged || leadChanged });
        setToast('Application updated');
      } else {
        const newApp: Application = { id: newId(), ...cleaned, createdAt: new Date().toISOString() } as Application;
        await persistApp(newApp);
        setToast(!activeWsId && isReminderEligible(newApp) ? 'Application added · reminder armed' : 'Application added');
      }
      setShowModal(false);
      setEditingApplication(null);
    } catch (e) {
      console.error('Save failed', e);
      setToast('Could not save — check your connection');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      if (activeWsId) {
        await workspaceService.deleteApplication(activeWsId, id);
      } else {
        clearReminderKeys(id);
        await dbService.delete(STORES.APPLICATIONS, id);
      }
      setApplications((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error('Delete failed', e);
      setToast('Could not delete — check your connection');
    }
  };

  // Inline status change from a card (advance through the pipeline without the modal).
  const changeStatus = async (app: Application, status: AppStatus) => {
    if (app.status === status) return;
    await persistApp({ ...app, status, updatedAt: new Date().toISOString() });
  };

  // ---- Workspace (collaboration) actions ----
  const handleCreateWorkspace = async (name: string, emails: string[], seed: boolean) => {
    // Seed with COPIES that get fresh ids — the shared workspace is fully independent
    // of your personal list, so editing/deleting in one never touches the other.
    const seedApps = seed
      ? (await dbService.getAll<Application>(STORES.APPLICATIONS)).map((a) => ({ ...a, id: newId() }))
      : [];
    const ws = await workspaceService.create(name, emails, seedApps);
    setShowNewWorkspace(false);
    setActiveWsId(ws.id);
    setToast(`Workspace “${ws.name}” created${emails.length ? ` · invited ${emails.length}` : ''}`);
  };

  const handleSetMembers = async (emails: string[]) => {
    if (!activeWorkspace) return;
    await workspaceService.setMembers(activeWorkspace, emails);
    setToast('Members updated');
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (!confirm(`Delete the shared workspace “${activeWorkspace.name}” for everyone? This cannot be undone.`)) return;
    const id = activeWorkspace.id;
    setActiveWsId(null);
    setShowMembers(false);
    await workspaceService.remove(id);
    setToast('Workspace deleted');
  };

  const copyInviteLink = async () => {
    if (!activeWorkspace) return;
    const link = workspaceService.inviteLink(activeWorkspace.id);
    try {
      await navigator.clipboard.writeText(link);
      setToast('Invite link copied — anyone you send it to can join');
    } catch {
      setToast(link); // clipboard blocked — surface the link so it can be copied manually
    }
  };

  const processedApplications = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = applications.filter((app) => {
      if (filter !== 'all' && app.type !== filter) return false;
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      if (q) {
        const haystack = [
          app.name, app.organization, app.funder, app.referenceNumber, app.notes,
          ...(app.tags || []),
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'deadline': {
          const dA = applicationDeadline(a) ? new Date(applicationDeadline(a)!).getTime() : Infinity;
          const dB = applicationDeadline(b) ? new Date(applicationDeadline(b)!).getTime() : Infinity;
          return dA - dB;
        }
        case 'priority':
          return priorityValue(b.priority) - priorityValue(a.priority);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });
    return filtered;
  }, [applications, filter, statusFilter, query, sortBy]);

  const groupedApplications = useMemo(() => {
    if (groupBy === 'none' || viewMode === 'board') return null;
    const groups: Record<string, Application[]> = {};
    processedApplications.forEach((app) => {
      let key: string;
      switch (groupBy) {
        case 'type': key = app.type.charAt(0).toUpperCase() + app.type.slice(1); break;
        case 'status': key = STATUS_LABEL[app.status] ?? app.status; break;
        case 'priority': key = `${app.priority || 'Medium'} Priority`; break;
        default: key = 'Other';
      }
      (groups[key] ||= []).push(app);
    });
    return groups;
  }, [processedApplications, groupBy, viewMode]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-gray-500 font-medium animate-pulse">Loading applications...</p>
      </div>
    );
  }

  const selectClass = 'bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500';
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'dark:border-gray-700 border-gray-300 text-gray-400 hover:text-gray-200'}`;
  const showWorkspaceBar = isFirebaseConfigured() && (workspaces.length > 0 || workspaceService.supported());

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Applications</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Track your job, grant, and scholarship applications.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
        >
          <Plus size={16} />
          New Application
        </button>
      </div>

      {/* Workspace switcher (collaboration) */}
      {showWorkspaceBar && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-xs text-gray-500 mr-1">Workspace</span>
          <button onClick={() => setActiveWsId(null)} className={chip(!activeWsId)}>
            <Lock size={12} /> My Applications
          </button>
          {workspaces.map((ws) => (
            <button key={ws.id} onClick={() => setActiveWsId(ws.id)} className={chip(activeWsId === ws.id)} title={ws.name}>
              <Users size={12} /> <span className="max-w-[140px] truncate">{ws.name}</span>
            </button>
          ))}
          <button
            onClick={() => setShowNewWorkspace(true)}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-dashed dark:border-gray-700 border-gray-300 text-gray-400 hover:text-blue-400 hover:border-blue-400 transition-colors"
          >
            <Share2 size={12} /> Share / New
          </button>
        </div>
      )}

      {/* Active workspace banner */}
      {activeWorkspace && (
        <div className="mb-5 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Share2 size={16} className="text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-semibold dark:text-white text-gray-900 flex items-center gap-2">
                {activeWorkspace.name}
                {workspaceService.isOwner(activeWorkspace) && (
                  <span className="text-[11px] text-amber-400 inline-flex items-center gap-1"><Crown size={11} /> owner</span>
                )}
                <span className="text-[11px] text-emerald-400 inline-flex items-center gap-1"><Globe size={11} /> live</span>
              </p>
              <p className="text-xs text-gray-500">
                {activeWorkspace.memberEmails.length} member{activeWorkspace.memberEmails.length !== 1 ? 's' : ''} · everyone can edit
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={copyInviteLink} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
              <Link2 size={13} /> Copy link
            </button>
            <button onClick={() => setShowMembers(true)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700">
              <Users size={13} /> Members
            </button>
            {workspaceService.isOwner(activeWorkspace) && (
              <button onClick={handleDeleteWorkspace} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10">
                <Trash2 size={13} /> Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search + view toggle */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, organization, funder, tags…"
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-midnight-light border dark:border-gray-700 border-gray-300 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="flex items-center rounded-lg border dark:border-gray-700 border-gray-300 overflow-hidden">
          <button
            onClick={() => setViewMode('cards')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${viewMode === 'cards' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            title="Card view"
          >
            <List size={15} /> Cards
          </button>
          <button
            onClick={() => setViewMode('board')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 ${viewMode === 'board' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            title="Board view (by stage)"
          >
            <LayoutGrid size={15} /> Board
          </button>
        </div>
      </div>

      {/* Filters and Sorting */}
      <div className="flex flex-wrap gap-4 mb-6 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Type:</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={selectClass}>
            <option value="all">All Types</option>
            {APPLICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        {viewMode === 'cards' && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Status:</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass}>
              <option value="all">All Statuses</option>
              {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        )}
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500">Sort:</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selectClass}>
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="created">Created Date</option>
            <option value="name">Name</option>
          </select>
        </div>
        {viewMode === 'cards' && (
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-gray-400" />
            <span className="text-sm text-gray-500">Group:</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className={selectClass}>
              <option value="none">No Grouping</option>
              <option value="type">By Type</option>
              <option value="status">By Status</option>
              <option value="priority">By Priority</option>
            </select>
          </div>
        )}
        <div className="text-sm text-gray-500 ml-auto">
          {processedApplications.length} application{processedApplications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* BOARD VIEW — pipeline columns by status */}
      {viewMode === 'board' ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_BOARD_ORDER.map((status) => {
            const colApps = processedApplications.filter((a) => a.status === status);
            return (
              <div key={status} className="flex-shrink-0 w-72">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                  <h3 className="text-sm font-semibold dark:text-white text-gray-900">{STATUS_LABEL[status]}</h3>
                  <span className="text-xs text-gray-500">({colApps.length})</span>
                </div>
                <div className="space-y-3">
                  {colApps.map((app) => <BoardCard key={app.id} app={app} onEdit={() => openEditModal(app)} />)}
                  {colApps.length === 0 && (
                    <div className="text-xs text-gray-600 border border-dashed dark:border-gray-800 border-gray-200 rounded-lg p-4 text-center">Nothing here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : groupedApplications ? (
        <div className="space-y-8">
          {Object.entries(groupedApplications).map(([groupName, apps]) => (
            <div key={groupName}>
              <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                {groupName}
                <span className="text-sm font-normal text-gray-500">({apps.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map(renderApplicationCard)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedApplications.map(renderApplicationCard)}
        </div>
      )}

      {processedApplications.length === 0 && viewMode === 'cards' && (
        <div className="text-center py-12 text-gray-500">
          <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
          <p>{query || filter !== 'all' || statusFilter !== 'all' ? 'No applications match your filters.' : 'No applications yet. Add your first application to track!'}</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && renderModal()}

      {/* Workspace modals */}
      {showNewWorkspace && (
        <NewWorkspaceModal
          supported={workspaceService.supported()}
          onCancel={() => setShowNewWorkspace(false)}
          onCreate={handleCreateWorkspace}
        />
      )}
      {showMembers && activeWorkspace && (
        <MembersModal
          workspace={activeWorkspace}
          isOwner={workspaceService.isOwner(activeWorkspace)}
          currentEmail={workspaceService.currentEmail()}
          onCancel={() => setShowMembers(false)}
          onSave={handleSetMembers}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}
    </div>
  );

  // ---------------- Card renderers ----------------

  function renderApplicationCard(app: Application) {
    const TypeIcon = TYPE_ICON[app.type] ?? FileText;
    const deadline = applicationDeadline(app);
    const soon = isDeadlineSoon(deadline);
    const armed = isReminderEligible(app) && (!Array.isArray(app.reminderLeadDays) || app.reminderLeadDays.length > 0);
    const reqDone = app.requirements?.filter((r) => r.done).length ?? 0;
    const reqTotal = app.requirements?.length ?? 0;

    return (
      <div key={app.id} className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 hover:border-gray-400 dark:hover:border-gray-700 transition-all group shadow-sm dark:shadow-none">
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            <TypeIcon size={16} />
            <span className="text-xs uppercase tracking-wider text-gray-500">{app.type}</span>
            {armed && <Bell size={12} className="text-blue-400" />}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => openEditModal(app)} className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100" title="Edit application">
              <Edit2 size={14} />
            </button>
            <button onClick={() => handleDelete(app.id)} className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Delete application">
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{app.name}</h3>
        {app.organization && <p className="text-sm text-gray-500 mb-1">{app.organization}</p>}
        {app.funder && <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Building2 size={11} /> Funder: {app.funder}</p>}

        <div className="flex items-center gap-2 mb-3 flex-wrap mt-2">
          <StatusPill status={app.status} />
          {app.priority && <PriorityPill priority={app.priority} />}
          {app.awardAmount && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <CircleDollarSign size={11} /> {app.awardAmount}
            </span>
          )}
        </div>

        {app.referenceNumber && (
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1"><Hash size={11} /> {app.referenceNumber}</p>
        )}

        <div className="space-y-2 text-xs text-gray-500 mb-4">
          {deadline && (
            <div className={`flex items-center gap-2 ${soon ? 'text-orange-500' : ''}`}>
              <Calendar size={12} />
              <span>Deadline: {formatDate(deadline)}</span>
              <span className={soon ? 'text-orange-500 font-medium' : 'text-gray-500'}>· {relativeDeadline(deadline)}</span>
            </div>
          )}
          {app.openingDate && (
            <div className="flex items-center gap-2"><Clock size={12} /><span>Opens: {formatDate(app.openingDate)}</span></div>
          )}
          {app.submittedDate && (
            <div className="flex items-center gap-2 text-green-500"><Send size={12} /><span>Submitted: {formatDate(app.submittedDate)}</span></div>
          )}
        </div>

        {reqTotal > 0 && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span className="flex items-center gap-1"><ListChecks size={12} /> Requirements</span>
              <span>{reqDone}/{reqTotal}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-700/40 overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${reqTotal ? (reqDone / reqTotal) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {app.tags && app.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {app.tags.map((t) => (
              <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 flex items-center gap-1"><TagIcon size={10} />{t}</span>
            ))}
          </div>
        )}

        {app.contacts && app.contacts.length > 0 && (
          <p className="text-xs text-gray-500 mb-3 flex items-center gap-1"><Users size={11} /> {app.contacts.map((c) => c.name).join(', ')}</p>
        )}

        {app.notes && <p className="text-sm text-gray-400 line-clamp-2 mb-4">{app.notes}</p>}

        <div className="flex items-center justify-between gap-2">
          {app.link ? (
            <a href={app.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors">
              <ExternalLink size={14} /> Open
            </a>
          ) : <span />}
          {/* Quick status change */}
          <select
            value={app.status}
            onChange={(e) => changeStatus(app, e.target.value as AppStatus)}
            className="text-xs bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-2 py-1 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
            title="Change status"
          >
            {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
    );
  }

  // ---------------- Modal ----------------

  function renderModal() {
    const grant = showGrantFields(formData.type);
    const funder = showFunderField(formData.type);
    const hasDeadline = !!(formData.submissionDeadline || formData.closingDate);

    const addTag = (raw: string) => {
      const t = raw.trim();
      if (t && !formData.tags.includes(t)) setFormData({ ...formData, tags: [...formData.tags, t] });
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold dark:text-white text-gray-900">{editingApplication ? 'Edit Application' : 'New Application'}</h3>
            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={24} /></button>
          </div>

          <div className="space-y-4">
            {/* Identity first */}
            <Field label="Application Name *">
              <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Software Engineer at Google" className={inputClass} autoFocus />
            </Field>
            <Field label="Organization">
              <input type="text" value={formData.organization} onChange={(e) => setFormData({ ...formData, organization: e.target.value })} placeholder="Company or host organization" className={inputClass} />
            </Field>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Type">
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as AppType })} className={inputClass}>
                  {APPLICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as AppStatus })} className={inputClass}>
                  {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as Application['priority'] })} className={inputClass}>
                  {APPLICATION_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            {/* Grant identity: opening date right under the type for grants */}
            {grant && (
              <Field label="Opening Date">
                <input type="date" value={formData.openingDate} onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })} className={inputClass} />
              </Field>
            )}

            {/* Type-specific detail block */}
            {grant && (
              <div className="rounded-lg border dark:border-gray-700 border-gray-200 p-4 space-y-4">
                <p className="text-xs uppercase tracking-wider text-gray-500 flex items-center gap-1"><GraduationCap size={13} /> {formData.type === 'grant' ? 'Grant details' : 'Scholarship details'}</p>
                {funder && (
                  <Field label="Funder / Awarding Body">
                    <input type="text" value={formData.funder} onChange={(e) => setFormData({ ...formData, funder: e.target.value })} placeholder="e.g. NSF, Gates Foundation" className={inputClass} />
                  </Field>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Award Amount">
                    <input type="text" value={formData.awardAmount} onChange={(e) => setFormData({ ...formData, awardAmount: e.target.value })} placeholder="$50,000" className={inputClass} />
                  </Field>
                  <Field label="Reference No.">
                    <input type="text" value={formData.referenceNumber} onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })} placeholder="NSF-2026-1187" className={inputClass} />
                  </Field>
                </div>
              </div>
            )}

            <Field label="Application Link">
              <input type="url" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })} placeholder="https://..." className={inputClass} />
            </Field>

            {/* Deadline + reminder (always visible — reminders hinge on this) */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Submission Deadline">
                <input type="date" value={formData.submissionDeadline} onChange={(e) => setFormData({ ...formData, submissionDeadline: e.target.value })} className={inputClass} />
              </Field>
              <Field label="Remind Me">
                <select
                  value={reminderPresetKey(formData.reminderLeadDays)}
                  onChange={(e) => setFormData({ ...formData, reminderLeadDays: reminderDaysForKey(e.target.value) })}
                  disabled={!hasDeadline}
                  className={`${inputClass} ${!hasDeadline ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={hasDeadline ? 'When to alert before the deadline' : 'Set a deadline first'}
                >
                  {REMINDER_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </Field>
            </div>

            {/* More dates (collapsed) */}
            <button type="button" onClick={() => setShowMoreDates((v) => !v)} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-400">
              {showMoreDates ? <ChevronDown size={15} /> : <ChevronRight size={15} />} More dates
            </button>
            {showMoreDates && (
              <div className="grid grid-cols-2 gap-4">
                {!grant && (
                  <Field label="Opening Date">
                    <input type="date" value={formData.openingDate} onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })} className={inputClass} />
                  </Field>
                )}
                <Field label="Closing Date">
                  <input type="date" value={formData.closingDate} onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })} className={inputClass} />
                </Field>
                <Field label="Submitted Date">
                  <input type="date" value={formData.submittedDate} onChange={(e) => setFormData({ ...formData, submittedDate: e.target.value })} className={inputClass} />
                </Field>
              </div>
            )}

            {/* Tags */}
            <Field label="Tags">
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 flex items-center gap-1">
                    {t}
                    <button onClick={() => setFormData({ ...formData, tags: formData.tags.filter((x) => x !== t) })} className="hover:text-white"><X size={11} /></button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                placeholder="Type a tag and press Enter"
                className={inputClass}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </Field>

            {/* Requirements checklist */}
            <Field label="Requirements / Documents">
              <div className="space-y-2">
                {formData.requirements.map((r, i) => (
                  <div key={r.id} className="flex items-center gap-2">
                    <button onClick={() => updateReq(i, { done: !r.done })} className="text-gray-400 hover:text-blue-500">
                      {r.done ? <Check size={16} className="text-emerald-500" /> : <span className="inline-block w-4 h-4 rounded border dark:border-gray-600 border-gray-400" />}
                    </button>
                    <input type="text" value={r.label} onChange={(e) => updateReq(i, { label: e.target.value })} placeholder="e.g. CV, cover letter…" className={`${inputClass} py-2 ${r.done ? 'line-through text-gray-500' : ''}`} />
                    <button onClick={() => setFormData({ ...formData, requirements: formData.requirements.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => setFormData({ ...formData, requirements: [...formData.requirements, { id: newId(), label: '', done: false }] })} className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1"><Plus size={14} /> Add requirement</button>
              </div>
            </Field>

            {/* Contacts */}
            <Field label="Contacts">
              <div className="space-y-2">
                {formData.contacts.map((c, i) => (
                  <div key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                    <input type="text" value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} placeholder="Name" className={`${inputClass} py-2`} />
                    <input type="text" value={c.email || ''} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="Email / role" className={`${inputClass} py-2`} />
                    <button onClick={() => setFormData({ ...formData, contacts: formData.contacts.filter((_, j) => j !== i) })} className="text-gray-400 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                ))}
                <button onClick={() => setFormData({ ...formData, contacts: [...formData.contacts, { id: newId(), name: '' }] })} className="text-sm text-blue-500 hover:text-blue-400 flex items-center gap-1"><Plus size={14} /> Add contact</button>
              </div>
            </Field>

            <Field label="Notes">
              <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes about this application..." rows={3} className={`${inputClass} resize-none`} />
            </Field>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={handleSave} disabled={!formData.name.trim()} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
              <Save size={18} /> {editingApplication ? 'Update' : 'Create'}
            </button>
            <button onClick={() => setShowModal(false)} className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  function updateReq(i: number, patch: Partial<ApplicationRequirement>) {
    setFormData((prev) => ({ ...prev, requirements: prev.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }
  function updateContact(i: number, patch: Partial<ApplicationContact>) {
    setFormData((prev) => ({ ...prev, contacts: prev.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  }
};

const inputClass = 'w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="block text-sm text-gray-500 mb-1">{label}</label>
    {children}
  </div>
);

const StatusPill: React.FC<{ status: AppStatus }> = ({ status }) => {
  const color = STATUS_COLOR[status] ?? '#9ca3af';
  const Icon = STATUS_ICON[status] ?? FileText;
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border" style={{ color, backgroundColor: `${color}22`, borderColor: `${color}55` }}>
      <Icon size={12} />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
};

const PriorityPill: React.FC<{ priority: Application['priority'] }> = ({ priority }) => {
  const color = PRIORITY_COLOR[priority] ?? '#9ca3af';
  return (
    <span className="inline-flex items-center text-xs px-2 py-0.5 rounded border" style={{ color, backgroundColor: `${color}22`, borderColor: `${color}55` }}>
      {priority}
    </span>
  );
};

const BoardCard: React.FC<{ app: Application; onEdit: () => void }> = ({ app, onEdit }) => {
  const TypeIcon = TYPE_ICON[app.type] ?? FileText;
  const deadline = applicationDeadline(app);
  const soon = isDeadlineSoon(deadline);
  return (
    <div onClick={onEdit} className="cursor-pointer dark:bg-midnight bg-white border dark:border-gray-800 border-gray-200 rounded-lg p-3 hover:border-blue-500/50 transition-colors">
      <div className="flex items-center gap-1.5 mb-1.5 text-gray-500">
        <TypeIcon size={12} />
        <span className="text-[10px] uppercase tracking-wider">{app.type}</span>
        {app.priority && <span className="ml-auto"><PriorityPill priority={app.priority} /></span>}
      </div>
      <p className="text-sm font-medium dark:text-white text-gray-900 leading-snug">{app.name}</p>
      {app.organization && <p className="text-xs text-gray-500 mt-0.5">{app.organization}</p>}
      {deadline && (
        <p className={`text-xs mt-2 flex items-center gap-1 ${soon ? 'text-orange-500' : 'text-gray-500'}`}>
          <Calendar size={11} /> {relativeDeadline(deadline)}
        </p>
      )}
    </div>
  );
};

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const NewWorkspaceModal: React.FC<{
  supported: boolean;
  onCancel: () => void;
  onCreate: (name: string, emails: string[], seed: boolean) => Promise<void>;
}> = ({ supported, onCancel, onCreate }) => {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [seed, setSeed] = useState(true);
  const [personalCount, setPersonalCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dbService.getAll<Application>(STORES.APPLICATIONS).then((a) => setPersonalCount(a.length)).catch(() => {});
  }, []);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && !emails.includes(e)) setEmails([...emails, e]);
  };
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), emails, seed);
    } catch (e: any) {
      setError(e?.message || 'Could not create workspace');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold dark:text-white text-gray-900 flex items-center gap-2"><Share2 size={18} className="text-blue-400" /> Share a workspace</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={22} /></button>
        </div>

        {!supported ? (
          <div className="text-sm text-gray-400 space-y-4">
            <p>Sign in with an email or Google account to create a shared workspace others can join and collaborate in.</p>
            <button onClick={onCancel} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium">Got it</button>
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Workspace name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grants 2026" autoFocus />
            </Field>
            <Field label="Invite by email (optional)">
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {emails.map((e) => (
                    <span key={e} className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 flex items-center gap-1">
                      <Mail size={10} /> {e}
                      <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="hover:text-white"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className={inputClass}
                placeholder="name@example.com — press Enter"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">They'll see this workspace next time they open ClearMind signed in with that email.</p>
            </Field>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300 text-gray-700 cursor-pointer">
              <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="accent-blue-600" />
              Copy my {personalCount} current application{personalCount !== 1 ? 's' : ''} into it
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button onClick={submit} disabled={!name.trim() || busy} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                <Share2 size={16} /> {busy ? 'Creating…' : 'Create & share'}
              </button>
              <button onClick={onCancel} className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MembersModal: React.FC<{
  workspace: Workspace;
  isOwner: boolean;
  currentEmail: string | null;
  onCancel: () => void;
  onSave: (emails: string[]) => Promise<void>;
}> = ({ workspace, isOwner, currentEmail, onCancel, onSave }) => {
  const [invitees, setInvitees] = useState<string[]>(workspace.memberEmails.filter((e) => e !== workspace.ownerEmail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && e !== workspace.ownerEmail && !invitees.includes(e)) setInvitees([...invitees, e]);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(invitees);
      onCancel();
    } catch (e: any) {
      setError(e?.message || 'Could not update members');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold dark:text-white text-gray-900 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Members</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white"><X size={22} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{workspace.name} · everyone listed can view and edit every application.</p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm dark:text-white text-gray-900 px-3 py-2 rounded-lg dark:bg-gray-800/60 bg-gray-100">
            <span className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {workspace.ownerEmail}</span>
            <span className="text-[11px] text-amber-400 inline-flex items-center gap-1"><Crown size={11} /> owner{currentEmail === workspace.ownerEmail ? ' · you' : ''}</span>
          </div>
          {invitees.map((e) => (
            <div key={e} className="flex items-center justify-between text-sm dark:text-white text-gray-900 px-3 py-2 rounded-lg dark:bg-gray-800/40 bg-gray-50">
              <span className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {e}{currentEmail === e ? ' · you' : ''}</span>
              {isOwner && (
                <button onClick={() => setInvitees(invitees.filter((x) => x !== e))} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {isOwner ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={15} className="text-gray-400" />
              <input
                className={`${inputClass} py-2`}
                placeholder="Invite by email — press Enter"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button onClick={save} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium">{busy ? 'Saving…' : 'Save members'}</button>
              <button onClick={onCancel} className="px-4 py-2.5 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Cancel</button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Only the owner can change who's in this workspace.</p>
            <button onClick={onCancel} className="w-full dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 px-4 py-2.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Close</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApplicationsView;
