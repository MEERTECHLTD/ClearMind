import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { ViewState, UserProfile, Task, CalendarEvent } from './types';
import { dbService, STORES } from './services/db';
import { firebaseService, isFirebaseConfigured, FirebaseUser } from './services/firebase';

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
    'analytics', 'settings', 'mindmap', 'calendar', 'dailymapper', 'applications'
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
          
          const unsubscribe = firebaseService.onAuthChange(async (firebaseUser: FirebaseUser | null) => {
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

    // Notification Logic Loop
    const checkNotifications = async () => {
      if (Notification.permission !== 'granted') return;

      const tasks = await dbService.getAll<Task>(STORES.TASKS);
      const events = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
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
              new Notification('ClearMind Task Reminder', {
                body: `Coming up: ${task.title} at ${task.dueTime}`,
                icon: '/clearmindlogo.png',
                tag: `task-${task.id}`
              });
              const updatedTask = { ...task, notified: true };
              await dbService.put(STORES.TASKS, updatedTask);
            }
          } else {
            // No specific time, notify once for today
            new Notification('ClearMind Task Reminder', {
              body: `Today: ${task.title}`,
              icon: '/clearmindlogo.png',
              tag: `task-${task.id}`
            });
            const updatedTask = { ...task, notified: true };
            await dbService.put(STORES.TASKS, updatedTask);
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
              new Notification('ClearMind Event Reminder', {
                body: `${event.title} starts at ${event.startTime}${event.location ? ` - ${event.location}` : ''}`,
                icon: '/clearmindlogo.png',
                tag: `event-${event.id}`
              });
              const updatedEvent = { ...event, notified: true };
              await dbService.put(STORES.EVENTS, updatedEvent);
            }
          } else {
            // All-day event, notify in the morning
            if (now.getHours() >= 8 && now.getHours() < 9) {
              new Notification('ClearMind Event Today', {
                body: `${event.title}${event.location ? ` - ${event.location}` : ''}`,
                icon: '/clearmindlogo.png',
                tag: `event-${event.id}`
              });
              const updatedEvent = { ...event, notified: true };
              await dbService.put(STORES.EVENTS, updatedEvent);
            }
          }
        }
      }
    };

    // Check every minute
    const notificationInterval = setInterval(checkNotifications, 60000);
    // Also check on mount
    checkNotifications();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearInterval(notificationInterval);
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

  // Real-time sync setup
  const startRealTimeSync = useCallback(() => {
    if (!isFirebaseConfigured()) return;
    
    // Clean up existing listeners
    if (syncCleanupRef.current) {
      syncCleanupRef.current();
    }

    // Map Firestore collection names to IndexedDB store names
    const firestoreToLocalMap: Record<string, string> = {
      'tasks': 'tasks',
      'projects': 'projects',
      'notes': 'notes',
      'habits': 'habits',
      'goals': 'goals',
      'milestones': 'milestones',
      'dailyLogs': 'logs',
      'rants': 'rants',
      'events': 'events',
      'timeblocks': 'dailymapper',
      'mindmaps': 'mindmaps',
      'applications': 'applications',
      'iris_conversations': 'iris_conversations'
    };

    const storeNames = [
      'tasks', 'projects', 'notes', 'habits', 'goals', 
      'milestones', 'dailyLogs', 'rants', 'events', 'timeblocks', 'mindmaps',
      'applications', 'iris_conversations'
    ];

    setSyncStatus('syncing');

    const cleanup = firebaseService.subscribeToAllCollections(
      storeNames,
      async (storeName: string, cloudItems: any[]) => {
        try {
          // Convert Firestore collection name to IndexedDB store name
          const localStoreName = firestoreToLocalMap[storeName] || storeName;
          
          // Get all local items INCLUDING deleted ones for proper sync comparison
          const localItems = await (dbService as any).getAllIncludingDeleted(localStoreName);
          
          // Create a map for quick lookup
          const localMap = new Map(localItems.map((item: any) => [item.id, item]));
          const cloudMap = new Map(cloudItems.map((item: any) => [item.id, item]));
          
          // Merge: newest wins based on updatedAt timestamp
          for (const cloudItem of cloudItems) {
            const localItem = localMap.get(cloudItem.id);
            
            if (!localItem) {
              // New item from cloud - add to local only if not deleted
              if (!cloudItem.deleted) {
                await dbService.put(localStoreName as any, cloudItem);
              }
            } else {
              // Compare timestamps - newest wins
              const localTime = localItem.updatedAt || localItem.lastEdited || localItem.syncedAt || '0';
              const cloudTime = cloudItem.updatedAt || cloudItem.lastEdited || cloudItem.syncedAt || '0';
              
              if (new Date(cloudTime) > new Date(localTime)) {
                // Cloud is newer - update local (this respects soft-delete flags)
                await dbService.put(localStoreName as any, cloudItem);
              }
              // If local is newer (e.g., local delete is newer than cloud update), local wins - no action needed
            }
          }
          
          // Push locally deleted items to cloud if they don't exist in cloud or cloud version is older
          for (const localItem of localItems as any[]) {
            if (localItem.deleted) {
              const cloudItem = cloudMap.get(localItem.id);
              if (!cloudItem || new Date(localItem.updatedAt || '0') > new Date(cloudItem.updatedAt || cloudItem.syncedAt || '0')) {
                // Local soft-delete is newer - push to cloud
                try {
                  await firebaseService.pushItemToCloud(storeName, localItem);
                } catch (e) {
                  console.warn('Failed to sync deleted item to cloud:', e);
                }
              }
            }
          }
          
          setSyncStatus('connected');
          
          // Trigger a re-render by dispatching a custom event (use localStoreName for consistency)
          window.dispatchEvent(new CustomEvent('clearmind-sync', { detail: { store: localStoreName } }));
        } catch (error) {
          console.error(`Sync error for ${storeName}:`, error);
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
    <div className="flex h-screen bg-midnight text-gray-200 overflow-hidden font-sans">
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
      
      <main className="flex-1 flex flex-col min-w-0 bg-midnight transition-colors duration-300">
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
        <div className="flex-1 relative overflow-auto touch-pan-y">
          <Suspense fallback={<ViewLoader />}>
            {viewContent}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default App;