import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { ViewState, UserProfile, Task, CalendarEvent, Application } from './types';
import { dbService, STORES, getLocalStoreName, getAllFirestoreCollections } from './services/db';
import { firebaseService, isFirebaseConfigured, FirebaseUser } from './services/firebase';
import { handleRealtimeUpdate, syncDeletedItems, dispatchSyncEvent } from './services/syncService';
import { 
  initializeNotifications, 
  startNotificationScheduler, 
  stopNotificationScheduler,
  isNotificationSupported,
  isNotificationPermitted,
  showNotification
} from './services/notificationService';

// Lazy load all view components for code splitting
const ProjectsView = lazy(() => import('./components/views/ProjectsView'));
const DashboardView = lazy(() => import('./components/views/DashboardView'));
const IrisView = lazy(() => import('./components/views/IrisView'));
const RantCorner = lazy(() => import('./components/views/RantCorner'));
const TasksView = lazy(() => import('./components/views/TasksView'));
const NotesView = lazy(() => import('./components/views/NotesView'));
const HabitsView = lazy(() => import('./components/views/HabitsView'));
const GoalsView = lazy(() => import('./components/views/GoalsView'));
const MilestonesView = lazy(() => import('./components/views/MilestonesView'));
const DailyLogView = lazy(() => import('./components/views/DailyLogView'));
const AnalyticsView = lazy(() => import('./components/views/AnalyticsView'));
const SettingsView = lazy(() => import('./components/views/SettingsView'));
const OnboardingView = lazy(() => import('./components/views/OnboardingView'));
const MindMapView = lazy(() => import('./components/views/MindMapView'));
const CalendarView = lazy(() => import('./components/views/CalendarView'));
const DailyMapperView = lazy(() => import('./components/views/DailyMapperView'));
const AuthView = lazy(() => import('./components/views/AuthView'));
const ApplicationsView = lazy(() => import('./components/views/ApplicationsView'));
const LearningVaultView = lazy(() => import('./components/views/LearningVaultView'));

// Loading fallback component
const ViewLoader = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-100 dark:bg-midnight">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-500 dark:text-gray-400 text-sm">Loading...</p>
    </div>
  </div>
);

// Helper function to get view from hash
const getViewFromHash = (): ViewState => {
  const hash = window.location.hash.slice(1); // Remove the '#'
  const validViews: ViewState[] = [
    'dashboard', 'projects', 'tasks', 'notes', 'habits', 
    'goals', 'milestones', 'iris', 'rant', 'dailylog', 
    'analytics', 'settings', 'mindmap', 'calendar', 'dailymapper', 'applications', 'learningvault'
  ];
  return validViews.includes(hash as ViewState) ? (hash as ViewState) : 'dashboard';
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(getViewFromHash()); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'connected'>('idle');
  const [showAuthView, setShowAuthView] = useState(false);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(() => {
    // Check if already installed via localStorage or standalone mode
    if (typeof window !== 'undefined') {
      const installed = localStorage.getItem('pwa-installed') === 'true';
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                           (window.navigator as any).standalone === true;
      return installed || isStandalone;
    }
    return false;
  });

  // Real-time sync cleanup ref
  const syncCleanupRef = React.useRef<(() => void) | null>(null);

  // Hash-based routing effect
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentView(getViewFromHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Set initial hash if not present
    if (!window.location.hash) {
      window.location.hash = 'dashboard';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(
          (registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
          },
          (err) => {
            console.log('ServiceWorker registration failed: ', err);
          }
        );
      });
    }

    // Auth Check - Check both local and Firebase
    const checkUser = async () => {
      try {
        // First check local profile
        const profile = await dbService.get<UserProfile>(STORES.PROFILE, 'current-user');
        if (profile) {
          setUserProfile(profile);
          setIsCheckingAuth(false);
          
          // Start real-time sync if cloud user
          if (profile.cloudUserId && isFirebaseConfigured()) {
            // Wait for Firebase auth to be ready
            const unsubscribe = firebaseService.onAuthChange((firebaseUser) => {
              if (firebaseUser) {
                startRealTimeSync();
              }
              unsubscribe();
            });
          }
          return;
        }

        // If Firebase is configured, listen for auth state
        if (isFirebaseConfigured()) {
          // Wait a moment for Firebase auth state
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const unsubscribe = firebaseService.onAuthChange(async (firebaseUser) => {
            if (firebaseUser) {
              // Firebase user found, create/update local profile
              const cloudProfile: UserProfile = {
                id: 'current-user',
                nickname: firebaseUser.displayName || 'User',
                email: firebaseUser.email || undefined,
                photoURL: firebaseUser.photoURL || undefined,
                provider: 'google', // Will be updated based on provider
                cloudUserId: firebaseUser.uid,
                joinedAt: new Date().toISOString()
              };
              await dbService.put(STORES.PROFILE, cloudProfile);
              setUserProfile(cloudProfile);
              
              // Start real-time sync
              startRealTimeSync();
            }
            setIsCheckingAuth(false);
          });
          
          // Cleanup on unmount
          return () => unsubscribe();
        } else {
          setIsCheckingAuth(false);
        }
      } catch (e) {
        console.error("Error loading profile", e);
        setIsCheckingAuth(false);
      }
    };
    checkUser();

    // Theme Check
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      setIsDarkMode(false);
      document.documentElement.classList.remove('dark');
    } else {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }

    // PWA Install Event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // Only show if not already installed
      if (localStorage.getItem('pwa-installed') !== 'true') {
        setDeferredPrompt(e);
      }
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Track when app is installed
    const handleAppInstalled = () => {
      console.log('PWA was installed');
      localStorage.setItem('pwa-installed', 'true');
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if running in standalone mode (already installed)
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        localStorage.setItem('pwa-installed', 'true');
        setIsAppInstalled(true);
        setDeferredPrompt(null);
      }
    };
    mediaQuery.addEventListener('change', handleDisplayModeChange);

    // Notification Logic Loop - Enhanced with service worker support
    const checkNotifications = async () => {
      if (!isNotificationSupported() || !isNotificationPermitted()) return;

      const tasks = await dbService.getAll<Task>(STORES.TASKS);
      const events = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
      const applications = await dbService.getAll<Application>(STORES.APPLICATIONS);
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Check tasks
      for (const task of tasks) {
        if (!task.completed && !task.notified && task.dueDate === today) {
          // Check if task has a specific time and it's within 5 minutes
          if (task.dueTime) {
            const [taskHour, taskMin] = task.dueTime.split(':').map(Number);
            const [nowHour, nowMin] = currentTime.split(':').map(Number);
            const taskMinutes = taskHour * 60 + taskMin;
            const nowMinutes = nowHour * 60 + nowMin;
            
            // Notify 5 minutes before or at the time
            if (taskMinutes - nowMinutes <= 5 && taskMinutes - nowMinutes >= 0) {
              await showNotification('⏰ Task Reminder', {
                body: `Coming up: ${task.title} at ${task.dueTime}`,
                tag: `task-${task.id}`,
                data: { type: 'task', id: task.id }
              });
              const updatedTask = { ...task, notified: true };
              await dbService.put(STORES.TASKS, updatedTask);
            }
          } else {
            // No specific time, notify once for today (between 8-9 AM)
            if (now.getHours() >= 8 && now.getHours() < 9) {
              await showNotification('📋 Task Due Today', {
                body: task.title,
                tag: `task-${task.id}`,
                data: { type: 'task', id: task.id }
              });
              const updatedTask = { ...task, notified: true };
              await dbService.put(STORES.TASKS, updatedTask);
            }
          }
        }
      }

      // Check calendar events
      for (const event of events) {
        if (!event.notified && event.reminder && event.date === today) {
          if (event.startTime) {
            const [eventHour, eventMin] = event.startTime.split(':').map(Number);
            const [nowHour, nowMin] = currentTime.split(':').map(Number);
            const eventMinutes = eventHour * 60 + eventMin;
            const nowMinutes = nowHour * 60 + nowMin;
            
            // Notify 15 minutes before
            if (eventMinutes - nowMinutes <= 15 && eventMinutes - nowMinutes >= 0) {
              await showNotification('📅 Event Starting Soon', {
                body: `${event.title} starts at ${event.startTime}${event.location ? ` - ${event.location}` : ''}`,
                tag: `event-${event.id}`,
                data: { type: 'event', id: event.id }
              });
              const updatedEvent = { ...event, notified: true };
              await dbService.put(STORES.EVENTS, updatedEvent);
            }
          } else {
            // All-day event, notify in the morning
            if (now.getHours() >= 8 && now.getHours() < 9) {
              await showNotification('📅 Event Today', {
                body: `${event.title}${event.location ? ` - ${event.location}` : ''}`,
                tag: `event-${event.id}`,
                data: { type: 'event', id: event.id }
              });
              const updatedEvent = { ...event, notified: true };
              await dbService.put(STORES.EVENTS, updatedEvent);
            }
          }
        }
      }

      // Check application deadlines
      for (const app of applications) {
        // Skip closed/submitted/accepted/rejected
        if (['closed', 'submitted', 'accepted', 'rejected'].includes(app.status)) continue;
        
        const deadline = app.submissionDeadline || app.closingDate;
        if (!deadline) continue;

        const deadlineDate = new Date(deadline);
        const daysUntilDeadline = Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const notifiedKey = `app-deadline-${app.id}-${daysUntilDeadline}`;
        const alreadyNotified = localStorage.getItem(notifiedKey);

        // Notify at 1 day, 3 days, and 7 days before deadline
        if (!alreadyNotified && (daysUntilDeadline === 1 || daysUntilDeadline === 3 || daysUntilDeadline === 7)) {
          const typeLabel = app.type.charAt(0).toUpperCase() + app.type.slice(1);
          const urgency = daysUntilDeadline === 1 ? '🚨' : daysUntilDeadline === 3 ? '⚠️' : '📋';
          
          await showNotification(`${urgency} ${typeLabel} Deadline`, {
            body: `${app.name}: ${daysUntilDeadline} day${daysUntilDeadline > 1 ? 's' : ''} left to apply!`,
            tag: `app-${app.id}-${daysUntilDeadline}`,
            data: { type: 'application', id: app.id }
          });
          
          localStorage.setItem(notifiedKey, 'true');
        }

        // Notify on the deadline day
        if (deadline === today && now.getHours() >= 8 && now.getHours() < 9) {
          const dayNotifiedKey = `app-deadline-today-${app.id}`;
          if (!localStorage.getItem(dayNotifiedKey)) {
            const typeLabel = app.type.charAt(0).toUpperCase() + app.type.slice(1);
            await showNotification(`🚨 ${typeLabel} Deadline TODAY`, {
              body: `${app.name} - Submit before end of day!`,
              tag: `app-today-${app.id}`,
              data: { type: 'application', id: app.id }
            });
            localStorage.setItem(dayNotifiedKey, 'true');
          }
        }
      }
    };

    // Initialize notification service
    initializeNotifications().then((initialized) => {
      if (initialized) {
        console.log('Notifications initialized successfully');
      }
    });

    // Check every 5 minutes instead of every minute (reduces DB reads significantly)
    const notificationInterval = setInterval(checkNotifications, 300000);
    // Delay initial check to not slow down app startup
    const initialCheckTimeout = setTimeout(checkNotifications, 5000);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearInterval(notificationInterval);
      clearTimeout(initialCheckTimeout);
      stopNotificationScheduler();
    };
  }, []);

  const toggleTheme = useCallback(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  }, [isDarkMode]);

  const handleInstallApp = useCallback(() => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
          localStorage.setItem('pwa-installed', 'true');
          setIsAppInstalled(true);
        }
        setDeferredPrompt(null);
      });
    }
  }, [deferredPrompt]);

  const handleLogout = useCallback(async () => {
      if(confirm("Are you sure you want to sign out? This will return you to the login screen.")) {
          // Cleanup real-time sync
          if (syncCleanupRef.current) {
            syncCleanupRef.current();
            syncCleanupRef.current = null;
          }
          setSyncStatus('idle');
          
          // Sign out from Firebase if configured
          if (isFirebaseConfigured()) {
            try {
              await firebaseService.logout();
            } catch (e) {
              console.error("Firebase logout error", e);
            }
          }
          await dbService.delete(STORES.PROFILE, 'current-user');
          setUserProfile(null);
          setCurrentView('dashboard');
      }
  }, []);

  const handleAuthSuccess = useCallback(async (cloudUser: any) => {
    const profile: UserProfile = {
      id: 'current-user',
      nickname: cloudUser.nickname || 'User',
      email: cloudUser.email,
      photoURL: cloudUser.photoURL,
      provider: cloudUser.provider,
      cloudUserId: cloudUser.id,
      joinedAt: cloudUser.joinedAt || new Date().toISOString()
    };
    await dbService.put(STORES.PROFILE, profile);
    setUserProfile(profile);
    setShowAuthView(false);
    
    // Start real-time sync after auth
    startRealTimeSync();
  }, []);

  // Throttle sync events to prevent excessive re-renders
  const lastSyncEventRef = React.useRef<Record<string, number>>({});
  const SYNC_THROTTLE_MS = 1000; // Minimum 1 second between sync events per store

  // Real-time sync setup using centralized sync service
  const startRealTimeSync = useCallback(() => {
    if (!isFirebaseConfigured()) return;
    
    // Clean up existing listeners
    if (syncCleanupRef.current) {
      syncCleanupRef.current();
    }

    // Get all Firestore collection names from centralized mapping
    const firestoreCollections = getAllFirestoreCollections();

    setSyncStatus('syncing');

    const cleanup = firebaseService.subscribeToAllCollections(
      firestoreCollections,
      async (firestoreCollection: string, cloudItems: any[]) => {
        try {
          // Use centralized mapping for collection -> store conversion
          const localStoreName = getLocalStoreName(firestoreCollection);
          
          // Handle real-time update using centralized sync service
          const { updated } = await handleRealtimeUpdate(firestoreCollection, cloudItems);
          
          // Get local items for deleted sync
          const localItems = await dbService.getAllIncludingDeleted<any>(localStoreName);
          
          // Sync any locally deleted items that are newer than cloud
          await syncDeletedItems(firestoreCollection, localItems as any, cloudItems);
          
          setSyncStatus('connected');
          
          // Throttle sync events to prevent excessive re-renders
          const now = Date.now();
          const lastEvent = lastSyncEventRef.current[localStoreName] || 0;
          if (now - lastEvent > SYNC_THROTTLE_MS) {
            lastSyncEventRef.current[localStoreName] = now;
            dispatchSyncEvent(localStoreName);
          }
        } catch (error) {
          console.error(`Sync error for ${firestoreCollection}:`, error);
        }
      }
    );

    syncCleanupRef.current = cleanup;
  }, []);

  // Cleanup real-time sync on unmount or logout
  useEffect(() => {
    return () => {
      if (syncCleanupRef.current) {
        syncCleanupRef.current();
      }
    };
  }, []);

  const handleSkipAuth = useCallback(() => {
    // Show local onboarding
    setShowAuthView(false);
  }, []);

  const handleViewChange = useCallback((view: ViewState) => {
    // Update hash instead of direct state - state will update via hashchange listener
    window.location.hash = view;
    // Close mobile menu on navigation
    setIsMobileMenuOpen(false);
  }, []);

  // Memoized content rendering to prevent unnecessary re-renders
  const viewContent = useMemo(() => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView user={userProfile} onNavigate={handleViewChange} />;
      case 'projects':
        return <ProjectsView />;
      case 'tasks':
        return <TasksView />;
      case 'applications':
        return <ApplicationsView />;
      case 'learningvault':
        return <LearningVaultView />;
      case 'notes':
        return <NotesView />;
      case 'habits':
        return <HabitsView />;
      case 'goals':
        return <GoalsView />;
      case 'milestones':
        return <MilestonesView />;
      case 'iris':
        return <IrisView />;
      case 'rant':
        return <RantCorner />;
      case 'dailylog':
        return <DailyLogView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'settings':
        return <SettingsView user={userProfile} onUpdateUser={setUserProfile} onLogout={handleLogout} />;
      case 'mindmap':
        return <MindMapView />;
      case 'calendar':
        return <CalendarView />;
      case 'dailymapper':
        return <DailyMapperView />;
      default:
        return <DashboardView user={userProfile} onNavigate={handleViewChange} />;
    }
  }, [currentView, userProfile, handleLogout, handleViewChange]);

  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center overflow-hidden">
            <img src="/clearmindlogo.png" alt="ClearMind" className="w-12 h-12 object-contain" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  // Show AuthView (Welcome/Choose screen) when no user is logged in
  if (!userProfile) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <AuthView 
          onAuthSuccess={handleAuthSuccess} 
          onSkip={(nickname?: string) => {
            // Create local user profile
            const localProfile: UserProfile = {
              id: 'current-user',
              nickname: nickname || 'User',
              joinedAt: new Date().toISOString(),
              provider: 'local'
            };
            dbService.put(STORES.PROFILE, localProfile);
            setUserProfile(localProfile);
          }} 
        />
      </Suspense>
    );
  }

  return (
    <div className="flex h-app-screen bg-midnight text-gray-200 overflow-hidden font-sans">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      <Sidebar 
        currentView={currentView} 
        onChangeView={handleViewChange} 
        isCollapsed={isSidebarCollapsed}
        toggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        user={userProfile}
        isMobileOpen={isMobileMenuOpen}
      />
      
      <main className="flex-1 flex flex-col min-w-0 min-h-0 bg-midnight transition-colors duration-300">
        <TopBar 
          user={userProfile} 
          toggleTheme={toggleTheme} 
          isDarkMode={isDarkMode}
          onInstallApp={handleInstallApp}
          canInstall={!!deferredPrompt && !isAppInstalled}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
          onNavigate={handleViewChange}
        />
        <div className="flex-1 relative overflow-auto touch-pan-y min-h-0">
          <Suspense fallback={<ViewLoader />}>
            {viewContent}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default App;