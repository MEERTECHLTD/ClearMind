import React, { useState, useEffect, useMemo } from 'react';
import { CalendarEvent, Task } from '../../types';
import { dbService, STORES } from '../../services/db';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  Trash2,
  Pencil,
  Calendar as CalendarIcon,
  CalendarPlus,
  Bell,
  Check,
} from 'lucide-react';
import { toISODate, compareTasks } from '../../shared/tasks';
import { useTaskData } from '../tasks/TaskContext';
import { TaskList } from '../tasks/TaskList';
import { FullPage, Modal, ModalBody, ModalFooter, Field, IconBtn, inputCls, cx } from '../ui-kit';

const CalendarView: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    date: '',
    startTime: '',
    endTime: '',
    location: '',
    color: '#3B82F6',
    reminder: false
  });

  const colors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];

  useEffect(() => {
    const loadEvents = async () => {
      const data = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
      setEvents(data);
    };
    loadEvents();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'events') {
        loadEvents();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
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
  }, [currentDate]);

  const getEventsForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return events.filter(e => e.date === dateStr);
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const navigateMonth = (direction: number) => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + direction, 1));
  };

  const openAddModal = (date?: Date) => {
    const targetDate = date || new Date();
    setEventForm({
      title: '',
      description: '',
      date: targetDate.toISOString().split('T')[0],
      startTime: '',
      endTime: '',
      location: '',
      color: '#3B82F6',
      reminder: false
    });
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const openEditModal = (event: CalendarEvent) => {
    setEventForm({
      title: event.title,
      description: event.description || '',
      date: event.date,
      startTime: event.startTime || '',
      endTime: event.endTime || '',
      location: event.location || '',
      color: event.color,
      reminder: event.reminder || false
    });
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.date) return;

    const eventData: CalendarEvent = {
      id: editingEvent?.id || Date.now().toString(),
      title: eventForm.title,
      description: eventForm.description || undefined,
      date: eventForm.date,
      startTime: eventForm.startTime || undefined,
      endTime: eventForm.endTime || undefined,
      location: eventForm.location || undefined,
      color: eventForm.color,
      reminder: eventForm.reminder,
      notified: editingEvent?.notified || false
    };

    await dbService.put(STORES.EVENTS, eventData);

    if (editingEvent) {
      setEvents(events.map(e => e.id === editingEvent.id ? eventData : e));
    } else {
      setEvents([...events, eventData]);
    }

    setShowEventModal(false);
    setEditingEvent(null);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    await dbService.delete(STORES.EVENTS, eventId);
    setEvents(events.filter(e => e.id !== eventId));
    setSelectedDate(null);
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  // Open tasks by (local) due date, shown in the grid and the day panel.
  const { tasks } = useTaskData();
  const openTasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      if (t.completed || t.deleted || !t.dueDate) continue;
      const list = m.get(t.dueDate);
      if (list) list.push(t); else m.set(t.dueDate, [t]);
    }
    for (const list of m.values()) list.sort(compareTasks);
    return m;
  }, [tasks]);
  const selectedISO = selectedDate ? toISODate(selectedDate) : null;
  const selectedDateTasks = selectedISO ? openTasksByDate.get(selectedISO) ?? [] : [];

  return (
    <FullPage
      title="Calendar"
      subtitle="Plan your events and stay organized."
      actions={
        <button onClick={() => openAddModal()} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
          <Plus size={16} />Add event
        </button>
      }
    >
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar grid */}
        <section className={`flex-1 min-w-0 rounded-xl border ${cx.border} ${cx.card} p-4`}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className={`flex-1 text-lg font-semibold ${cx.text}`}>
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h2>
            <button onClick={() => setCurrentDate(new Date())} className={cx.btnGhost}>Today</button>
            <IconBtn label="Previous month" onClick={() => navigateMonth(-1)}><ChevronLeft size={18} /></IconBtn>
            <IconBtn label="Next month" onClick={() => navigateMonth(1)}><ChevronRight size={18} /></IconBtn>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map(day => (
              <div key={day} className={`text-center text-xs font-medium py-1.5 ${cx.muted}`}>{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map(({ date, isCurrentMonth }, index) => {
              const dayEvents = getEventsForDate(date);
              const dayTasks = openTasksByDate.get(toISODate(date)) ?? [];
              const isSelected = selectedDate?.toDateString() === date.toDateString();
              const today = isToday(date);
              const label = `${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}${dayTasks.length ? `, ${dayTasks.length} task${dayTasks.length === 1 ? '' : 's'}` : ''}`;
              return (
                <div
                  key={index}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedDate(date)}
                  onDoubleClick={() => openAddModal(date)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDate(date); }
                  }}
                  className={`min-h-[84px] p-1.5 rounded-lg cursor-pointer border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40
                    ${isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : `border-transparent ${isCurrentMonth ? 'bg-gray-50 dark:bg-white/[0.03]' : ''} ${cx.hover}`}
                    ${isCurrentMonth ? '' : 'opacity-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full text-xs font-medium ${
                      today ? 'bg-blue-600 text-white' : isCurrentMonth ? cx.text : cx.faint
                    }`}>
                      {date.getDate()}
                    </span>
                    {dayTasks.length ? (
                      <span className={`inline-flex items-center gap-0.5 text-[10px] ${cx.muted}`} title={`${dayTasks.length} open task${dayTasks.length === 1 ? '' : 's'}`}>
                        <Check size={10} />{dayTasks.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 2).map(event => (
                      <div key={event.id} className="text-[10px] px-1 py-0.5 rounded truncate text-white font-medium" style={{ backgroundColor: event.color }}>
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className={`text-[10px] ${cx.muted}`}>+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Day panel */}
        <aside className={`lg:w-80 shrink-0 rounded-xl border ${cx.border} ${cx.card} p-4 self-start w-full`}>
          <h2 className={`text-sm font-semibold mb-3 flex items-center gap-2 ${cx.text}`}>
            <CalendarIcon size={16} className="text-blue-500" />
            {selectedDate
              ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              : 'Select a date'}
          </h2>

          {selectedDate ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <h3 className={`flex-1 text-xs font-semibold uppercase tracking-wide ${cx.muted}`}>Events</h3>
                <IconBtn label="Add event on this day" onClick={() => openAddModal(selectedDate)}><CalendarPlus size={16} /></IconBtn>
              </div>
              {selectedDateEvents.length === 0 ? (
                <p className={`text-sm py-2 ${cx.faint}`}>
                  No events on this day.{' '}
                  <button onClick={() => openAddModal(selectedDate)} className="text-blue-600 dark:text-blue-400 hover:underline">Add an event</button>
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDateEvents.map(event => (
                    <div key={event.id} className="p-2.5 rounded-lg border-l-4 bg-gray-50 dark:bg-white/[0.03]" style={{ borderLeftColor: event.color }}>
                      <div className="flex items-start gap-1">
                        <h4 className={`flex-1 min-w-0 text-sm font-medium ${cx.text}`}>{event.title}</h4>
                        {event.reminder ? <span title="Reminder on" className={`mt-1 ${cx.faint}`}><Bell size={12} aria-label="Reminder on" /></span> : null}
                        <IconBtn label="Edit event" onClick={() => openEditModal(event)} className="!p-1"><Pencil size={14} /></IconBtn>
                        <IconBtn label="Delete event" danger onClick={() => handleDeleteEvent(event.id)} className="!p-1"><Trash2 size={14} /></IconBtn>
                      </div>
                      {(event.startTime || event.endTime) && (
                        <div className={`flex items-center gap-1 text-xs mt-1 ${cx.muted}`}>
                          <Clock size={12} />
                          <span>
                            {formatTime(event.startTime || '')}
                            {event.endTime && ` - ${formatTime(event.endTime)}`}
                          </span>
                        </div>
                      )}
                      {event.location && (
                        <div className={`flex items-center gap-1 text-xs mt-1 ${cx.muted}`}>
                          <MapPin size={12} />
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.description && <p className={`text-xs mt-1.5 ${cx.muted}`}>{event.description}</p>}
                    </div>
                  ))}
                </div>
              )}

              <div className={`mt-4 pt-3 border-t ${cx.border}`}>
                <h3 className={`text-xs font-semibold uppercase tracking-wide mb-1 ${cx.muted}`}>
                  Tasks{selectedDateTasks.length ? <span className={`ml-1.5 normal-case font-normal ${cx.faint}`}>{selectedDateTasks.length}</span> : null}
                </h3>
                {/* Same rows + inline composer as the task views, pinned to this day. */}
                <TaskList key={selectedISO ?? ''} tasks={selectedDateTasks} hideDate showProject addDefaults={{ dueDate: selectedISO }} />
              </div>
            </>
          ) : (
            <p className={`text-sm py-6 text-center ${cx.muted}`}>Click a date to see its events and tasks.</p>
          )}
        </aside>
      </div>

      <Modal open={showEventModal} onClose={() => setShowEventModal(false)} title={editingEvent ? 'Edit event' : 'New event'}>
        <ModalBody>
          <Field label="Event title *">
            <input
              type="text"
              autoFocus
              value={eventForm.title}
              onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
              placeholder="Meeting, Birthday, etc."
              className={inputCls}
            />
          </Field>
          <Field label="Date *">
            <input type="date" value={eventForm.date} onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start time">
              <input type="time" value={eventForm.startTime} onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })} className={inputCls} />
            </Field>
            <Field label="End time">
              <input type="time" value={eventForm.endTime} onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Location">
            <input type="text" value={eventForm.location} onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })} placeholder="Office, Zoom, etc." className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} placeholder="Add details..." rows={2} className={`${inputCls} resize-none`} />
          </Field>
          <div>
            <span className={`block text-xs font-medium mb-1.5 ${cx.muted}`}>Color</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Event color">
              {colors.map(color => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={eventForm.color === color}
                  aria-label={`Color ${color}`}
                  title={color}
                  onClick={() => setEventForm({ ...eventForm, color })}
                  className={`w-7 h-7 rounded-full transition-transform ${eventForm.color === color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#0F1219] ring-blue-500 scale-110' : ''}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-pressed={eventForm.reminder}
            onClick={() => setEventForm({ ...eventForm, reminder: !eventForm.reminder })}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${
              eventForm.reminder ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : `${cx.border} ${cx.muted} ${cx.hover}`
            }`}
          >
            <Bell size={16} />Reminder
          </button>
        </ModalBody>
        <ModalFooter>
          <button onClick={() => setShowEventModal(false)} className={cx.btnGhost}>Cancel</button>
          <button onClick={handleSaveEvent} disabled={!eventForm.title.trim() || !eventForm.date} className={cx.btnPrimary}>
            {editingEvent ? 'Update event' : 'Create event'}
          </button>
        </ModalFooter>
      </Modal>
    </FullPage>
  );
};

export default CalendarView;
