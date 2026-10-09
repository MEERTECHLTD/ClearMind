import React, { useState, useEffect, useMemo } from 'react';
import { Habit } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Check, Flame, Pencil, Trash2, ChevronLeft, ChevronRight, Calendar, CircleCheck, ListChecks, Repeat } from 'lucide-react';
import { PageShell, Card, Modal, ModalBody, ModalFooter, Field, IconBtn, Empty, inputCls, cx } from '../ui-kit';

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
    <PageShell
      title="Habit Tracker"
      subtitle="Consistency is the key to mastery."
      wide
      actions={
        <>
          <button
            onClick={() => setShowMonthlyView(!showMonthlyView)}
            aria-pressed={showMonthlyView}
            className={`inline-flex items-center gap-1.5 ${showMonthlyView ? 'px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' : cx.btnGhost}`}
          >
            <Calendar size={16} />
            <span className="hidden sm:inline">Monthly view</span>
          </button>
          <button onClick={openAddModal} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <Plus size={16} />
            Add habit
          </button>
        </>
      }
    >
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatCard icon={<CircleCheck size={18} className="text-green-600 dark:text-green-400" />} label="Today's completion" value={`${completionRate}%`} />
        <StatCard icon={<ListChecks size={18} className="text-blue-600 dark:text-blue-400" />} label="Total active" value={`${habits.length} ${habits.length === 1 ? 'habit' : 'habits'}`} />
        <StatCard icon={<Flame size={18} className="text-orange-500" />} label="Longest streak" value={(() => { const n = habits.length > 0 ? Math.max(...habits.map(h => h.streak)) : 0; return `${n} ${n === 1 ? 'day' : 'days'}`; })()} />
      </div>

      {/* Weekly Habit Tracker */}
      <Card className="!p-0 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 className={`text-sm font-semibold flex-1 ${cx.text}`}>This week</h2>
          <span className={`text-xs ${cx.muted}`}>Last 7 days</span>
        </div>
        {habits.length === 0 ? (
          <Empty
            icon={<Repeat size={30} className={cx.muted} />}
            title="No habits tracked yet"
            subtitle="Add a habit and tick it off each day to build a streak."
          />
        ) : (
          <>
            <div className={`hidden sm:grid grid-cols-12 gap-4 px-4 py-2 border-y ${cx.border} text-xs font-medium ${cx.muted}`}>
              <div className="col-span-5">Habit</div>
              <div className="col-span-4 flex justify-between px-2">
                {days.map((d, i) => <span key={i} className="w-3 text-center">{d}</span>)}
              </div>
              <div className="col-span-2 text-center">Streak</div>
              <div className="col-span-1" />
            </div>
            {habits.map((habit) => (
              <div key={habit.id} className={`group grid grid-cols-12 gap-x-4 gap-y-2 px-4 py-3 border-b last:border-b-0 ${cx.border} items-center ${cx.hover} transition-colors`}>
                <div className="col-span-12 sm:col-span-5 flex items-center gap-3 min-w-0">
                  <button
                    onClick={() => toggleToday(habit.id)}
                    role="checkbox"
                    aria-checked={habit.completedToday}
                    aria-label={habit.completedToday ? `Mark “${habit.name}” incomplete for today` : `Complete “${habit.name}” for today`}
                    title={habit.completedToday ? 'Mark incomplete' : 'Mark complete'}
                    className="group/check shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center transition-colors"
                    style={{
                      border: `2px solid ${habit.color || '#3B82F6'}`,
                      background: habit.completedToday ? (habit.color || '#3B82F6') : `${habit.color || '#3B82F6'}1A`,
                    }}
                  >
                    <Check size={12} strokeWidth={3} className={habit.completedToday ? 'text-white' : 'opacity-0 group-hover/check:opacity-60'} style={habit.completedToday ? undefined : { color: habit.color || '#3B82F6' }} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className={`truncate block text-sm font-medium ${cx.text}`}>
                      <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ backgroundColor: habit.color || '#3B82F6' }} aria-hidden />
                      {habit.name}
                    </span>
                    {habit.description && (
                      <span className={`text-xs truncate block ${cx.muted}`}>{habit.description}</span>
                    )}
                  </div>
                </div>

                <div className="col-span-7 sm:col-span-4 flex justify-between px-2" aria-label={`Last 7 days: ${habit.history.filter(Boolean).length} done`}>
                  {habit.history.map((done, idx) => (
                    <div
                      key={idx}
                      className={`w-3 h-3 rounded-sm transition-colors ${done ? '' : 'bg-gray-200 dark:bg-white/10'}`}
                      style={done ? { backgroundColor: habit.color || '#3B82F6' } : undefined}
                      title={done ? 'Done' : 'Missed'}
                    />
                  ))}
                </div>

                <div className={`col-span-2 text-center flex items-center justify-center gap-1.5 text-sm font-semibold tabular-nums ${habit.streak > 0 ? 'text-orange-500' : cx.faint}`} title={`${habit.streak} day streak`}>
                  <Flame size={16} className={habit.streak > 0 ? 'fill-orange-500' : ''} />
                  {habit.streak}
                </div>

                <div className="col-span-3 sm:col-span-1 flex items-center justify-end gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                  <IconBtn
                    label="View monthly tracker"
                    onClick={() => {
                      setSelectedHabitId(habit.id);
                      setShowMonthlyView(true);
                    }}
                  >
                    <Calendar size={16} />
                  </IconBtn>
                  <IconBtn label="Edit habit" onClick={() => openEditModal(habit)}>
                    <Pencil size={16} />
                  </IconBtn>
                  <IconBtn label="Delete habit" danger onClick={() => handleDeleteHabit(habit.id)}>
                    <Trash2 size={16} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </>
        )}
      </Card>

      {/* Monthly Habit Tracker */}
      {showMonthlyView && (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className={`text-sm font-semibold ${cx.text}`}>Monthly tracker</h2>
              {habits.length > 0 && (
                <select
                  value={selectedHabitId || ''}
                  onChange={(e) => setSelectedHabitId(e.target.value || null)}
                  aria-label="Habit to show"
                  className={`${cx.input} !py-1.5`}
                >
                  <option value="">Select a habit</option>
                  {habits.map(h => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center gap-1">
              <IconBtn label="Previous month" onClick={() => navigateMonth(-1)}>
                <ChevronLeft size={18} />
              </IconBtn>
              <span className={`text-sm font-medium min-w-[140px] text-center ${cx.text}`}>
                {monthNames[monthlyViewDate.getMonth()]} {monthlyViewDate.getFullYear()}
              </span>
              <IconBtn label="Next month" onClick={() => navigateMonth(1)}>
                <ChevronRight size={18} />
              </IconBtn>
            </div>
          </div>

          {selectedHabit ? (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {weekDays.map(day => (
                  <div key={day} className={`text-center text-xs font-medium py-2 ${cx.muted}`}>
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
                      aria-pressed={isCompleted}
                      aria-label={`${date.toDateString()}: ${isCompleted ? 'completed' : 'not completed'}`}
                      title={isCompleted ? 'Completed' : 'Not completed'}
                      className={`aspect-square max-h-14 w-full rounded-lg transition-colors flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60
                        ${!isCurrentMonth ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}
                        ${isToday(date) ? 'ring-2 ring-blue-500' : ''}
                        ${isCompleted
                          ? ''
                          : isPast
                            ? 'bg-red-50 dark:bg-red-500/[0.07]'
                            : 'bg-gray-100 dark:bg-white/5'
                        }`}
                      style={isCompleted ? { backgroundColor: selectedHabit.color || '#3B82F6' } : undefined}
                    >
                      <span className={`text-sm font-medium tabular-nums ${isCompleted ? 'text-white' : cx.text}`}>
                        {date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Monthly Stats */}
              <div className={`mt-4 flex gap-4 text-xs ${cx.muted}`}>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: selectedHabit.color || '#3B82F6' }} />
                  <span>Completed</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20" />
                  <span>Missed</span>
                </div>
              </div>
            </>
          ) : (
            <Empty icon={<Calendar size={30} className={cx.muted} />} title="Select a habit to view monthly progress" />
          )}
        </Card>
      )}

      {/* Add/Edit Habit Modal */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title={editingHabit ? 'Edit habit' : 'New habit'}>
        <form
          onSubmit={(e) => { e.preventDefault(); handleSaveHabit(); }}
          className="flex flex-col min-h-0"
        >
          <ModalBody>
            <Field label="Habit name *">
              <input
                type="text"
                value={habitForm.name}
                onChange={(e) => setHabitForm({ ...habitForm, name: e.target.value })}
                placeholder="Read for 30 minutes"
                className={inputCls}
                autoFocus
              />
            </Field>

            <Field label="Description">
              <textarea
                value={habitForm.description}
                onChange={(e) => setHabitForm({ ...habitForm, description: e.target.value })}
                placeholder="Optional notes about this habit..."
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </Field>

            <div role="radiogroup" aria-label="Color">
              <span className={`block text-xs font-medium mb-1.5 ${cx.muted}`}>Color</span>
              <div className="flex flex-wrap gap-2">
                {colors.map(color => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={habitForm.color === color}
                    aria-label={`Color ${color}`}
                    title={color}
                    onClick={() => setHabitForm({ ...habitForm, color })}
                    className={`w-7 h-7 rounded-full transition-all flex items-center justify-center ${
                      habitForm.color === color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] ring-gray-400 dark:ring-gray-500' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {habitForm.color === color ? <Check size={14} className="text-white" /> : null}
                  </button>
                ))}
              </div>
            </div>
          </ModalBody>

          <ModalFooter>
            <button type="button" onClick={() => setShowAddModal(false)} className={cx.btnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={!habitForm.name.trim()} className={cx.btnPrimary}>
              {editingHabit ? 'Save' : 'Add habit'}
            </button>
          </ModalFooter>
        </form>
      </Modal>
    </PageShell>
  );
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-100 dark:bg-white/5 flex items-center justify-center shrink-0">{icon}</div>
        <div className="min-w-0">
          <p className={`text-xs ${cx.muted}`}>{label}</p>
          <p className={`text-lg font-semibold tabular-nums ${cx.text}`}>{value}</p>
        </div>
      </div>
    </Card>
  );
}

export default HabitsView;
