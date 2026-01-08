import React, { useState, useEffect, useMemo } from 'react';
import { CalendarEvent } from '../../types';
import { dbService, STORES } from '../../services/db';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  X, 
  Save, 
  Clock, 
  MapPin, 
  Trash2, 
  Edit2,
  Calendar as CalendarIcon,
  Bell
} from 'lucide-react';

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

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Calendar</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Plan your events and stay organized.</p>
        </div>
        <button 
          onClick={() => openAddModal()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Event
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Calendar Grid */}
        <div className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none">
          {/* Month Navigation */}
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => navigateMonth(-1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronLeft size={20} className="text-gray-500" />
            </button>
            <h3 className="text-xl font-bold dark:text-white text-gray-900">
              {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
            <button 
              onClick={() => navigateMonth(1)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <ChevronRight size={20} className="text-gray-500" />
            </button>
          </div>

          {/* Week Days Header */}
          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-center text-xs font-semibold text-gray-500 uppercase py-2">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 gap-1">
            {daysInMonth.map(({ date, isCurrentMonth }, index) => {
              const dayEvents = getEventsForDate(date);
              const isSelected = selectedDate?.toDateString() === date.toDateString();
              
              return (
                <div
                  key={index}
                  onClick={() => setSelectedDate(date)}
                  onDoubleClick={() => openAddModal(date)}
                  className={`min-h-[80px] p-2 rounded-lg cursor-pointer transition-all border-2
                    ${isCurrentMonth 
                      ? 'dark:bg-gray-800/30 bg-gray-50' 
                      : 'dark:bg-gray-900/30 bg-gray-100/50 opacity-50'}
                    ${isToday(date) ? 'border-blue-500' : 'border-transparent'}
                    ${isSelected ? 'ring-2 ring-blue-400 dark:bg-gray-800 bg-white' : ''}
                    hover:bg-gray-100 dark:hover:bg-gray-800`}
                >
                  <span className={`text-sm font-medium ${
                    isToday(date) 
                      ? 'text-blue-500' 
                      : isCurrentMonth 
                        ? 'dark:text-white text-gray-900' 
                        : 'text-gray-400'
                  }`}>
                    {date.getDate()}
                  </span>
                  
                  <div className="mt-1 space-y-1">
                    {dayEvents.slice(0, 2).map(event => (
                      <div 
                        key={event.id}
                        className="text-[10px] px-1 py-0.5 rounded truncate text-white font-medium"
                        style={{ backgroundColor: event.color }}
                      >
                        {event.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-gray-500">
                        +{dayEvents.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Event Details Panel */}
        <div className="lg:w-80 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none">
          <h4 className="font-bold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <CalendarIcon size={18} className="text-blue-500" />
            {selectedDate 
              ? selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
              : 'Select a date'}
          </h4>

          {selectedDate ? (
            <>
              {selectedDateEvents.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CalendarIcon size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No events on this day</p>
                  <button 
                    onClick={() => openAddModal(selectedDate)}
                    className="mt-3 text-blue-500 text-sm hover:underline"
                  >
                    Add an event
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDateEvents.map(event => (
                    <div 
                      key={event.id}
                      className="p-3 rounded-lg border-l-4 dark:bg-gray-800/50 bg-gray-50"
                      style={{ borderLeftColor: event.color }}
                    >
                      <div className="flex items-start justify-between">
                        <h5 className="font-medium dark:text-white text-gray-900">{event.title}</h5>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => openEditModal(event)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          >
                            <Edit2 size={14} className="text-gray-400 hover:text-blue-500" />
                          </button>
                          <button 
                            onClick={() => handleDeleteEvent(event.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                          >
                            <Trash2 size={14} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                      </div>
                      
                      {(event.startTime || event.endTime) && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <Clock size={12} />
                          <span>
                            {formatTime(event.startTime || '')}
                            {event.endTime && ` - ${formatTime(event.endTime)}`}
                          </span>
                        </div>
                      )}
                      
                      {event.location && (
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                          <MapPin size={12} />
                          <span>{event.location}</span>
                        </div>
                      )}
                      
                      {event.description && (
                        <p className="text-xs text-gray-400 mt-2">{event.description}</p>
                      )}
                    </div>
                  ))}
                  
                  <button 
                    onClick={() => openAddModal(selectedDate)}
                    className="w-full py-2 border border-dashed dark:border-gray-700 border-gray-300 rounded-lg text-gray-500 hover:text-blue-500 hover:border-blue-500 text-sm transition-colors"
                  >
                    + Add another event
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">Click on a date to view or add events</p>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold dark:text-white text-gray-900">
                {editingEvent ? 'Edit Event' : 'New Event'}
              </h3>
              <button 
                onClick={() => setShowEventModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Event Title *</label>
                <input
                  type="text"
                  value={eventForm.title}
                  onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })}
                  placeholder="Meeting, Birthday, etc."
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Date *</label>
                <input
                  type="date"
                  value={eventForm.date}
                  onChange={(e) => setEventForm({ ...eventForm, date: e.target.value })}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={eventForm.startTime}
                    onChange={(e) => setEventForm({ ...eventForm, startTime: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">End Time</label>
                  <input
                    type="time"
                    value={eventForm.endTime}
                    onChange={(e) => setEventForm({ ...eventForm, endTime: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Location</label>
                <input
                  type="text"
                  value={eventForm.location}
                  onChange={(e) => setEventForm({ ...eventForm, location: e.target.value })}
                  placeholder="Office, Zoom, etc."
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  value={eventForm.description}
                  onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })}
                  placeholder="Add details..."
                  rows={2}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Color</label>
                <div className="flex gap-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => setEventForm({ ...eventForm, color })}
                      className={`w-8 h-8 rounded-full transition-all ${
                        eventForm.color === color ? 'ring-2 ring-offset-2 ring-offset-midnight-light ring-white scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setEventForm({ ...eventForm, reminder: !eventForm.reminder })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                    eventForm.reminder 
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500' 
                      : 'border-gray-300 dark:border-gray-700 text-gray-500'
                  }`}
                >
                  <Bell size={16} />
                  <span className="text-sm">Reminder</span>
                </button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveEvent}
                disabled={!eventForm.title.trim() || !eventForm.date}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingEvent ? 'Update Event' : 'Create Event'}
              </button>
              <button
                onClick={() => setShowEventModal(false)}
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

export default CalendarView;
