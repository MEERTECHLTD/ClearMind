import React, { useState, useEffect, useMemo } from 'react';
import { Habit } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Check, Flame, Edit2, Trash2, X, Save, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

const HabitsView: React.FC = () => {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [habitForm, setHabitForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [monthlyViewDate, setMonthlyViewDate] = useState(new Date());
  const [showMonthlyView, setShowMonthlyView] = useState(false);

  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'
  ];

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  useEffect(() => {
    const loadHabits = async () => {
      const data = await dbService.getAll<Habit>(STORES.HABITS);
      setHabits(data);
    };
    loadHabits();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'habits') {
        loadHabits();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const toggleToday = async (id: string) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    
    const today = new Date().toISOString().split('T')[0];
    const newMonthlyHistory = { ...(habit.monthlyHistory || {}), [today]: !habit.completedToday };

    const updatedHabit: Habit = {
        ...habit,
        completedToday: !habit.completedToday,
        streak: !habit.completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1),
        history: [...habit.history.slice(1), !habit.completedToday],
        monthlyHistory: newMonthlyHistory
    };

    setHabits(habits.map(h => h.id === id ? updatedHabit : h));
    await dbService.put(STORES.HABITS, updatedHabit);
  };

  const toggleMonthlyDay = async (habitId: string, dateStr: string) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return;
    
    const currentValue = habit.monthlyHistory?.[dateStr] || false;
    const newMonthlyHistory = { ...(habit.monthlyHistory || {}), [dateStr]: !currentValue };
    
    const updatedHabit: Habit = {
      ...habit,
      monthlyHistory: newMonthlyHistory
    };

    setHabits(habits.map(h => h.id === habitId ? updatedHabit : h));
    await dbService.put(STORES.HABITS, updatedHabit);
  };

  const openAddModal = () => {
    setHabitForm({ name: '', description: '', color: '#3B82F6' });
    setEditingHabit(null);
    setShowAddModal(true);
  };

  const openEditModal = (habit: Habit) => {
    setHabitForm({
      name: habit.name,
      description: habit.description || '',
      color: habit.color || '#3B82F6'
    });
    setEditingHabit(habit);
    setShowAddModal(true);
  };

  const handleSaveHabit = async () => {
    if (!habitForm.name.trim()) return;

    if (editingHabit) {
      const updatedHabit: Habit = {
        ...editingHabit,
        name: habitForm.name,
        description: habitForm.description,
        color: habitForm.color
      };
      await dbService.put(STORES.HABITS, updatedHabit);
      setHabits(habits.map(h => h.id === editingHabit.id ? updatedHabit : h));
    } else {
      const newHabit: Habit = {
        id: Date.now().toString(),
        name: habitForm.name,
        description: habitForm.description,
        color: habitForm.color,
        streak: 0,
        completedToday: false,
        history: [false, false, false, false, false, false, false],
        monthlyHistory: {},
        createdAt: new Date().toISOString()
      };
      await dbService.put(STORES.HABITS, newHabit);
      setHabits([...habits, newHabit]);
    }

    setShowAddModal(false);
    setEditingHabit(null);
  };

  const handleDeleteHabit = async (id: string) => {
    if (!confirm('Are you sure you want to delete this habit?')) return;
    await dbService.delete(STORES.HABITS, id);
    setHabits(habits.filter(h => h.id !== id));
  };

  const daysInMonth = useMemo(() => {
    const year = monthlyViewDate.getFullYear();
    const month = monthlyViewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInCurrentMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthLastDay - i),
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return days;
  }, [monthlyViewDate]);

  const navigateMonth = (direction: number) => {
    setMonthlyViewDate(new Date(monthlyViewDate.getFullYear(), monthlyViewDate.getMonth() + direction, 1));
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const completionRate = useMemo(() => {
    if (habits.length === 0) return 0;
    const completed = habits.filter(h => h.completedToday).length;
    return Math.round((completed / habits.length) * 100);
  }, [habits]);

  const selectedHabit = habits.find(h => h.id === selectedHabitId);
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Habit Tracker</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Consistency is the key to mastery.</p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowMonthlyView(!showMonthlyView)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ${
              showMonthlyView 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            <Calendar size={16} />
            Monthly View
          </button>
          <button 
            onClick={openAddModal}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
          >
            <Plus size={16} />
            Add Habit
          </button>
        </div>
      </div>

      {/* Weekly Habit Tracker */}
      <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-colors">
        <div className="grid grid-cols-12 gap-4 p-4 dark:bg-gray-900/50 bg-gray-100 border-b dark:border-gray-800 border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-4">Habit Name</div>
          <div className="col-span-5 flex justify-between px-4">
             {days.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="col-span-2 text-center">Streak</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {habits.length === 0 ? (
           <div className="p-8 text-center text-gray-500">No habits tracked yet.</div>
        ) : (
          habits.map((habit) => (
            <div key={habit.id} className="grid grid-cols-12 gap-4 p-4 border-b dark:border-gray-800 border-gray-200 items-center hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors group">
              <div className="col-span-4 font-medium dark:text-white text-gray-800 flex items-center gap-2">
                <button 
                  onClick={() => toggleToday(habit.id)}
                  title={habit.completedToday ? "Mark incomplete" : "Mark complete"}
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all
                    ${habit.completedToday 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : 'border-gray-400 dark:border-gray-600 hover:border-green-500 text-transparent'}`}
                >
                  <Check size={14} />
                </button>
                <div className="flex-1 min-w-0">
                  <span className="truncate block" style={{ color: habit.color }}>{habit.name}</span>
                  {habit.description && (
                    <span className="text-xs text-gray-500 truncate block">{habit.description}</span>
                  )}
                </div>
              </div>
              
              <div className="col-span-5 flex justify-between px-4">
                {habit.history.map((done, idx) => (
                  <div 
                    key={idx} 
                    className={`w-3 h-3 rounded-sm transition-colors`}
                    style={{ backgroundColor: done ? (habit.color || '#3B82F6') : undefined }}
                    title={done ? 'Done' : 'Missed'}
                  >
                    {!done && <div className="w-full h-full dark:bg-gray-800 bg-gray-300 rounded-sm" />}
                  </div>
                ))}
              </div>

              <div className="col-span-2 text-center flex items-center justify-center gap-2 text-orange-500 font-bold">
                <Flame size={16} className={habit.streak > 0 ? 'fill-orange-500' : 'text-gray-400'} />
                {habit.streak}
              </div>

              <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setSelectedHabitId(habit.id);
                    setShowMonthlyView(true);
                  }}
                  title="View monthly tracker"
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500"
                >
                  <Calendar size={14} />
                </button>
                <button 
                  onClick={() => openEditModal(habit)}
                  title="Edit habit"
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500"
                >
                  <Edit2 size={14} />
                </button>
                <button 
                  onClick={() => handleDeleteHabit(habit.id)}
                  title="Delete habit"
                  className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Monthly Habit Tracker */}
      {showMonthlyView && (
        <div className="mt-8 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-bold dark:text-white text-gray-900">Monthly Tracker</h3>
              {habits.length > 0 && (
                <select
                  value={selectedHabitId || ''}
                  onChange={(e) => setSelectedHabitId(e.target.value || null)}
                  className="bg-midnight border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900"
                >
                  <option value="">Select a habit</option>
                  {habits.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigateMonth(-1)}
                title="Previous month"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={20} className="text-gray-500" />
              </button>
              <span className="text-sm font-medium dark:text-white text-gray-900 min-w-[140px] text-center">
                {monthNames[monthlyViewDate.getMonth()]} {monthlyViewDate.getFullYear()}
              </span>
              <button 
                onClick={() => navigateMonth(1)}
                title="Next month"
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ChevronRight size={20} className="text-gray-500" />
              </button>
            </div>
          </div>

          {selectedHabit ? (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map(day => (
                  <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {daysInMonth.map(({ date, isCurrentMonth }, index) => {
                  const dateStr = date.toISOString().split('T')[0];
                  const isCompleted = selectedHabit.monthlyHistory?.[dateStr] || false;
                  const isPast = date < new Date() && !isToday(date);
                  
                  return (
                    <button
                      key={index}
                      onClick={() => toggleMonthlyDay(selectedHabit.id, dateStr)}
                      disabled={!isCurrentMonth}
                      title={isCompleted ? 'Completed' : 'Not completed'}
                      className={`aspect-square p-2 rounded-lg transition-all flex items-center justify-center
                        ${!isCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
                        ${isToday(date) ? 'ring-2 ring-blue-500' : ''}
                        ${isCompleted 
                          ? '' 
                          : isPast 
                            ? 'bg-red-500/20 dark:bg-red-900/20' 
                            : 'dark:bg-gray-800 bg-gray-200'
                        }`}
                      style={isCompleted ? { backgroundColor: selectedHabit.color || '#3B82F6' } : undefined}
                    >
                      <span className={`text-sm font-medium ${
                        isCompleted ? 'text-white' : 'dark:text-white text-gray-900'
                      }`}>
                        {date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>
              
              {/* Monthly Stats */}
              <div className="mt-4 flex gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedHabit.color || '#3B82F6' }} />
                  <span className="text-gray-500">Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-red-500/20 dark:bg-red-900/20" />
                  <span className="text-gray-500">Missed</span>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Calendar size={48} className="mx-auto mb-3 opacity-30" />
              <p>Select a habit to view monthly progress</p>
            </div>
          )}
        </div>
      )}
      
      {/* Stats Cards */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 p-6 rounded-xl">
          <h4 className="text-blue-600 dark:text-blue-400 font-medium mb-1">Today's Completion</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">{completionRate}%</p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/50 p-6 rounded-xl">
          <h4 className="text-purple-600 dark:text-purple-400 font-medium mb-1">Total Active</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">{habits.length} Habits</p>
        </div>
        <div className="bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50 p-6 rounded-xl">
          <h4 className="text-orange-600 dark:text-orange-400 font-medium mb-1">Longest Streak</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">
            {habits.length > 0 ? Math.max(...habits.map(h => h.streak)) : 0} Days
          </p>
        </div>
      </div>

      {/* Add/Edit Habit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold dark:text-white text-gray-900">
                {editingHabit ? 'Edit Habit' : 'New Habit'}
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Habit Name *</label>
                <input
                  type="text"
                  value={habitForm.name}
                  onChange={(e) => setHabitForm({ ...habitForm, name: e.target.value })}
                  placeholder="Read for 30 minutes"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  value={habitForm.description}
                  onChange={(e) => setHabitForm({ ...habitForm, description: e.target.value })}
                  placeholder="Optional notes about this habit..."
                  rows={2}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Color</label>
                <div className="flex gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setHabitForm({ ...habitForm, color })}
                      className={`w-8 h-8 rounded-full transition-all ${
                        habitForm.color === color ? 'ring-2 ring-offset-2 ring-offset-midnight-light ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveHabit}
                disabled={!habitForm.name.trim()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingHabit ? 'Update Habit' : 'Create Habit'}
              </button>
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
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

export default HabitsView;
