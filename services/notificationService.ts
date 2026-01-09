import { dbService, STORES } from './db';
import { Task, Application, CalendarEvent } from '../types';

// Notification preferences storage key
const NOTIFICATION_PREFS_KEY = 'clearmind-notification-prefs';

export interface NotificationPreferences {
  enabled: boolean;
  taskReminders: boolean;
  applicationDeadlines: boolean;
  calendarReminders: boolean;
  advanceNoticeHours: number; // How many hours before deadline to notify
  dailySummary: boolean;
  dailySummaryTime: string; // HH:MM format
}

const defaultPrefs: NotificationPreferences = {
  enabled: true,
  taskReminders: true,
  applicationDeadlines: true,
  calendarReminders: true,
  advanceNoticeHours: 24, // 24 hours before
  dailySummary: true,
  dailySummaryTime: '08:00'
};

// Check if notifications are supported
export const isNotificationSupported = (): boolean => {
  return 'Notification' in window && 'serviceWorker' in navigator;
};

// Check if notifications are permitted
export const isNotificationPermitted = (): boolean => {
  return Notification.permission === 'granted';
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
};

// Get notification preferences
export const getNotificationPrefs = (): NotificationPreferences => {
  try {
    const saved = localStorage.getItem(NOTIFICATION_PREFS_KEY);
    if (saved) {
      return { ...defaultPrefs, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load notification preferences:', e);
  }
  return defaultPrefs;
};

// Save notification preferences
export const saveNotificationPrefs = (prefs: NotificationPreferences): void => {
  try {
    localStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save notification preferences:', e);
  }
};

// Register service worker for push notifications
export const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered:', registration);
    return registration;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return null;
  }
};

// Show a notification using the Notification API (foreground)
export const showNotification = async (
  title: string,
  options: NotificationOptions & { tag?: string; data?: any }
): Promise<void> => {
  if (!isNotificationPermitted()) {
    console.warn('Notification permission not granted');
    return;
  }

  try {
    // Try to use service worker notification for better mobile support
    const registration = await navigator.serviceWorker.ready;
    // Extended notification options for service worker (supports more options)
    const swOptions: NotificationOptions & { vibrate?: number[]; requireInteraction?: boolean } = {
      icon: '/clearmindlogo.png',
      badge: '/clearmindlogo.png',
      ...options
    };
    // Add vibration pattern for mobile
    (swOptions as any).vibrate = [200, 100, 200];
    (swOptions as any).requireInteraction = true;
    
    await registration.showNotification(title, swOptions);
  } catch (error) {
    // Fallback to regular Notification API
    console.warn('Service worker notification failed, using fallback:', error);
    new Notification(title, {
      icon: '/clearmindlogo.png',
      ...options
    });
  }
};

// Format time for display
const formatTime = (time: string): string => {
  if (!time) return '';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
};

// Format date for display
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Check for upcoming task deadlines and notify
export const checkTaskDeadlines = async (): Promise<void> => {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.taskReminders || !isNotificationPermitted()) return;

  try {
    const tasks = await dbService.getAll<Task>(STORES.TASKS);
    const now = new Date();
    const advanceMs = prefs.advanceNoticeHours * 60 * 60 * 1000;

    for (const task of tasks) {
      if (task.completed || task.notified) continue;
      if (!task.dueDate) continue;

      // Combine date and time for deadline
      let deadline: Date;
      if (task.dueTime) {
        deadline = new Date(`${task.dueDate}T${task.dueTime}`);
      } else {
        deadline = new Date(`${task.dueDate}T23:59:59`);
      }

      const timeTillDeadline = deadline.getTime() - now.getTime();

      // Notify if within advance notice window and not past
      if (timeTillDeadline > 0 && timeTillDeadline <= advanceMs) {
        const hoursLeft = Math.round(timeTillDeadline / (60 * 60 * 1000));
        const timeStr = task.dueTime ? ` at ${formatTime(task.dueTime)}` : '';
        
        await showNotification(`⏰ Task Due Soon: ${task.title}`, {
          body: hoursLeft > 1 
            ? `Due in ${hoursLeft} hours (${formatDate(task.dueDate)}${timeStr})`
            : `Due very soon! (${formatDate(task.dueDate)}${timeStr})`,
          tag: `task-${task.id}`,
          data: { type: 'task', id: task.id }
        });

        // Mark as notified to prevent duplicate notifications
        await dbService.put(STORES.TASKS, { ...task, notified: true });
      }

      // Notify if deadline just passed (within last hour) 
      if (timeTillDeadline < 0 && timeTillDeadline > -3600000) {
        await showNotification(`⚠️ Task Overdue: ${task.title}`, {
          body: `Was due ${formatDate(task.dueDate)}${task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}`,
          tag: `task-overdue-${task.id}`,
          data: { type: 'task', id: task.id }
        });
        
        await dbService.put(STORES.TASKS, { ...task, notified: true });
      }
    }
  } catch (error) {
    console.error('Failed to check task deadlines:', error);
  }
};

// Check for upcoming application deadlines and notify
export const checkApplicationDeadlines = async (): Promise<void> => {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.applicationDeadlines || !isNotificationPermitted()) return;

  try {
    const applications = await dbService.getAll<Application>(STORES.APPLICATIONS);
    const now = new Date();
    const advanceMs = prefs.advanceNoticeHours * 60 * 60 * 1000;

    // Also notify 1 day, 3 days, and 7 days before for applications
    const notifyThresholds = [
      { hours: 24, label: '1 day' },
      { hours: 72, label: '3 days' },
      { hours: 168, label: '1 week' }
    ];

    for (const app of applications) {
      // Skip closed/submitted/accepted/rejected applications
      if (['closed', 'submitted', 'accepted', 'rejected'].includes(app.status)) continue;
      
      const deadline = app.submissionDeadline || app.closingDate;
      if (!deadline) continue;

      const deadlineDate = new Date(`${deadline}T23:59:59`);
      const timeTillDeadline = deadlineDate.getTime() - now.getTime();

      // Skip if already past
      if (timeTillDeadline < 0) continue;

      // Check each threshold
      for (const threshold of notifyThresholds) {
        const thresholdMs = threshold.hours * 60 * 60 * 1000;
        const notifiedKey = `app-notified-${app.id}-${threshold.hours}`;
        const alreadyNotified = localStorage.getItem(notifiedKey);

        if (!alreadyNotified && timeTillDeadline <= thresholdMs) {
          const typeLabel = app.type.charAt(0).toUpperCase() + app.type.slice(1);
          
          await showNotification(`📋 ${typeLabel} Deadline: ${app.name}`, {
            body: `${threshold.label} left to apply! Deadline: ${formatDate(deadline)}`,
            tag: `app-${app.id}-${threshold.hours}`,
            data: { type: 'application', id: app.id }
          });

          // Mark this threshold as notified
          localStorage.setItem(notifiedKey, 'true');
        }
      }
    }
  } catch (error) {
    console.error('Failed to check application deadlines:', error);
  }
};

// Check for calendar event reminders
export const checkCalendarReminders = async (): Promise<void> => {
  const prefs = getNotificationPrefs();
  if (!prefs.enabled || !prefs.calendarReminders || !isNotificationPermitted()) return;

  try {
    const events = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
    const now = new Date();

    for (const event of events) {
      if (!event.reminder || event.notified) continue;

      // Calculate event start time
      let eventStart: Date;
      if (event.startTime) {
        eventStart = new Date(`${event.date}T${event.startTime}`);
      } else {
        eventStart = new Date(`${event.date}T09:00:00`); // Default to 9 AM
      }

      const timeTillEvent = eventStart.getTime() - now.getTime();

      // Notify 30 minutes before
      if (timeTillEvent > 0 && timeTillEvent <= 30 * 60 * 1000) {
        const timeStr = event.startTime ? ` at ${formatTime(event.startTime)}` : '';
        
        await showNotification(`📅 Upcoming: ${event.title}`, {
          body: event.location 
            ? `Starting soon${timeStr} at ${event.location}`
            : `Starting soon${timeStr}`,
          tag: `event-${event.id}`,
          data: { type: 'event', id: event.id }
        });

        await dbService.put(STORES.EVENTS, { ...event, notified: true });
      }
    }
  } catch (error) {
    console.error('Failed to check calendar reminders:', error);
  }
};

// Run all notification checks
export const runNotificationChecks = async (): Promise<void> => {
  await checkTaskDeadlines();
  await checkApplicationDeadlines();
  await checkCalendarReminders();
};

// Start the notification scheduler
let notificationInterval: NodeJS.Timeout | null = null;

export const startNotificationScheduler = (): void => {
  // Clear any existing interval
  if (notificationInterval) {
    clearInterval(notificationInterval);
  }

  // Run checks immediately
  runNotificationChecks();

  // Run checks every 5 minutes
  notificationInterval = setInterval(() => {
    runNotificationChecks();
  }, 5 * 60 * 1000);

  console.log('Notification scheduler started');
};

export const stopNotificationScheduler = (): void => {
  if (notificationInterval) {
    clearInterval(notificationInterval);
    notificationInterval = null;
    console.log('Notification scheduler stopped');
  }
};

// Initialize notifications (call on app start)
export const initializeNotifications = async (): Promise<boolean> => {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported');
    return false;
  }

  // Register service worker
  await registerServiceWorker();

  // Check if we have permission
  if (isNotificationPermitted()) {
    startNotificationScheduler();
    return true;
  }

  return false;
};
