import React, { useState, useEffect, useMemo } from 'react';
import { DailyMapperEntry } from '../../types';
import { dbService, STORES } from '../../services/db';
import { 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Edit2, 
  Trash2, 
  X, 
  Save,
  Check,
  XCircle,
  AlertCircle,
  Copy,
  Calendar,
  ArrowRight
} from 'lucide-react';

const DailyMapperView: React.FC = () => {
  const [entries, setEntries] = useState<DailyMapperEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState<string | null>(null);
  const [moveToDate, setMoveToDate] = useState('');
  const [editingEntry, setEditingEntry] = useState<DailyMapperEntry | null>(null);
  const [formData, setFormData] = useState({
    startTime: '08:00',
    endTime: '08:30',
    task: '',
    completed: 'no' as 'yes' | 'no' | 'partial',
    comment: '',
    adjustment: '',
    color: '#3B82F6'
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
    loadEntriesAndAutoMove();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'dailymapper') {
        loadEntriesAndAutoMove();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const loadEntriesAndAutoMove = async () => {
    const data = await dbService.getAll<DailyMapperEntry>(STORES.DAILY_MAPPER);
    const today = new Date().toISOString().split('T')[0];
    
    // Auto-move incomplete entries from previous days to today
    const updatedEntries: DailyMapperEntry[] = [];
    let movedCount = 0;
    
    for (const entry of data) {
      if (entry.date < today && entry.completed !== 'yes') {
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
    
    setEntries(updatedEntries);
    
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
    return entries
      .filter(e => e.date === selectedDate)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [entries, selectedDate]);

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
      color: '#3B82F6'
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
      color: entry.color || '#3B82F6'
    });
    setEditingEntry(entry);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.task.trim()) return;

    if (editingEntry) {
      const updated: DailyMapperEntry = {
        ...editingEntry,
        ...formData
      };
      await dbService.put(STORES.DAILY_MAPPER, updated);
      setEntries(entries.map(e => e.id === editingEntry.id ? updated : e));
    } else {
      const newEntry: DailyMapperEntry = {
        id: Date.now().toString(),
        date: selectedDate,
        ...formData
      };
      await dbService.put(STORES.DAILY_MAPPER, newEntry);
      setEntries([...entries, newEntry]);
    }

    setShowModal(false);
    setEditingEntry(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this time block?')) return;
    await dbService.delete(STORES.DAILY_MAPPER, id);
    setEntries(entries.filter(e => e.id !== id));
  };

  const toggleCompletion = async (entry: DailyMapperEntry) => {
    const statusOrder: ('yes' | 'no' | 'partial')[] = ['no', 'partial', 'yes'];
    const currentIndex = statusOrder.indexOf(entry.completed);
    const nextStatus = statusOrder[(currentIndex + 1) % 3];
    
    const updated = { ...entry, completed: nextStatus };
    await dbService.put(STORES.DAILY_MAPPER, updated);
    setEntries(entries.map(e => e.id === entry.id ? updated : e));
  };

  const copyTodayToDate = async () => {
    const targetDate = prompt('Copy today\'s schedule to date (YYYY-MM-DD):');
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return;

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
    alert(`Copied ${todayEntries.length} entries to ${targetDate}`);
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

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Daily To-Do Mapper</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Plan your day with time blocks, like a personal schedule.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={copyTodayToDate}
            disabled={todayEntries.length === 0}
            title="Copy schedule to another day"
            className="px-3 py-2 border dark:border-gray-700 border-gray-300 rounded-lg flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Copy size={16} />
            Copy Day
          </button>
          <button 
            onClick={() => openAddModal()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
          >
            <Plus size={16} />
            Add Time Block
          </button>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="flex items-center justify-between mb-6 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-4">
        <button 
          onClick={() => navigateDay(-1)}
          title="Previous day"
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronLeft size={20} className="text-gray-500" />
        </button>
        
        <div className="flex items-center gap-4">
          <div className="text-center">
            <h3 className="text-lg font-bold dark:text-white text-gray-900">{formatDate(selectedDate)}</h3>
            {isToday && <span className="text-xs text-blue-500 font-medium">Today</span>}
          </div>
          {!isToday && (
            <button
              onClick={goToToday}
              className="text-sm text-blue-500 hover:text-blue-600 font-medium"
            >
              Go to Today
            </button>
          )}
        </div>

        <button 
          onClick={() => navigateDay(1)}
          title="Next day"
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ChevronRight size={20} className="text-gray-500" />
        </button>
      </div>

      {/* Stats Bar */}
      {todayEntries.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 p-4 rounded-xl text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{completionStats.total}</p>
            <p className="text-xs text-gray-500">Total Blocks</p>
          </div>
          <div className="bg-green-100 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 p-4 rounded-xl text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{completionStats.completed}</p>
            <p className="text-xs text-gray-500">Completed</p>
          </div>
          <div className="bg-yellow-100 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-900/50 p-4 rounded-xl text-center">
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{completionStats.partial}</p>
            <p className="text-xs text-gray-500">Partial</p>
          </div>
        </div>
      )}

      {/* Auto-moved entries indicator */}
      {isToday && todayEntries.some(e => e.adjustment?.includes('Auto-moved')) && (
        <div className="mb-4 p-3 bg-purple-100 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg flex items-center gap-2">
          <ArrowRight size={16} className="text-purple-500" />
          <p className="text-sm text-purple-600 dark:text-purple-400">
            Some entries were automatically moved from previous days. Look for the "Auto-moved" note.
          </p>
        </div>
      )}

      {/* Quick Add Presets */}
      {todayEntries.length === 0 && (
        <div className="mb-6 p-4 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl">
          <p className="text-sm text-gray-500 mb-3">Quick start with preset time slots:</p>
          <div className="flex flex-wrap gap-2">
            {presetTimeSlots.map((slot, idx) => (
              <button
                key={idx}
                onClick={() => openAddModal(slot)}
                className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                {formatTime(slot.start)} - {formatTime(slot.end)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Time Blocks List */}
      <div className="space-y-3">
        {todayEntries.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <Clock size={48} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">No time blocks for this day</p>
            <p className="text-sm">Click "Add Time Block" to start planning your day</p>
          </div>
        ) : (
          todayEntries.map((entry) => (
            <div 
              key={entry.id} 
              className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-4 hover:border-gray-400 dark:hover:border-gray-600 transition-colors group"
            >
              <div className="flex items-start gap-4">
                {/* Time Column */}
                <div 
                  className="w-1 h-full min-h-[60px] rounded-full"
                  style={{ backgroundColor: entry.color || '#3B82F6' }}
                />
                <div className="flex-shrink-0 text-center min-w-[100px]">
                  <p className="text-sm font-bold dark:text-white text-gray-900">
                    {formatTime(entry.startTime)}
                  </p>
                  <p className="text-xs text-gray-500">to</p>
                  <p className="text-sm font-bold dark:text-white text-gray-900">
                    {formatTime(entry.endTime)}
                  </p>
                </div>

                {/* Task Content */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium dark:text-white text-gray-900 mb-1">{entry.task}</h4>
                  {entry.comment && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                      💬 {entry.comment}
                    </p>
                  )}
                  {entry.adjustment && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      ⚡ Adjustment: {entry.adjustment}
                    </p>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleCompletion(entry)}
                    title={`Status: ${getCompletionLabel(entry.completed)} - Click to change`}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      entry.completed === 'yes' 
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                        : entry.completed === 'partial'
                        ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-500 dark:text-red-400'
                    }`}
                  >
                    {getCompletionIcon(entry.completed)}
                    {getCompletionLabel(entry.completed)}
                  </button>

                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setShowMoveModal(entry.id);
                        setMoveToDate(new Date().toISOString().split('T')[0]);
                      }}
                      title="Move to another date"
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-purple-500 transition-colors"
                    >
                      <ArrowRight size={14} />
                    </button>
                    <button
                      onClick={() => openEditModal(entry)}
                      title="Edit time block"
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(entry.id)}
                      title="Delete time block"
                      className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold dark:text-white text-gray-900">
                {editingEntry ? 'Edit Time Block' : 'New Time Block'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              {/* Time Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Start Time *</label>
                  <input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">End Time *</label>
                  <input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Task */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Task / Activity *</label>
                <input
                  type="text"
                  value={formData.task}
                  onChange={(e) => setFormData({ ...formData, task: e.target.value })}
                  placeholder="e.g., Subhi Prayer, Morning Workout, Deep Work..."
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Completion Status */}
              <div>
                <label className="block text-sm text-gray-500 mb-2">Completion Status</label>
                <div className="flex gap-2">
                  {(['no', 'partial', 'yes'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setFormData({ ...formData, completed: status })}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                        formData.completed === status
                          ? status === 'yes' 
                            ? 'bg-green-100 dark:bg-green-900/30 border-green-500 text-green-600 dark:text-green-400'
                            : status === 'partial'
                            ? 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500 text-yellow-600 dark:text-yellow-400'
                            : 'bg-red-100 dark:bg-red-900/30 border-red-500 text-red-500 dark:text-red-400'
                          : 'dark:border-gray-700 border-gray-300 dark:text-gray-400 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
                      }`}
                    >
                      {getCompletionIcon(status)}
                      {status === 'yes' ? 'Yes' : status === 'partial' ? 'Partial' : 'No'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Comment (optional)</label>
                <textarea
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  placeholder="Notes about how it went..."
                  rows={2}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Adjustment */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Adjustment (optional)</label>
                <input
                  type="text"
                  value={formData.adjustment}
                  onChange={(e) => setFormData({ ...formData, adjustment: e.target.value })}
                  placeholder="e.g., Moved to 6:00 AM, Skipped due to rain..."
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm text-gray-500 mb-2">Color</label>
                <div className="flex gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      title={`Select color`}
                      className={`w-8 h-8 rounded-full transition-all ${
                        formData.color === color ? 'ring-2 ring-offset-2 ring-offset-midnight-light ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={!formData.task.trim() || !formData.startTime || !formData.endTime}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingEntry ? 'Update Block' : 'Add Block'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Move to Date Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-white text-gray-900 flex items-center gap-2">
                <ArrowRight size={20} className="text-purple-500" />
                Move to Date
              </h3>
              <button 
                onClick={() => {
                  setShowMoveModal(null);
                  setMoveToDate('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            
            <p className="text-sm text-gray-500 mb-4">
              Select a new date for this time block. The entry will be moved and marked with an adjustment note.
            </p>

            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">New Date</label>
              <input
                type="date"
                value={moveToDate}
                onChange={(e) => setMoveToDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleMoveToDate(showMoveModal)}
                disabled={!moveToDate}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <ArrowRight size={16} />
                Move Entry
              </button>
              <button
                onClick={() => {
                  setShowMoveModal(null);
                  setMoveToDate('');
                }}
                className="px-4 py-2.5 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyMapperView;
