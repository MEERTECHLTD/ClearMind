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
  Plus, ExternalLink, Pencil, Trash2, X, Save, Calendar, Briefcase, GraduationCap,
  FileText, Check, Clock, XCircle, Send, FolderOpen, ArrowUpDown, Layers, Award,
  Search, Bell, Tag as TagIcon, Users, ListChecks, ChevronDown, ListPlus, Flag,
  ChevronRight, CircleDollarSign, Hash, Building2,
  Share2, Crown, UserPlus, Globe, Lock, Mail, Link2,
} from 'lucide-react';
import {
  FullPage, Card, Segmented, PageLoading, Empty, Modal, ModalBody, ModalFooter, Field, IconBtn,
  Badge, ProgressBar, inputCls, cx, useTaskToast, useCreateLinkedTask,
} from '../ui-kit';

const PREFS_KEY = 'application-preferences';

// A displayed application carries its ORIGIN (__wsId) so writes route to the right
// place (a shared workspace vs the personal store) regardless of the current
// selection — a deleted shared item can never touch the identically-named personal one.
type ViewApp = Application & { __wsId?: string };

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
  const [applications, setApplications] = useState<ViewApp[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [filter, setFilter] = useState<'all' | AppType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AppStatus>('all');
  const [query, setQuery] = useState('');
  // Shared app toast (same as the task views). Kept under the old name so every
  // existing call site reads unchanged.
  const showToast = useTaskToast();
  const setToast = (m: string | null) => { if (m) showToast(m); };
  const createLinkedTask = useCreateLinkedTask();
  // Synergy: a real task to prepare this application, due on its deadline.
  const addPrepTask = (app: Application) =>
    createLinkedTask({ title: `Prepare: ${app.name}`, dueDate: applicationDeadline(app) ?? null });

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

  // Data source: personal (local-first) when no workspace is active; otherwise a
  // LIVE Firestore subscription to the shared workspace's applications. Each item is
  // tagged with its origin (__wsId). NOTE: we deliberately do NOT auto-reset
  // activeWsId when it's missing from the (async) workspaces list — that raced with
  // create/join and silently dropped you back to the personal list. Access loss is
  // detected precisely via the subscription's error callback below instead.
  useEffect(() => {
    setIsLoading(true);
    if (activeWsId) {
      const wsId = activeWsId;
      const unsub = workspaceService.subscribeApplications(
        wsId,
        (apps) => {
          setApplications(apps.map((a) => ({ ...a, __wsId: wsId })));
          setIsLoading(false);
        },
        () => {
          // Access lost (workspace deleted / removed as a member) — return to personal.
          setActiveWsId(null);
          setToast('That shared workspace is no longer available');
        }
      );
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
  // Writes route to an EXPLICIT target (a workspace id, or null for personal) — never
  // an ambiguous "current selection". The view-only __wsId tag is stripped before persisting.
  const persistApp = async (app: Application, opts: { wsId: string | null; rearm?: boolean }) => {
    const { __wsId, ...clean } = app as ViewApp;
    if (opts.wsId) {
      await workspaceService.putApplication(opts.wsId, clean);
    } else {
      if (opts.rearm) clearReminderKeys(clean.id);
      await dbService.put(STORES.APPLICATIONS, clean);
    }
    const tagged: ViewApp = { ...clean, __wsId: opts.wsId ?? undefined };
    setApplications((prev) =>
      prev.some((a) => a.id === clean.id) ? prev.map((a) => (a.id === clean.id ? tagged : a)) : [tagged, ...prev]
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
        await persistApp(updated, { wsId: (editingApplication as ViewApp).__wsId ?? null, rearm: deadlineChanged || leadChanged });
        setToast('Application updated');
      } else {
        const newApp: Application = { id: newId(), ...cleaned, createdAt: new Date().toISOString() } as Application;
        await persistApp(newApp, { wsId: activeWsId });
        setToast(!activeWsId && isReminderEligible(newApp) ? 'Application added · reminder armed' : 'Application added');
      }
      setShowModal(false);
      setEditingApplication(null);
    } catch (e) {
      console.error('Save failed', e);
      setToast('Could not save — check your connection');
    }
  };

  // Delete routes by the ITEM's origin (__wsId), not the current selection — so a
  // shared-workspace delete can never remove the personal copy, even mid-state-change.
  const handleDelete = async (app: ViewApp) => {
    if (!confirm('Are you sure you want to delete this application?')) return;
    try {
      if (app.__wsId) {
        await workspaceService.deleteApplication(app.__wsId, app.id);
      } else {
        clearReminderKeys(app.id);
        await dbService.delete(STORES.APPLICATIONS, app.id);
      }
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
    } catch (e) {
      console.error('Delete failed', e);
      setToast('Could not delete — check your connection');
    }
  };

  // Inline status change from a card (advance through the pipeline without the modal).
  const changeStatus = async (app: ViewApp, status: AppStatus) => {
    if (app.status === status) return;
    await persistApp({ ...app, status, updatedAt: new Date().toISOString() }, { wsId: app.__wsId ?? null });
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

  if (isLoading) return <PageLoading />;

  const selectClass = `${cx.input} !py-1.5`;
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border transition-colors ${active ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' : `${cx.border} ${cx.muted} ${cx.hover}`}`;
  const showWorkspaceBar = isFirebaseConfigured() && (workspaces.length > 0 || workspaceService.supported());
  const filtered = !!(query || filter !== 'all' || statusFilter !== 'all');

  return (
    <FullPage
      title="Applications"
      subtitle="Track your job, grant, and scholarship applications."
      actions={
        <button onClick={openAddModal} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
          <Plus size={16} /> New application
        </button>
      }
    >
      {/* Workspace switcher (collaboration) */}
      {showWorkspaceBar && (
        <div className="flex items-center gap-2 mb-4 flex-wrap" role="group" aria-label="Workspace">
          <span className={`text-xs mr-1 ${cx.muted}`}>Workspace</span>
          <button onClick={() => setActiveWsId(null)} className={chip(!activeWsId)} aria-pressed={!activeWsId}>
            <Lock size={12} /> My Applications
          </button>
          {workspaces.map((ws) => (
            <button key={ws.id} onClick={() => setActiveWsId(ws.id)} className={chip(activeWsId === ws.id)} aria-pressed={activeWsId === ws.id} title={ws.name}>
              <Users size={12} /> <span className="max-w-[140px] truncate">{ws.name}</span>
            </button>
          ))}
          <button
            onClick={() => setShowNewWorkspace(true)}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-dashed ${cx.border} ${cx.muted} hover:text-blue-600 dark:hover:text-blue-400`}
          >
            <Share2 size={12} /> Share / New
          </button>
        </div>
      )}

      {/* Active workspace banner */}
      {activeWorkspace && (
        <Card className="mb-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <Share2 size={16} className="text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className={`text-sm font-semibold flex items-center gap-2 ${cx.text}`}>
                  {activeWorkspace.name}
                  {workspaceService.isOwner(activeWorkspace) && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><Crown size={11} /> owner</span>
                  )}
                  <span className="text-[11px] text-green-600 dark:text-green-400 inline-flex items-center gap-1"><Globe size={11} /> live</span>
                </p>
                <p className={`text-xs ${cx.muted}`}>
                  {activeWorkspace.memberEmails.length} member{activeWorkspace.memberEmails.length !== 1 ? 's' : ''} · everyone can edit
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copyInviteLink} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
                <Link2 size={16} /> Copy link
              </button>
              <button onClick={() => setShowMembers(true)} className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}>
                <Users size={16} /> Members
              </button>
              {workspaceService.isOwner(activeWorkspace) && (
                <button onClick={handleDeleteWorkspace} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
                  <Trash2 size={16} /> Delete
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Search + view toggle */}
      <div className="flex flex-wrap gap-3 mb-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${cx.faint}`} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, organization, funder, tags…"
            aria-label="Search applications"
            className={`${inputCls} pl-9`}
          />
        </div>
        <Segmented
          label="Layout"
          value={viewMode}
          onChange={setViewMode}
          options={[{ value: 'cards', label: 'Cards' }, { value: 'board', label: 'Board' }]}
        />
      </div>

      {/* Filters and Sorting */}
      <div className={`flex flex-wrap gap-x-4 gap-y-2 mb-5 items-center text-sm ${cx.muted}`}>
        <label className="flex items-center gap-2">
          <span>Type</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={selectClass}>
            <option value="all">All Types</option>
            {APPLICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        {viewMode === 'cards' && (
          <label className="flex items-center gap-2">
            <span>Status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className={selectClass}>
              <option value="all">All Statuses</option>
              {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          <ArrowUpDown size={16} className={cx.faint} aria-hidden />
          <span>Sort</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className={selectClass}>
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="created">Created Date</option>
            <option value="name">Name</option>
          </select>
        </label>
        {viewMode === 'cards' && (
          <label className="flex items-center gap-2">
            <Layers size={16} className={cx.faint} aria-hidden />
            <span>Group</span>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className={selectClass}>
              <option value="none">No Grouping</option>
              <option value="type">By Type</option>
              <option value="status">By Status</option>
              <option value="priority">By Priority</option>
            </select>
          </label>
        )}
        <div className="ml-auto text-xs">
          {processedApplications.length} application{processedApplications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* BOARD VIEW — pipeline columns by status */}
      {viewMode === 'board' ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUS_BOARD_ORDER.map((status) => {
            const colApps = processedApplications.filter((a) => a.status === status);
            return (
              <section key={status} className="flex-shrink-0 w-72 rounded-xl bg-gray-50 dark:bg-white/[0.03] p-2" aria-label={STATUS_LABEL[status]}>
                <div className="flex items-center gap-2 px-1 pb-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLOR[status] }} />
                  <h3 className={`text-sm font-semibold ${cx.text}`}>{STATUS_LABEL[status]}</h3>
                  <span className={`text-xs ${cx.muted}`}>{colApps.length}</span>
                </div>
                <div className="space-y-2">
                  {colApps.map((app) => <BoardCard key={app.id} app={app} onEdit={() => openEditModal(app)} />)}
                  {colApps.length === 0 && (
                    <div className={`text-xs ${cx.faint} border border-dashed ${cx.border} rounded-lg p-4 text-center`}>Nothing here</div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : groupedApplications ? (
        <div className="space-y-6">
          {Object.entries(groupedApplications).map(([groupName, apps]) => (
            <section key={groupName}>
              <div className={`flex items-baseline gap-2 pb-1.5 mb-3 border-b ${cx.border}`}>
                <h3 className={`text-sm font-bold ${cx.text}`}>{groupName}</h3>
                <span className={`text-xs ${cx.muted}`}>{apps.length}</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {apps.map(renderApplicationCard)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {processedApplications.map(renderApplicationCard)}
        </div>
      )}

      {processedApplications.length === 0 && viewMode === 'cards' && (
        filtered ? (
          <Empty icon={<Search size={30} className={cx.muted} />} title="No matching applications" subtitle="No applications match your filters." />
        ) : (
          <Empty icon={<Briefcase size={30} className="text-blue-500" />} title="No applications yet" subtitle="Add your first job, grant or scholarship to track deadlines, requirements and contacts." />
        )
      )}

      {/* Add/Edit Modal */}
      {renderModal()}

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
    </FullPage>
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
      <article key={app.id} className={`group rounded-xl border ${cx.border} ${cx.card} p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors flex flex-col`}>
        <div className="flex justify-between items-center mb-2">
          <div className={`flex items-center gap-1.5 ${cx.muted}`}>
            <TypeIcon size={16} />
            <span className="text-xs font-medium capitalize">{app.type}</span>
            {armed && <span title="Deadline reminder armed" aria-label="Deadline reminder armed" className="text-blue-500 inline-flex"><Bell size={12} /></span>}
          </div>
          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
            <IconBtn label={`Add task: Prepare ${app.name}`} onClick={() => addPrepTask(app)}><ListPlus size={16} /></IconBtn>
            <IconBtn label="Edit application" onClick={() => openEditModal(app)}><Pencil size={16} /></IconBtn>
            <IconBtn label="Delete application" danger onClick={() => handleDelete(app)}><Trash2 size={16} /></IconBtn>
          </div>
        </div>

        <h3 className={`text-base font-semibold leading-snug ${cx.text}`}>{app.name}</h3>
        {app.organization && <p className={`text-sm ${cx.muted}`}>{app.organization}</p>}
        {app.funder && <p className={`text-xs mt-0.5 flex items-center gap-1 ${cx.muted}`}><Building2 size={12} /> Funder: {app.funder}</p>}

        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          <StatusPill status={app.status} />
          {app.priority && <PriorityPill priority={app.priority} />}
          {app.awardAmount && <Badge color="#16A34A"><CircleDollarSign size={12} /> {app.awardAmount}</Badge>}
        </div>

        {app.referenceNumber && (
          <p className={`text-xs mt-2 flex items-center gap-1 ${cx.muted}`}><Hash size={12} /> {app.referenceNumber}</p>
        )}

        {(deadline || app.openingDate || app.submittedDate) && (
          <div className={`space-y-1 text-xs mt-3 ${cx.muted}`}>
            {deadline && (
              <div className={`flex items-center gap-1.5 ${soon ? 'text-orange-600 dark:text-orange-400' : ''}`}>
                <Calendar size={12} />
                <span>Deadline: {formatDate(deadline)}</span>
                <span className={soon ? 'font-medium' : ''}>· {relativeDeadline(deadline)}</span>
              </div>
            )}
            {app.openingDate && (
              <div className="flex items-center gap-1.5"><Clock size={12} /><span>Opens: {formatDate(app.openingDate)}</span></div>
            )}
            {app.submittedDate && (
              <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400"><Send size={12} /><span>Submitted: {formatDate(app.submittedDate)}</span></div>
            )}
          </div>
        )}

        {reqTotal > 0 && (
          <div className="mt-3">
            <div className={`flex items-center justify-between text-xs mb-1 ${cx.muted}`}>
              <span className="flex items-center gap-1"><ListChecks size={12} /> Requirements</span>
              <span className="tabular-nums">{reqDone}/{reqTotal}</span>
            </div>
            <ProgressBar value={reqDone} max={reqTotal} label="Requirements done" />
          </div>
        )}

        {app.tags && app.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {app.tags.map((t) => <Badge key={t}><TagIcon size={11} />{t}</Badge>)}
          </div>
        )}

        {app.contacts && app.contacts.length > 0 && (
          <p className={`text-xs mt-3 flex items-center gap-1 ${cx.muted}`}><Users size={12} /> {app.contacts.map((c) => c.name).join(', ')}</p>
        )}

        {app.notes && <p className={`text-sm line-clamp-2 mt-3 ${cx.muted}`}>{app.notes}</p>}

        <div className="flex items-center justify-between gap-2 mt-auto pt-3">
          {app.link ? (
            <a href={app.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              <ExternalLink size={14} /> Open
            </a>
          ) : <span />}
          {/* Quick status change */}
          <select
            value={app.status}
            onChange={(e) => changeStatus(app, e.target.value as AppStatus)}
            className={`${cx.input} !py-1 !px-2 !text-xs`}
            title="Change status"
            aria-label={`Status of ${app.name}`}
          >
            {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </article>
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
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingApplication ? 'Edit application' : 'New application'}>
        <ModalBody>
          {/* Identity first */}
          <Field label="Application name *">
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Software Engineer at Google" className={inputCls} autoFocus />
          </Field>
          <Field label="Organization">
            <input type="text" value={formData.organization} onChange={(e) => setFormData({ ...formData, organization: e.target.value })} placeholder="Company or host organization" className={inputCls} />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Type">
              <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value as AppType })} className={inputCls}>
                {APPLICATION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value as AppStatus })} className={inputCls}>
                {APPLICATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as Application['priority'] })} className={inputCls}>
                {APPLICATION_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          {/* Grant identity: opening date right under the type for grants */}
          {grant && (
            <Field label="Opening date">
              <input type="date" value={formData.openingDate} onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })} className={inputCls} />
            </Field>
          )}

          {/* Type-specific detail block */}
          {grant && (
            <div className={`rounded-lg border ${cx.border} p-3 space-y-3`}>
              <p className={`text-xs font-semibold flex items-center gap-1.5 ${cx.muted}`}><GraduationCap size={14} /> {formData.type === 'grant' ? 'Grant details' : 'Scholarship details'}</p>
              {funder && (
                <Field label="Funder / awarding body">
                  <input type="text" value={formData.funder} onChange={(e) => setFormData({ ...formData, funder: e.target.value })} placeholder="e.g. NSF, Gates Foundation" className={inputCls} />
                </Field>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Award amount">
                  <input type="text" value={formData.awardAmount} onChange={(e) => setFormData({ ...formData, awardAmount: e.target.value })} placeholder="$50,000" className={inputCls} />
                </Field>
                <Field label="Reference no.">
                  <input type="text" value={formData.referenceNumber} onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })} placeholder="NSF-2026-1187" className={inputCls} />
                </Field>
              </div>
            </div>
          )}

          <Field label="Application link">
            <input type="url" value={formData.link} onChange={(e) => setFormData({ ...formData, link: e.target.value })} placeholder="https://..." className={inputCls} />
          </Field>

          {/* Deadline + reminder (always visible — reminders hinge on this) */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Submission deadline">
              <input type="date" value={formData.submissionDeadline} onChange={(e) => setFormData({ ...formData, submissionDeadline: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Remind me">
              <select
                value={reminderPresetKey(formData.reminderLeadDays)}
                onChange={(e) => setFormData({ ...formData, reminderLeadDays: reminderDaysForKey(e.target.value) })}
                disabled={!hasDeadline}
                className={`${inputCls} ${!hasDeadline ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={hasDeadline ? 'When to alert before the deadline' : 'Set a deadline first'}
              >
                {REMINDER_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </Field>
          </div>

          {/* More dates (collapsed) */}
          <button type="button" onClick={() => setShowMoreDates((v) => !v)} aria-expanded={showMoreDates} className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {showMoreDates ? <ChevronDown size={16} /> : <ChevronRight size={16} />} More dates
          </button>
          {showMoreDates && (
            <div className="grid grid-cols-2 gap-3">
              {!grant && (
                <Field label="Opening date">
                  <input type="date" value={formData.openingDate} onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })} className={inputCls} />
                </Field>
              )}
              <Field label="Closing date">
                <input type="date" value={formData.closingDate} onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Submitted date">
                <input type="date" value={formData.submittedDate} onChange={(e) => setFormData({ ...formData, submittedDate: e.target.value })} className={inputCls} />
              </Field>
            </div>
          )}

          {/* Tags */}
          <Group label="Tags">
            {formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formData.tags.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                    {t}
                    <button type="button" onClick={() => setFormData({ ...formData, tags: formData.tags.filter((x) => x !== t) })} className="hover:text-blue-900 dark:hover:text-white" aria-label={`Remove tag ${t}`} title={`Remove tag ${t}`}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              placeholder="Type a tag and press Enter"
              aria-label="Add tag"
              className={inputCls}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  addTag((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = '';
                }
              }}
            />
          </Group>

          {/* Requirements checklist */}
          <Group label="Requirements / documents">
            <div className="space-y-2">
              {formData.requirements.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateReq(i, { done: !r.done })}
                    role="checkbox"
                    aria-checked={r.done}
                    aria-label={r.label ? `Done: ${r.label}` : 'Done'}
                    title={r.done ? 'Mark as not done' : 'Mark as done'}
                    className={`shrink-0 w-[18px] h-[18px] rounded flex items-center justify-center border-2 transition-colors ${r.done ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'}`}
                  >
                    {r.done ? <Check size={12} strokeWidth={3} /> : null}
                  </button>
                  <input type="text" value={r.label} onChange={(e) => updateReq(i, { label: e.target.value })} placeholder="e.g. CV, cover letter…" aria-label="Requirement" className={`${inputCls} ${r.done ? 'line-through !text-gray-400' : ''}`} />
                  <IconBtn label="Remove requirement" danger onClick={() => setFormData({ ...formData, requirements: formData.requirements.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconBtn>
                </div>
              ))}
              <button type="button" onClick={() => setFormData({ ...formData, requirements: [...formData.requirements, { id: newId(), label: '', done: false }] })} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Plus size={16} /> Add requirement</button>
            </div>
          </Group>

          {/* Contacts */}
          <Group label="Contacts">
            <div className="space-y-2">
              {formData.contacts.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input type="text" value={c.name} onChange={(e) => updateContact(i, { name: e.target.value })} placeholder="Name" aria-label="Contact name" className={inputCls} />
                  <input type="text" value={c.email || ''} onChange={(e) => updateContact(i, { email: e.target.value })} placeholder="Email / role" aria-label="Contact email or role" className={inputCls} />
                  <IconBtn label="Remove contact" danger onClick={() => setFormData({ ...formData, contacts: formData.contacts.filter((_, j) => j !== i) })}><Trash2 size={16} /></IconBtn>
                </div>
              ))}
              <button type="button" onClick={() => setFormData({ ...formData, contacts: [...formData.contacts, { id: newId(), name: '' }] })} className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"><Plus size={16} /> Add contact</button>
            </div>
          </Group>

          <Field label="Notes">
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes about this application..." rows={3} className={`${inputCls} resize-none`} />
          </Field>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => setShowModal(false)} className={cx.btnGhost}>Cancel</button>
          <button type="button" onClick={handleSave} disabled={!formData.name.trim()} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <Save size={16} /> {editingApplication ? 'Update' : 'Create'}
          </button>
        </ModalFooter>
      </Modal>
    );
  }

  function updateReq(i: number, patch: Partial<ApplicationRequirement>) {
    setFormData((prev) => ({ ...prev, requirements: prev.requirements.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  }
  function updateContact(i: number, patch: Partial<ApplicationContact>) {
    setFormData((prev) => ({ ...prev, contacts: prev.contacts.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  }
};

/** Labelled group of several controls (a <label> would wrap more than one control). */
const Group: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="group" aria-label={label}>
    <span className={`block text-xs font-medium mb-1 ${cx.muted}`}>{label}</span>
    {children}
  </div>
);

const StatusPill: React.FC<{ status: AppStatus }> = ({ status }) => {
  const color = STATUS_COLOR[status] ?? '#9ca3af';
  const Icon = STATUS_ICON[status] ?? FileText;
  return (
    <Badge color={color}>
      <Icon size={12} />
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
};

const PriorityPill: React.FC<{ priority: Application['priority'] }> = ({ priority }) => {
  const color = PRIORITY_COLOR[priority] ?? '#9ca3af';
  return <Badge color={color}><Flag size={12} /> {priority}</Badge>;
};

const BoardCard: React.FC<{ app: Application; onEdit: () => void }> = ({ app, onEdit }) => {
  const TypeIcon = TYPE_ICON[app.type] ?? FileText;
  const deadline = applicationDeadline(app);
  const soon = isDeadlineSoon(deadline);
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`Edit ${app.name}`}
      className={`w-full text-left rounded-lg border ${cx.border} ${cx.card} p-3 hover:border-blue-400 dark:hover:border-blue-500/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40`}
    >
      <span className={`flex items-center gap-1.5 mb-1.5 ${cx.muted}`}>
        <TypeIcon size={12} />
        <span className="text-[11px] font-medium capitalize">{app.type}</span>
        {app.priority && <span className="ml-auto"><PriorityPill priority={app.priority} /></span>}
      </span>
      <span className={`block text-sm font-medium leading-snug ${cx.text}`}>{app.name}</span>
      {app.organization && <span className={`block text-xs mt-0.5 ${cx.muted}`}>{app.organization}</span>}
      {deadline && (
        <span className={`text-xs mt-2 flex items-center gap-1 ${soon ? 'text-orange-600 dark:text-orange-400' : cx.muted}`}>
          <Calendar size={12} /> {relativeDeadline(deadline)}
        </span>
      )}
    </button>
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
    <Modal open onClose={onCancel} title="Share a workspace">
      {!supported ? (
        <>
          <ModalBody>
            <p className={`text-sm ${cx.muted}`}>Sign in with an email or Google account to create a shared workspace others can join and collaborate in.</p>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={onCancel} className={cx.btnPrimary}>Got it</button>
          </ModalFooter>
        </>
      ) : (
        <>
          <ModalBody>
            <Field label="Workspace name">
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grants 2026" autoFocus />
            </Field>
            <Group label="Invite by email (optional)">
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {emails.map((e) => (
                    <span key={e} className="text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                      <Mail size={11} /> {e}
                      <button type="button" onClick={() => setEmails(emails.filter((x) => x !== e))} className="hover:text-blue-900 dark:hover:text-white" aria-label={`Remove ${e}`} title={`Remove ${e}`}><X size={12} /></button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className={inputCls}
                placeholder="name@example.com — press Enter"
                aria-label="Invite by email"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <p className={`text-xs mt-1 ${cx.faint}`}>They'll see this workspace next time they open ClearMind signed in with that email.</p>
            </Group>
            <label className={`flex items-center gap-2 text-sm cursor-pointer ${cx.text}`}>
              <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="accent-blue-600" />
              Copy my {personalCount} current application{personalCount !== 1 ? 's' : ''} into it
            </label>
            {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={onCancel} className={cx.btnGhost}>Cancel</button>
            <button type="button" onClick={submit} disabled={!name.trim() || busy} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
              <Share2 size={16} /> {busy ? 'Creating…' : 'Create & share'}
            </button>
          </ModalFooter>
        </>
      )}
    </Modal>
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
    <Modal open onClose={onCancel} title="Members">
      <ModalBody>
        <p className={`text-xs ${cx.muted}`}>{workspace.name} · everyone listed can view and edit every application.</p>

        <div className={`rounded-lg border ${cx.border} divide-y divide-gray-200 dark:divide-gray-800`}>
          <div className={`flex items-center justify-between text-sm px-3 py-2 ${cx.text}`}>
            <span className="flex items-center gap-2 min-w-0"><Mail size={14} className={cx.faint} /> <span className="truncate">{workspace.ownerEmail}</span></span>
            <span className="text-[11px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 shrink-0"><Crown size={11} /> owner{currentEmail === workspace.ownerEmail ? ' · you' : ''}</span>
          </div>
          {invitees.map((e) => (
            <div key={e} className={`flex items-center justify-between text-sm px-3 py-1.5 ${cx.text}`}>
              <span className="flex items-center gap-2 min-w-0"><Mail size={14} className={cx.faint} /> <span className="truncate">{e}{currentEmail === e ? ' · you' : ''}</span></span>
              {isOwner && (
                <IconBtn label={`Remove ${e}`} danger onClick={() => setInvitees(invitees.filter((x) => x !== e))}><X size={16} /></IconBtn>
              )}
            </div>
          ))}
        </div>

        {isOwner ? (
          <>
            <div className="flex items-center gap-2">
              <UserPlus size={16} className={cx.faint} aria-hidden />
              <input
                className={inputCls}
                placeholder="Invite by email — press Enter"
                aria-label="Invite by email"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          </>
        ) : (
          <p className={`text-xs ${cx.muted}`}>Only the owner can change who's in this workspace.</p>
        )}
      </ModalBody>
      <ModalFooter>
        {isOwner ? (
          <>
            <button type="button" onClick={onCancel} className={cx.btnGhost}>Cancel</button>
            <button type="button" onClick={save} disabled={busy} className={cx.btnPrimary}>{busy ? 'Saving…' : 'Save members'}</button>
          </>
        ) : (
          <button type="button" onClick={onCancel} className={cx.btnGhost}>Close</button>
        )}
      </ModalFooter>
    </Modal>
  );
};

export default ApplicationsView;
