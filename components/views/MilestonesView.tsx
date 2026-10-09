import React, { useState, useEffect, useCallback } from 'react';
import { Milestone } from '../../types';
import { dbService, STORES } from '../../services/db';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';
import { Check, Plus, Pencil, Trash2, Flag, RefreshCw, Wifi, WifiOff, ListPlus } from 'lucide-react';
import { toISODate } from '../../shared/tasks';
import { PageShell, Modal, ModalBody, ModalFooter, Field, IconBtn, Empty, inputCls, cx, useCreateLinkedTask } from '../ui-kit';

/** Milestone dates are stored either as YYYY-MM-DD or as a display string ("Oct 2026"); map to a task due date. */
function milestoneDue(date: string | undefined): string | null {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const t = Date.parse(date);
  return Number.isNaN(t) ? null : toISODate(new Date(t));
}

const MilestonesView: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'offline'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load milestones from local database
  const loadMilestones = useCallback(async () => {
    const data = await dbService.getAll<Milestone>(STORES.MILESTONES);
    setMilestones(data);
  }, []);

  // Handle real-time updates from Firebase
  // Note: subscribeToCollection already filters out deleted items
  const handleRealtimeUpdate = useCallback((items: Milestone[]) => {
    setMilestones(items);
    setSyncStatus('synced');
    setLastSyncTime(new Date());
  }, []);

  // Manual sync function
  const manualSync = async () => {
    if (!isOnline) {
      setSyncStatus('offline');
      return;
    }
    
    setSyncStatus('syncing');
    try {
      // Reload from local DB first
      await loadMilestones();
      
      // If Firebase is configured, trigger a sync
      if (isFirebaseConfigured()) {
        const localData = await dbService.getAll<Milestone>(STORES.MILESTONES);
        // Re-save all items to trigger cloud sync
        for (const item of localData) {
          await dbService.put(STORES.MILESTONES, item);
        }
      }
      
      setSyncStatus('synced');
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('offline');
    }
  };

  useEffect(() => {
    loadMilestones();
    
    // Track online/offline status
    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus('idle');
      // Auto-sync when coming back online
      manualSync();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Set up real-time sync if Firebase is configured
    let unsubscribe: (() => void) | null = null;
    
    if (isFirebaseConfigured()) {
      // Subscribe to real-time updates
      unsubscribe = firebaseService.subscribeToCollection<Milestone>(
        'milestones',
        handleRealtimeUpdate
      );
      setSyncStatus('synced');
    }

    // Auto-sync every 30 seconds when online
    const autoSyncInterval = setInterval(() => {
      if (isOnline && isFirebaseConfigured()) {
        loadMilestones();
      }
    }, 30000);

    // Listen for global sync events
    const handleGlobalSync = (e: CustomEvent) => {
      if (e.detail?.store === 'milestones') {
        loadMilestones();
      }
    };
    window.addEventListener('clearmind-sync', handleGlobalSync as EventListener);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('clearmind-sync', handleGlobalSync as EventListener);
      if (unsubscribe) unsubscribe();
      clearInterval(autoSyncInterval);
    };
  }, [loadMilestones, handleRealtimeUpdate, isOnline]);

  const openAddModal = () => {
    setFormData({
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setEditingMilestone(null);
    setShowModal(true);
  };

  const openEditModal = (milestone: Milestone) => {
    setFormData({
      title: milestone.title,
      description: milestone.description || '',
      date: milestone.date
    });
    setEditingMilestone(milestone);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;

    const formattedDate = new Date(formData.date).toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    });

    if (editingMilestone) {
      const updated: Milestone = {
        ...editingMilestone,
        title: formData.title,
        description: formData.description,
        date: formattedDate
      };
      await dbService.put(STORES.MILESTONES, updated);
      setMilestones(milestones.map(m => m.id === editingMilestone.id ? updated : m));
    } else {
      const newMilestone: Milestone = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        date: formattedDate,
        completed: false
      };
      await dbService.put(STORES.MILESTONES, newMilestone);
      setMilestones([...milestones, newMilestone]);
    }

    setShowModal(false);
    setEditingMilestone(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this milestone?')) return;
    await dbService.delete(STORES.MILESTONES, id);
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const createLinkedTask = useCreateLinkedTask();
  const addTaskFor = (m: Milestone) => createLinkedTask({ title: m.title, dueDate: milestoneDue(m.date) });

  const toggleMilestone = async (id: string) => {
    const m = milestones.find(m => m.id === id);
    if (!m) return;
    const updated = { ...m, completed: !m.completed };
    
    await dbService.put(STORES.MILESTONES, updated);
    setMilestones(milestones.map(item => item.id === id ? updated : item));
  };

  return (
    <PageShell
      title="Journey Milestones"
      subtitle="Visualize how far you have come."
      actions={
        <div className="flex items-center gap-2">
          {syncStatus === 'syncing' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400" role="status">
              <RefreshCw size={14} className="animate-spin" />Syncing…
            </span>
          )}
          {syncStatus === 'synced' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-500" role="status">
              <Wifi size={14} />Synced
            </span>
          )}
          {syncStatus === 'offline' && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs text-orange-500" role="status">
              <WifiOff size={14} />Offline
            </span>
          )}
          <IconBtn
            label={lastSyncTime ? `Sync now (last synced ${lastSyncTime.toLocaleTimeString()})` : 'Sync now'}
            onClick={manualSync}
            disabled={syncStatus === 'syncing'}
          >
            <RefreshCw size={18} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
          </IconBtn>
          <button onClick={openAddModal} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <Plus size={16} />Add milestone
          </button>
        </div>
      }
    >
      {milestones.length === 0 ? (
        <Empty icon={<Flag size={30} className="text-blue-500" />} title="No milestones yet" subtitle="Add your first big win — launches, promotions, finished courses." />
      ) : (
        <ol className={`relative ml-3 pl-7 border-l-2 ${cx.border} space-y-4`}>
          {milestones.map((milestone) => (
            <li key={milestone.id} className="relative group">
              <button
                onClick={() => toggleMilestone(milestone.id)}
                role="checkbox"
                aria-checked={milestone.completed}
                aria-label={milestone.completed ? `Mark “${milestone.title}” as incomplete` : `Mark “${milestone.title}” as completed`}
                title={milestone.completed ? 'Mark as incomplete' : 'Mark as completed'}
                className={`absolute -left-[41px] top-4 w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white dark:ring-[#05050A] transition-colors ${
                  milestone.completed ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#0F1219] border-2 border-gray-300 dark:border-gray-700 text-transparent hover:text-gray-400'
                }`}
              >
                <Check size={14} strokeWidth={3} />
              </button>

              <div className={`rounded-xl border ${cx.border} ${cx.card} p-4`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-semibold ${milestone.completed ? cx.text : cx.muted}`}>{milestone.title}</h3>
                    <p className={`text-xs mt-0.5 ${cx.muted}`}>{milestone.date}</p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    <IconBtn label="Add task for this milestone" onClick={() => addTaskFor(milestone)}><ListPlus size={16} /></IconBtn>
                    <IconBtn label="Edit milestone" onClick={() => openEditModal(milestone)}><Pencil size={16} /></IconBtn>
                    <IconBtn label="Delete milestone" danger onClick={() => handleDelete(milestone.id)}><Trash2 size={16} /></IconBtn>
                  </div>
                </div>
                {milestone.description ? <p className={`text-sm mt-2 ${cx.muted}`}>{milestone.description}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingMilestone ? 'Edit milestone' : 'New milestone'}>
        <ModalBody>
          <Field label="Title *">
            <input
              type="text"
              autoFocus
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Launched my first app"
              className={inputCls}
            />
          </Field>
          <Field label="Description">
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Details about this milestone..."
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </Field>
          <Field label="Date">
            <input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className={inputCls} />
          </Field>
        </ModalBody>
        <ModalFooter>
          <button onClick={() => setShowModal(false)} className={cx.btnGhost}>Cancel</button>
          <button onClick={handleSave} disabled={!formData.title.trim()} className={cx.btnPrimary}>
            {editingMilestone ? 'Update' : 'Create'}
          </button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
};

export default MilestonesView;
