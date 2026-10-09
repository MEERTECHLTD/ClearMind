import React, { useState, useEffect, useMemo } from 'react';
import { DailyMapperEntry, DailyMapperTemplate } from '../../types';
import { dbService, STORES } from '../../services/db';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Pencil,
  Trash2,
  Check,
  XCircle,
  AlertCircle,
  Copy,
  Calendar,
  ArrowRight,
  RefreshCw,
  Briefcase,
  Coffee,
  Star,
  Settings,
  Home,
  Building2,
  MapPin,
  ArrowUpDown,
  CalendarClock,
  MessageSquare,
  Zap
} from 'lucide-react';
import { PageShell, Modal, ModalBody, ModalFooter, Field, IconBtn, Empty, Badge, inputCls, cx, useTaskToast } from '../ui-kit';

const DailyMapperView: React.FC = () => {
  const [entries, setEntries] = useState<DailyMapperEntry[]>([]);
  const [templates, setTemplates] = useState<DailyMapperTemplate[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState<string | null>(null);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [moveToDate, setMoveToDate] = useState('');
  const [editingEntry, setEditingEntry] = useState<DailyMapperEntry | null>(null);
  const [sortBy, setSortBy] = useState<'time' | 'location'>('time');
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState('');
  const toast = useTaskToast();
  const [formData, setFormData] = useState({
    startTime: '08:00',
    endTime: '08:30',
    task: '',
    completed: 'no' as 'yes' | 'no' | 'partial',
    comment: '',
    adjustment: '',
    color: '#3B82F6',
    location: 'home' as 'home' | 'work' | 'other',
    makePermanent: false,
    permanentType: 'daily' as 'daily' | 'workday' | 'weekend'
  });

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
  ];

  const presetTimeSlots = [
    { start: '05:00', end: '05:30', label: 'Early Morning' },
    { start: '06:00', end: '07:00', label: 'Morning Routine' },
    { start: '08:00', end: '09:00', label: 'Work Block 1' },
    { start: '09:00', end: '10:00', label: 'Work Block 2' },
    { start: '12:00', end: '13:00', label: 'Lunch Break' },
    { start: '14:00', end: '15:00', label: 'Afternoon Focus' },
    { start: '17:00', end: '18:00', label: 'Wind Down' },
    { start: '21:00', end: '22:00', label: 'Evening Routine' },
  ];

  useEffect(() => {
    loadTemplates();
    loadEntriesAndAutoMove();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'dailymapper' || e.detail?.store === 'dailymappertemplates') {
        loadTemplates();
        loadEntriesAndAutoMove();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  // Helper to check if a date is a weekend
  const isWeekend = (dateStr: string): boolean => {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6; // Sunday = 0, Saturday = 6
  };

  // Helper to check if a date is a workday
  const isWorkday = (dateStr: string): boolean => {
    return !isWeekend(dateStr);
  };

  // Get day type label
  const getDayTypeLabel = (dateStr: string): string => {
    return isWeekend(dateStr) ? 'Weekend' : 'Workday';
  };

  const loadTemplates = async () => {
    const data = await dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES);
    setTemplates(data);
  };

  const loadEntriesAndAutoMove = async () => {
    const data = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    const templateData = await dbService.getAll<DailyMapperTemplate>(STORES.DAILY_MAPPER_TEMPLATES);
    const today = new Date().toISOString().split('T')[0];
    
    // Auto-move incomplete entries from previous days to today
    const updatedEntries: DailyMapperEntry[] = [];
    let movedCount = 0;
    
    for (const entry of data) {
      // Don't auto-move permanent template entries - they stay on their date
      if (entry.date < today && entry.completed !== 'yes' && !entry.templateId) {
        // Move incomplete entry to today
        const updated: DailyMapperEntry = {
          ...entry,
          date: today,
          adjustment: entry.adjustment 
            ? `${entry.adjustment} | Auto-moved from ${entry.date}` 
            : `Auto-moved from ${entry.date}`
        };
        await dbService.put(STORES.DAILY_MAPPER, updated);
        updatedEntries.push(updated);
        movedCount++;
      } else {
        updatedEntries.push(entry);
      }
    }
    
    // Apply permanent templates for today if not already applied
    // Use a Set to track which templates have already been applied today
    const todayEntries = updatedEntries.filter(e => e.date === today);
    const appliedTemplateIds = new Set(
      todayEntries
        .filter(e => e.templateId)
        .map(e => e.templateId)
    );
    
    // Also check for entries that match the template by task+time (in case templateId was lost)
    const existingTaskKeys = new Set(
      todayEntries.map(e => `${e.startTime}-${e.endTime}-${e.task}`)
    );
    
    const todayIsWeekend = isWeekend(today);
    
    for (const template of templateData) {
      // Skip if already applied by templateId
      if (appliedTemplateIds.has(template.id)) continue;
      
      // Skip if an entry with same time+task already exists (prevents duplicates)
      const taskKey = `${template.startTime}-${template.endTime}-${template.task}`;
      if (existingTaskKeys.has(taskKey)) continue;
      
      // Check if template applies to today
      const shouldApply = 
        template.permanentType === 'daily' ||
        (template.permanentType === 'workday' && !todayIsWeekend) ||
        (template.permanentType === 'weekend' && todayIsWeekend);
      
      if (shouldApply) {
        const newEntry: DailyMapperEntry = {
          id: `${Date.now()}-${template.id}`,
          date: today,
          startTime: template.startTime,
          endTime: template.endTime,
          task: template.task,
          color: template.color,
          location: template.location,
          completed: 'no',
          templateId: template.id,
          isPermanent: true,
          permanentType: template.permanentType
        };
        await dbService.put(STORES.DAILY_MAPPER, newEntry);
        updatedEntries.push(newEntry);
        // Add to existing task keys to prevent duplicates in same run
        existingTaskKeys.add(taskKey);
      }
    }
    
    setEntries(updatedEntries);
    setTemplates(templateData);
    
    // Show notification if entries were moved
    if (movedCount > 0) {
      console.log(`Auto-moved ${movedCount} incomplete entries to today`);
    }
  };

  const loadEntries = async () => {
    const data = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    setEntries(data);
  };

  const todayEntries = useMemo(() => {
    const filtered = entries.filter(e => e.date === selectedDate);
    
    if (sortBy === 'location') {
      // Sort by location (home first, then work, then other), then by time
      const locationOrder: Record<string, number> = { home: 0, work: 1, other: 2 };
      return filtered.sort((a, b) => {
        const locA = locationOrder[a.location || 'other'] ?? 2;
        const locB = locationOrder[b.location || 'other'] ?? 2;
        if (locA !== locB) return locA - locB;
        return a.startTime.localeCompare(b.startTime);
      });
    }
    
    return filtered.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, selectedDate, sortBy]);

  const getLocationIcon = (location: 'home' | 'work' | 'other' | undefined) => {
    switch (location) {
      case 'home': return <Home size={12} className="text-green-500" />;
      case 'work': return <Building2 size={12} className="text-blue-500" />;
      case 'other': return <MapPin size={12} className="text-purple-500" />;
      default: return <MapPin size={12} className="text-gray-400" />;
    }
  };

  const getLocationLabel = (location: 'home' | 'work' | 'other' | undefined) => {
    switch (location) {
      case 'home': return 'Home';
      case 'work': return 'Work';
      case 'other': return 'Other';
      default: return 'Not set';
    }
  };

  const navigateDay = (direction: number) => {
    const current = new Date(selectedDate);
    current.setDate(current.getDate() + direction);
    setSelectedDate(current.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const openAddModal = (preset?: { start: string; end: string }) => {
    setFormData({
      startTime: preset?.start || '08:00',
      endTime: preset?.end || '08:30',
      task: '',
      completed: 'no',
      comment: '',
      adjustment: '',
      color: '#3B82F6',
      location: 'home',
      makePermanent: false,
      permanentType: 'daily'
    });
    setEditingEntry(null);
    setShowModal(true);
  };

  const openEditModal = (entry: DailyMapperEntry) => {
    setFormData({
      startTime: entry.startTime,
      endTime: entry.endTime,
      task: entry.task,
      completed: entry.completed,
      comment: entry.comment || '',
      adjustment: entry.adjustment || '',
      color: entry.color || '#3B82F6',
      location: entry.location || 'home',
      makePermanent: entry.isPermanent || false,
      permanentType: entry.permanentType || 'daily'
    });
    setEditingEntry(entry);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.task.trim()) return;

    if (editingEntry) {
      const updated: DailyMapperEntry = {
        ...editingEntry,
        startTime: formData.startTime,
        endTime: formData.endTime,
        task: formData.task,
        completed: formData.completed,
        comment: formData.comment,
        adjustment: formData.adjustment,
        color: formData.color,
        location: formData.location,
        isPermanent: formData.makePermanent,
        permanentType: formData.makePermanent ? formData.permanentType : undefined
      };
      await dbService.put(STORES.DAILY_MAPPER, updated);
      setEntries(entries.map(e => e.id === editingEntry.id ? updated : e));
      
      // If making permanent and not already a template, create template
      if (formData.makePermanent && !editingEntry.templateId) {
        const existingTemplate = templates.find(t => 
          t.task === formData.task && 
          t.startTime === formData.startTime && 
          t.permanentType === formData.permanentType
        );
        
        if (!existingTemplate) {
          const newTemplate: DailyMapperTemplate = {
            id: Date.now().toString(),
            startTime: formData.startTime,
            endTime: formData.endTime,
            task: formData.task,
            color: formData.color,
            location: formData.location,
            permanentType: formData.permanentType,
            createdAt: new Date().toISOString()
          };
          await dbService.put(STORES.DAILY_MAPPER_TEMPLATES, newTemplate);
          setTemplates([...templates, newTemplate]);
        }
      }
    } else {
      let templateId: string | undefined;
      
      // If making permanent, create template first
      if (formData.makePermanent) {
        const newTemplate: DailyMapperTemplate = {
          id: Date.now().toString(),
          startTime: formData.startTime,
          endTime: formData.endTime,
          task: formData.task,
          color: formData.color,
          location: formData.location,
          permanentType: formData.permanentType,
          createdAt: new Date().toISOString()
        };
        await dbService.put(STORES.DAILY_MAPPER_TEMPLATES, newTemplate);
        setTemplates([...templates, newTemplate]);
        templateId = newTemplate.id;
      }
      
      const newEntry: DailyMapperEntry = {
        id: Date.now().toString() + '-entry',
        date: selectedDate,
        startTime: formData.startTime,
        endTime: formData.endTime,
        task: formData.task,
        completed: formData.completed,
        comment: formData.comment,
        adjustment: formData.adjustment,
        color: formData.color,
        location: formData.location,
        isPermanent: formData.makePermanent,
        permanentType: formData.makePermanent ? formData.permanentType : undefined,
        templateId
      };
      await dbService.put(STORES.DAILY_MAPPER, newEntry);
      setEntries([...entries, newEntry]);
    }

    setShowModal(false);
    setEditingEntry(null);
  };

  const handleDelete = async (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    
    // If this entry is from a permanent template, ask if they want to delete the template too
    if (entry.templateId) {
      const deleteTemplate = confirm(
        'This is a permanent/recurring time block.\n\n' +
        '• Click OK to delete this entry AND stop it from appearing on future days.\n' +
        '• Click Cancel to keep the entry.'
      );
      
      if (!deleteTemplate) return;
      
      // Delete the template so it doesn't recreate
      await dbService.hardDelete(STORES.DAILY_MAPPER_TEMPLATES, entry.templateId);
      setTemplates(templates.filter(t => t.id !== entry.templateId));
      
      // Also delete all entries created from this template
      const relatedEntries = entries.filter(e => e.templateId === entry.templateId);
      for (const relatedEntry of relatedEntries) {
        await dbService.delete(STORES.DAILY_MAPPER, relatedEntry.id);
      }
      setEntries(entries.filter(e => e.templateId !== entry.templateId));
    } else {
      if (!confirm('Delete this time block?')) return;
      await dbService.delete(STORES.DAILY_MAPPER, id);
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Delete this permanent template? It will no longer be added to new days.')) return;
    await dbService.hardDelete(STORES.DAILY_MAPPER_TEMPLATES, templateId);
    setTemplates(templates.filter(t => t.id !== templateId));
  };

  const getPermanentTypeIcon = (type: 'daily' | 'workday' | 'weekend') => {
    switch (type) {
      case 'daily': return <RefreshCw size={12} className="text-purple-400" />;
      case 'workday': return <Briefcase size={12} className="text-blue-400" />;
      case 'weekend': return <Coffee size={12} className="text-green-400" />;
    }
  };

  const getPermanentTypeLabel = (type: 'daily' | 'workday' | 'weekend') => {
    switch (type) {
      case 'daily': return 'Every Day';
      case 'workday': return 'Workdays';
      case 'weekend': return 'Weekends';
    }
  };

  const toggleCompletion = async (entry: DailyMapperEntry) => {
    const statusOrder: ('yes' | 'no' | 'partial')[] = ['no', 'partial', 'yes'];
    const currentIndex = statusOrder.indexOf(entry.completed);
    const nextStatus = statusOrder[(currentIndex + 1) % 3];
    
    const updated = { ...entry, completed: nextStatus };
    await dbService.put(STORES.DAILY_MAPPER, updated);
    setEntries(entries.map(e => e.id === entry.id ? updated : e));
  };

  // "Copy day" asks for the target date in a dialog (was window.prompt).
  const openCopyModal = () => {
    setCopyTarget('');
    setCopyOpen(true);
  };

  const copyTodayToDate = async () => {
    const targetDate = copyTarget;
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return;
    setCopyOpen(false);

    for (const entry of todayEntries) {
      const newEntry: DailyMapperEntry = {
        ...entry,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        date: targetDate,
        completed: 'no',
        comment: '',
        adjustment: ''
      };
      await dbService.put(STORES.DAILY_MAPPER, newEntry);
    }
    
    await loadEntries();
    toast(`Copied ${todayEntries.length} entries to ${targetDate}`, { label: 'View', onClick: () => setSelectedDate(targetDate) });
  };

  // Move an entry to a different date
  const handleMoveToDate = async (entryId: string) => {
    if (!moveToDate) return;
    
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const updated: DailyMapperEntry = {
      ...entry,
      date: moveToDate,
      adjustment: entry.adjustment 
        ? `${entry.adjustment} | Moved from ${entry.date}` 
        : `Moved from ${entry.date}`
    };
    
    await dbService.put(STORES.DAILY_MAPPER, updated);
    setEntries(entries.map(e => e.id === entryId ? updated : e));
    setShowMoveModal(null);
    setMoveToDate('');
  };

  const getCompletionIcon = (status: 'yes' | 'no' | 'partial') => {
    switch (status) {
      case 'yes': return <Check size={16} className="text-green-500" />;
      case 'partial': return <AlertCircle size={16} className="text-yellow-500" />;
      case 'no': return <XCircle size={16} className="text-red-400" />;
    }
  };

  const getCompletionLabel = (status: 'yes' | 'no' | 'partial') => {
    switch (status) {
      case 'yes': return 'Completed';
      case 'partial': return 'Partial';
      case 'no': return 'Not Done';
    }
  };

  const completionStats = useMemo(() => {
    const total = todayEntries.length;
    const completed = todayEntries.filter(e => e.completed === 'yes').length;
    const partial = todayEntries.filter(e => e.completed === 'partial').length;
    return { total, completed, partial };
  }, [todayEntries]);

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  const closeMoveModal = () => {
    setShowMoveModal(null);
    setMoveToDate('');
  };

  const statusTone = (status: 'yes' | 'no' | 'partial') =>
    status === 'yes'
      ? 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400'
      : status === 'partial'
      ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
      : 'bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400';

  const choiceCls = (selected: boolean) =>
    `flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
      selected
        ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
        : `${cx.border} ${cx.muted} ${cx.hover}`
    }`;

  return (
    <PageShell
      title="Daily To-Do Mapper"
      subtitle="Plan your day with time blocks, like a personal schedule."
      wide
      actions={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={() => setSortBy(sortBy === 'time' ? 'location' : 'time')}
            title={`Sort by ${sortBy === 'time' ? 'location' : 'time'}`}
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}
          >
            <ArrowUpDown size={16} />
            <span className="hidden sm:inline">{sortBy === 'time' ? 'By time' : 'By location'}</span>
          </button>
          <button
            onClick={() => setShowTemplatesModal(true)}
            title="Manage permanent todos"
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}
          >
            <Star size={16} className="text-amber-500" />
            <span className="hidden sm:inline">Permanents</span>
            <span className={`text-xs tabular-nums ${cx.muted}`}>{templates.length}</span>
          </button>
          <button
            onClick={openCopyModal}
            disabled={todayEntries.length === 0}
            title="Copy schedule to another day"
            aria-label="Copy day"
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <Copy size={16} />
            <span className="hidden sm:inline">Copy day</span>
          </button>
          <button onClick={() => openAddModal()} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <Plus size={16} />
            Add time block
          </button>
        </div>
      }
    >
      {/* Date Navigation */}
      <div className={`flex items-center justify-between gap-2 mb-4 pb-3 border-b ${cx.border}`}>
        <IconBtn label="Previous day" onClick={() => navigateDay(-1)}>
          <ChevronLeft size={18} />
        </IconBtn>

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
          <h2 className={`text-base font-semibold ${cx.text}`}>{formatDate(selectedDate)}</h2>
          <div className="flex items-center gap-2 text-xs">
            {isToday && <Badge color="#2563EB">Today</Badge>}
            <span className={`font-medium inline-flex items-center gap-1 ${cx.muted}`}>
              {isWeekend(selectedDate) ? <Coffee size={12} /> : <Briefcase size={12} />}
              {getDayTypeLabel(selectedDate)}
            </span>
            {!isToday && (
              <button onClick={goToToday} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Go to today
              </button>
            )}
          </div>
        </div>

        <IconBtn label="Next day" onClick={() => navigateDay(1)}>
          <ChevronRight size={18} />
        </IconBtn>
      </div>

      {/* Stats Bar */}
      {todayEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Stat value={completionStats.total} label="Total blocks" />
          <Stat value={completionStats.completed} label="Completed" color="text-green-600 dark:text-green-400" />
          <Stat value={completionStats.partial} label="Partial" color="text-amber-600 dark:text-amber-400" />
        </div>
      )}

      {/* Auto-moved entries indicator */}
      {isToday && todayEntries.some(e => e.adjustment?.includes('Auto-moved')) && (
        <div className={`mb-4 px-3 py-2.5 rounded-lg border ${cx.border} bg-gray-50 dark:bg-white/[0.03] flex items-center gap-2`} role="status">
          <ArrowRight size={16} className="text-blue-500 shrink-0" />
          <p className={`text-sm ${cx.muted}`}>
            Some entries were automatically moved from previous days. Look for the "Auto-moved" note.
          </p>
        </div>
      )}

      {/* Time Blocks List */}
      {todayEntries.length === 0 ? (
        <>
          <Empty
            icon={<Clock size={30} className={cx.muted} />}
            title="No time blocks for this day"
            subtitle={'Click "Add time block" to start planning your day, or start from a preset slot.'}
          />
          {/* Quick Add Presets */}
          <div className="flex flex-wrap justify-center gap-2 -mt-6">
            {presetTimeSlots.map((slot, idx) => (
              <button
                key={idx}
                onClick={() => openAddModal(slot)}
                title={slot.label}
                className={`px-2.5 py-1 text-xs rounded-md border ${cx.border} ${cx.muted} ${cx.hover} transition-colors`}
              >
                {formatTime(slot.start)} – {formatTime(slot.end)}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className={`rounded-xl border ${cx.border} ${cx.card} overflow-hidden`}>
          {todayEntries.map((entry) => (
            <div key={entry.id} className={`group relative flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4 px-4 py-3 border-b last:border-b-0 ${cx.border} ${cx.hover} transition-colors`}>
              {/* Colour bar (user colour) */}
              <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full" style={{ backgroundColor: entry.color || '#3B82F6' }} aria-hidden />

              <div className="flex items-center sm:flex-col sm:items-start gap-1.5 sm:gap-0 shrink-0 sm:min-w-[84px] tabular-nums">
                <p className={`text-sm font-semibold ${cx.text}`}>{formatTime(entry.startTime)}</p>
                <p className={`text-xs ${cx.faint}`}><span className="sm:hidden">–</span><span className="hidden sm:inline">to</span></p>
                <p className={`text-sm ${cx.muted}`}>{formatTime(entry.endTime)}</p>
              </div>

              {/* Task Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className={`text-sm font-medium ${entry.completed === 'yes' ? 'line-through text-gray-400' : cx.text}`}>{entry.task}</h3>
                  {entry.location && (
                    <Badge>
                      {getLocationIcon(entry.location)}
                      {getLocationLabel(entry.location)}
                    </Badge>
                  )}
                  {entry.isPermanent && entry.permanentType && (
                    <Badge>
                      {getPermanentTypeIcon(entry.permanentType)}
                      {getPermanentTypeLabel(entry.permanentType)}
                    </Badge>
                  )}
                </div>
                {entry.comment && (
                  <p className={`text-xs mt-1 flex items-start gap-1.5 ${cx.muted}`}>
                    <MessageSquare size={12} className="mt-0.5 shrink-0" />
                    <span>{entry.comment}</span>
                  </p>
                )}
                {entry.adjustment && (
                  <p className="text-xs mt-1 flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                    <Zap size={12} className="mt-0.5 shrink-0" />
                    <span>Adjustment: {entry.adjustment}</span>
                  </p>
                )}
              </div>

              {/* Status & Actions - always visible on touch, hover on desktop */}
              <div className="flex items-center justify-between sm:justify-end gap-2">
                <button
                  onClick={() => toggleCompletion(entry)}
                  title={`Status: ${getCompletionLabel(entry.completed)} - Click to change`}
                  aria-label={`Status: ${getCompletionLabel(entry.completed)}. Click to change`}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${statusTone(entry.completed)}`}
                >
                  {getCompletionIcon(entry.completed)}
                  <span>{getCompletionLabel(entry.completed)}</span>
                </button>

                <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                  <IconBtn
                    label="Move to another date"
                    onClick={() => {
                      setShowMoveModal(entry.id);
                      setMoveToDate(new Date().toISOString().split('T')[0]);
                    }}
                  >
                    <CalendarClock size={16} />
                  </IconBtn>
                  <IconBtn label="Edit time block" onClick={() => openEditModal(entry)}>
                    <Pencil size={16} />
                  </IconBtn>
                  <IconBtn label="Delete time block" danger onClick={() => handleDelete(entry.id)}>
                    <Trash2 size={16} />
                  </IconBtn>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingEntry ? 'Edit time block' : 'New time block'}>
        <form
          className="flex flex-col min-h-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (!formData.task.trim() || !formData.startTime || !formData.endTime) return;
            handleSave();
          }}
        >
          <ModalBody>
            {/* Time Range */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time *">
                <input
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className={inputCls}
                />
              </Field>
              <Field label="End time *">
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Task / activity *">
              <input
                type="text"
                value={formData.task}
                onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                placeholder="e.g., Subhi Prayer, Morning Workout, Deep Work..."
                className={inputCls}
                autoFocus
              />
            </Field>

            <div role="radiogroup" aria-label="Completion status">
              <span className={`block text-xs font-medium mb-1.5 ${cx.muted}`}>Completion status</span>
              <div className="flex gap-2">
                {(['no', 'partial', 'yes'] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={formData.completed === status}
                    onClick={() => setFormData({ ...formData, completed: status })}
                    className={choiceCls(formData.completed === status)}
                  >
                    {getCompletionIcon(status)}
                    {status === 'yes' ? 'Yes' : status === 'partial' ? 'Partial' : 'No'}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Comment (optional)">
              <textarea
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                placeholder="Notes about how it went..."
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <Field label="Adjustment (optional)">
              <input
                type="text"
                value={formData.adjustment}
                onChange={(e) => setFormData({ ...formData, adjustment: e.target.value })}
                placeholder="e.g., Moved to 6:00 AM, Skipped due to rain..."
                className={inputCls}
              />
            </Field>

            <div role="radiogroup" aria-label="Location">
              <span className={`block text-xs font-medium mb-1.5 ${cx.muted}`}>Location</span>
              <div className="flex gap-2">
                {(['home', 'work', 'other'] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    role="radio"
                    aria-checked={formData.location === loc}
                    onClick={() => setFormData({ ...formData, location: loc })}
                    className={choiceCls(formData.location === loc)}
                  >
                    {loc === 'home' ? <Home size={16} /> : loc === 'work' ? <Building2 size={16} /> : <MapPin size={16} />}
                    {loc === 'home' ? 'Home' : loc === 'work' ? 'Work' : 'Other'}
                  </button>
                ))}
              </div>
            </div>

            <div role="radiogroup" aria-label="Color">
              <span className={`block text-xs font-medium mb-1.5 ${cx.muted}`}>Color</span>
              <div className="flex flex-wrap gap-2">
                {colors.map(color => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={formData.color === color}
                    onClick={() => setFormData({ ...formData, color })}
                    title={`Color ${color}`}
                    aria-label={`Color ${color}`}
                    className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                      formData.color === color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] ring-gray-400 dark:ring-gray-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {formData.color === color ? <Check size={14} className="text-white" /> : null}
                  </button>
                ))}
              </div>
            </div>

            {/* Make Permanent */}
            <div className={`p-3 rounded-lg border ${cx.border} bg-gray-50 dark:bg-white/[0.03]`}>
              <label htmlFor="makePermanent" className={`flex items-center gap-2.5 text-sm font-medium cursor-pointer ${cx.text}`}>
                <input
                  type="checkbox"
                  id="makePermanent"
                  checked={formData.makePermanent}
                  onChange={(e) => setFormData({ ...formData, makePermanent: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 accent-blue-600"
                />
                <Star size={16} className="text-amber-500" />
                Make this a permanent todo
              </label>

              {formData.makePermanent && (
                <div className="mt-3 space-y-2">
                  <p className={`text-xs ${cx.muted}`}>This task will automatically appear on:</p>
                  <div className="flex gap-2" role="radiogroup" aria-label="Repeats on">
                    {(['daily', 'workday', 'weekend'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        role="radio"
                        aria-checked={formData.permanentType === type}
                        onClick={() => setFormData({ ...formData, permanentType: type })}
                        className={`${choiceCls(formData.permanentType === type)} !text-xs`}
                      >
                        {type === 'daily' ? <RefreshCw size={14} /> : type === 'workday' ? <Briefcase size={14} /> : <Coffee size={14} />}
                        {type === 'daily' ? 'Every Day' : type === 'workday' ? 'Workdays' : 'Weekends'}
                      </button>
                    ))}
                  </div>
                  <p className={`text-xs ${cx.faint}`}>
                    {formData.permanentType === 'daily' && 'This task will appear every day (Mon-Sun)'}
                    {formData.permanentType === 'workday' && 'This task will appear on workdays only (Mon-Fri)'}
                    {formData.permanentType === 'weekend' && 'This task will appear on weekends only (Sat-Sun)'}
                  </p>
                </div>
              )}
            </div>
          </ModalBody>

          <ModalFooter>
            <button type="button" onClick={() => setShowModal(false)} className={cx.btnGhost}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={!formData.task.trim() || !formData.startTime || !formData.endTime}
              className={cx.btnPrimary}
            >
              {editingEntry ? 'Save' : 'Add block'}
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Move to Date Modal */}
      <Modal open={!!showMoveModal} onClose={closeMoveModal} title="Move to date">
        <form
          className="flex flex-col min-h-0"
          onSubmit={(e) => { e.preventDefault(); if (showMoveModal) handleMoveToDate(showMoveModal); }}
        >
          <ModalBody>
            <p className={`text-sm ${cx.muted}`}>
              Select a new date for this time block. The entry will be moved and marked with an adjustment note.
            </p>
            <Field label="New date">
              <input
                type="date"
                value={moveToDate}
                onChange={(e) => setMoveToDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className={inputCls}
              />
            </Field>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={closeMoveModal} className={cx.btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={!moveToDate} className={cx.btnPrimary}>
              Move entry
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Copy Day Modal */}
      <Modal open={copyOpen} onClose={() => setCopyOpen(false)} title="Copy day">
        <form
          className="flex flex-col min-h-0"
          onSubmit={(e) => { e.preventDefault(); void copyTodayToDate(); }}
        >
          <ModalBody>
            <p className={`text-sm ${cx.muted}`}>
              Copy the {todayEntries.length} time block{todayEntries.length === 1 ? '' : 's'} on {formatDate(selectedDate)} to another day. Status, comments and adjustments are reset.
            </p>
            <Field label="Copy to date">
              <input
                type="date"
                value={copyTarget}
                onChange={(e) => setCopyTarget(e.target.value)}
                className={inputCls}
                autoFocus
              />
            </Field>
          </ModalBody>
          <ModalFooter>
            <button type="button" onClick={() => setCopyOpen(false)} className={cx.btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(copyTarget)} className={cx.btnPrimary}>
              Copy
            </button>
          </ModalFooter>
        </form>
      </Modal>

      {/* Manage Permanent Templates Modal */}
      <Modal open={showTemplatesModal} onClose={() => setShowTemplatesModal(false)} title="Permanent todos">
        <ModalBody className="!space-y-3">
          <p className={`text-sm ${cx.muted}`}>
            These tasks are automatically added to your daily schedule based on their type.
          </p>

          {templates.length === 0 ? (
            <Empty
              icon={<Star size={30} className={cx.muted} />}
              title="No permanent todos yet"
              subtitle={'Create one by checking "Make permanent" when adding a time block.'}
            />
          ) : (
            (['daily', 'workday', 'weekend'] as const).map((type) => {
              const typeTemplates = templates.filter(t => t.permanentType === type);
              if (typeTemplates.length === 0) return null;

              return (
                <section key={type}>
                  <h3 className={`text-xs font-semibold mb-1 pb-1.5 border-b ${cx.border} flex items-center gap-1.5 ${cx.text}`}>
                    {type === 'daily' ? <RefreshCw size={12} className={cx.muted} /> : type === 'workday' ? <Briefcase size={12} className={cx.muted} /> : <Coffee size={12} className={cx.muted} />}
                    {type === 'daily' ? 'Every Day' : type === 'workday' ? 'Workdays (Mon-Fri)' : 'Weekends (Sat-Sun)'}
                  </h3>
                  {typeTemplates.map((template) => (
                    <div key={template.id} className={`group flex items-center gap-3 py-2 px-1 border-b ${cx.border}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: template.color || '#3B82F6' }} aria-hidden />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${cx.text}`}>{template.task}</p>
                        <p className={`text-xs ${cx.muted}`}>
                          {formatTime(template.startTime)} - {formatTime(template.endTime)}
                        </p>
                      </div>
                      <div className="opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                        <IconBtn label="Remove permanent todo" danger onClick={() => handleDeleteTemplate(template.id)}>
                          <Trash2 size={16} />
                        </IconBtn>
                      </div>
                    </div>
                  ))}
                </section>
              );
            })
          )}
        </ModalBody>
        <ModalFooter>
          <button onClick={() => setShowTemplatesModal(false)} className={cx.btnGhost}>
            Close
          </button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
};

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className={`rounded-xl border ${cx.border} ${cx.card} px-4 py-3`}>
      <p className={`text-xl font-semibold tabular-nums ${color ?? cx.text}`}>{value}</p>
      <p className={`text-xs ${cx.muted}`}>{label}</p>
    </div>
  );
}

export default DailyMapperView;
