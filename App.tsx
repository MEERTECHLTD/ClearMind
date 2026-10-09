import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { TaskProvider } from './components/tasks/TaskContext';
import { applyTheme, cachedThemePref, getThemePref, onThemeChange } from './services/theme';
import { useStore } from './components/tasks/store';
import { savePreferences } from './components/tasks/actions';
// Todoist-style task views — the default experience, so loaded eagerly (the
// sidebar uses the same module).
import {
  InboxView, TodayView, UpcomingView, SearchView, FiltersLabelsView, CompletedView, ProjectView, LabelView, FilterView,
} from './components/tasks/TaskViews';
import { ViewState, UserProfile, Task, CalendarEvent, Preferences } from './types';
import { dbService, STORES, getLocalStoreName, getAllFirestoreCollections } from './services/db';
import { firebaseService, isFirebaseConfigured, FirebaseUser, auth } from './services/firebase';
import { dispatchAllSyncEvents } from './services/syncService';
import { startSync, stopSync } from './services/syncEngine';
import { 
  initializeNotifications, 
  startNotificationScheduler, 
  stopNotificationScheduler,
  isNotificationSupported,
  isNotificationPermitted,
  showNotification
} from './services/notificationService';
import { startWebReminders } from './services/webReminders';
import { registerServiceWorker, initInstall, useInstall, promptInstall, ANDROID_APP_URL, type InstallMode } from './services/pwa';
import { lazyWithRetry } from './utils/lazyWithRetry';
import { ViewErrorBoundary } from './components/ViewErrorBoundary';
import { UpdatePrompt, InstallInstructions } from './components/PwaPrompts';
import { redirectFor } from './utils/routes';

// Lazy load all view components for code splitting. lazyWithRetry recovers from
// chunks that vanished in a deploy (retry, then one guarded reload).
const ProjectsView = lazyWithRetry(() => import('./components/views/ProjectsView'));
const IrisView = lazyWithRetry(() => import('./components/views/IrisView'));
const JournalView = lazyWithRetry(() => import('./components/views/JournalView'));
const VaultView = lazyWithRetry(() => import('./components/views/VaultView'));
const HabitsView = lazyWithRetry(() => import('./components/views/HabitsView'));
const GoalsView = lazyWithRetry(() => import('./components/views/GoalsView'));
const MilestonesView = lazyWithRetry(() => import('./components/views/MilestonesView'));
const InsightsView = lazyWithRetry(() => import('./components/views/InsightsView'));
const SettingsHub = lazyWithRetry(() => import('./components/settings/SettingsHub'));
const OnboardingView = lazyWithRetry(() => import('./components/views/OnboardingView'));
const MindMapView = lazyWithRetry(() => import('./components/views/MindMapView'));
const CalendarView = lazyWithRetry(() => import('./components/views/CalendarView'));
const DailyMapperView = lazyWithRetry(() => import('./components/views/DailyMapperView'));
const AuthView = lazyWithRetry(() => import('./components/views/AuthView'));
// Applications tracker + AI Reviewer, as tabs of one destination.
const ApplicationsWorkspace = lazyWithRetry(() => import('./components/views/ApplicationsWorkspace'));
const LearningVaultView = lazyWithRetry(() => import('./components/views/LearningVaultView'));
const ActivityView = lazyWithRetry(() => import('./components/views/ActivityView'));
const TemplatesView = lazyWithRetry(() => import('./components/views/TemplatesView'));


// Loading fallback component
const ViewLoader = () => (
  <div className="flex-1 flex items-center justify-center bg-slate-100 dark:bg-midnight">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-slate-500 dark:text-gray-400 text-sm">Loading...</p>
    </div>
  </div>
);

// Hash routes: '#today', '#project/<id>', '#insights?tab=life'. Folded-in
// destinations (#dashboard, #productivity, #analytics, #dailylog, #rant,
// #reviewer, #tasks) redirect to their new home — see utils/routes.ts.
const VALID_VIEWS: ViewState[] = [
  'projects', 'notes', 'habits',
  'goals', 'milestones', 'iris',
  'settings', 'mindmap', 'calendar', 'dailymapper', 'applications', 'learningvault',
  'inbox', 'today', 'upcoming', 'search', 'filters', 'completed', 'project', 'label', 'filter',
  'activity', 'templates', 'insights', 'journal',
];
const parseHash = (): { view: ViewState; param?: string } => {
  const redirect = redirectFor(window.location.hash);
  if (redirect) {
    // Replace (not push) so Back skips the old route instead of bouncing on it.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${redirect}`);
  }
  // Optional "?…" after the route carries view options (e.g. #today?task=<id>).
  let path = window.location.hash.slice(1).split('?')[0];
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  const [head, ...rest] = path.split('/');
  const view = head as ViewState;
  if (!VALID_VIEWS.includes(view)) return { view: 'today' };
  return { view, param: rest.join('/') || undefined };
};
const getViewFromHash = (): ViewState => parseHash().view;

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('joinWorkspace')
      ? 'applications' // an invite link opens straight to Applications, which handles the join
      : getViewFromHash()
  );
  const [viewParam, setViewParam] = useState<string | undefined>(() => (typeof window !== 'undefined' ? parseHash().param : undefined));
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'connected'>('idle');
  const [showAuthView, setShowAuthView] = useState(false);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // PWA install: what the top bar's install button does on this browser.
  const install = useInstall();
  const [installHelp, setInstallHelp] = useState<InstallMode | null>(null);

  // Real-time sync cleanup ref
  const syncCleanupRef = React.useRef<(() => void) | null>(null);

  // Hash-based routing effect
  useEffect(() => {
    const handleHashChange = () => {
      const { view, param } = parseHash();
      setCurrentView(view);
      setViewParam(param);
      setIsMobileMenuOpen(false);
    };

    window.addEventListener('hashchange', handleHashChange);
    
    // Set initial hash if not present
    if (!window.location.hash) {
      window.location.hash = 'today';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    // Service worker (production builds only) + "new version" prompt, and the
    // install-button state. The old registration waited for window 'load',
    // which has usually already fired by the time this effect runs.
    void registerServiceWorker();
    initInstall();

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

    // Theme: Light / Dark / System (synced preference, cached locally).
    setIsDarkMode(applyTheme(cachedThemePref()));

    // Notification Logic Loop - Enhanced with service worker support
    const checkNotifications = async () => {
      if (!isNotificationSupported() || !isNotificationPermitted()) return;

      const events = await dbService.getAll<CalendarEvent>(STORES.EVENTS);
      const today = new Date().toISOString().split('T')[0];
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      // Task reminders: services/webReminders (shared planner, synced prefs).

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

      // NOTE: application-deadline notifications are owned solely by
      // notificationService.checkApplicationDeadlines (a single engine, driven by
      // each application's reminderLeadDays). The duplicate loop that used to live
      // here was removed to stop double-firing. See services/notificationService.ts.
    };

    const stopReminders = startWebReminders();
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
      clearInterval(notificationInterval);
      clearTimeout(initialCheckTimeout);
      stopNotificationScheduler();
      stopReminders();
    };
  }, []);

  // Quick toggle in the top bar: switch to the opposite explicit theme (synced).
  const toggleTheme = useCallback(() => {
    const next = isDarkMode ? 'light' : 'dark';
    setIsDarkMode(applyTheme(next));
    savePreferences({ theme: next });
  }, [isDarkMode]);

  // Apply the synced theme preference whenever it changes (any device).
  const prefsSnap = useStore<Preferences>(STORES.PREFERENCES);
  useEffect(() => {
    const p = prefsSnap.items[0]?.theme;
    if (p && p !== getThemePref()) setIsDarkMode(applyTheme(p));
  }, [prefsSnap.items]);
  useEffect(() => onThemeChange(setIsDarkMode), []);

  // Install button: native PWA prompt on Chromium/Edge, Add-to-Dock / Home
  // Screen steps on Safari, and the Play Store app on Android.
  const handleInstallApp = useCallback(() => {
    switch (install.mode) {
      case 'prompt':
        void promptInstall();
        break;
      case 'android-app':
        window.open(ANDROID_APP_URL, '_blank', 'noopener,noreferrer');
        break;
      case 'safari-mac':
      case 'ios':
        setInstallHelp(install.mode);
        break;
    }
  }, [install.mode]);

  /** Sign out without asking (used after account deletion, where cancelling makes no sense). */
  const signOutNow = useCallback(async () => {
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
    setCurrentView('today');
  }, []);

  const handleLogout = useCallback(async () => {
    if (confirm("Are you sure you want to sign out? This will return you to the login screen.")) await signOutNow();
  }, [signOutNow]);

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
  // Realtime, field-level, offline-safe sync (services/syncEngine). Local data is
  // scoped to its account: a different account signing in on this browser
  // starts from a clean local database instead of inheriting someone's data.
  const startRealTimeSync = useCallback(() => {
    if (!isFirebaseConfigured()) return;
    void (async () => {
      const uid = auth?.currentUser?.uid;
      if (!uid) return;
      try {
        const owner = localStorage.getItem('cm.localOwnerUid');
        if (owner && owner !== uid) {
          stopSync();
          await dbService.wipeAll();
          
          dispatchAllSyncEvents();
        }
        localStorage.setItem('cm.localOwnerUid', uid);
      } catch (e) {
        console.warn('owner check failed', e);
      }
      setSyncStatus('syncing');
      await startSync();
      setSyncStatus('connected');
    })();
    syncCleanupRef.current = () => stopSync();
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
      case 'projects':
        return <ProjectsView />;
      case 'today':
        return <TodayView />;
      case 'inbox':
        return <InboxView />;
      case 'upcoming':
        return <UpcomingView />;
      case 'search':
        return <SearchView />;
      case 'filters':
        return <FiltersLabelsView />;
      case 'completed':
        return <CompletedView />;
      case 'project':
        return <ProjectView id={viewParam ?? ''} />;
      case 'label':
        return <LabelView id={viewParam ?? ''} />;
      case 'filter':
        return <FilterView id={viewParam ?? ''} />;
      case 'insights':
        return <InsightsView />;
      case 'activity':
        return <ActivityView projectId={viewParam} />;
      case 'templates':
        return <TemplatesView />;
      case 'applications':
        return <ApplicationsWorkspace />;
      case 'learningvault':
        return <LearningVaultView />;
      case 'notes':
        return <VaultView noteId={viewParam} />;
      case 'habits':
        return <HabitsView />;
      case 'goals':
        return <GoalsView />;
      case 'milestones':
        return <MilestonesView />;
      case 'iris':
        return <IrisView />;
      case 'journal':
        return <JournalView />;
      case 'settings':
        return <SettingsHub user={userProfile} onUpdateUser={setUserProfile} onLogout={handleLogout} onAccountDeleted={signOutNow} />;
      case 'mindmap':
        return <MindMapView />;
      case 'calendar':
        return <CalendarView />;
      case 'dailymapper':
        return <DailyMapperView />;
      default:
        return <TodayView />;
    }
  }, [currentView, viewParam, userProfile, handleLogout]);

  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300 dark:from-slate-900 dark:via-gray-900 dark:to-slate-800 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center overflow-hidden">
            <img src="/clearmindlogo-256.png" alt="ClearMind" className="w-12 h-12 object-contain" />
          </div>
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  // Show AuthView (Welcome/Choose screen) when no user is logged in
  if (!userProfile) {
    return (
      <ViewErrorBoundary resetKey="auth">
      <UpdatePrompt />
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
      </ViewErrorBoundary>
    );
  }

  return (
    <TaskProvider>
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
        currentParam={viewParam}
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
          canInstall={install.mode !== 'none'}
          installLabel={install.mode === 'android-app' ? 'Get the App' : 'Install App'}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
          onNavigate={handleViewChange}
        />
        <div className="flex-1 relative overflow-auto touch-pan-y min-h-0">
          {/* The boundary resets on route change, so a view that failed to load
              (e.g. a chunk removed by a deploy) recovers when you navigate. */}
          <ViewErrorBoundary resetKey={`${currentView}/${viewParam ?? ''}`}>
            <Suspense fallback={<ViewLoader />}>
              {viewContent}
            </Suspense>
          </ViewErrorBoundary>
        </div>
      </main>
      <UpdatePrompt />
      <InstallInstructions mode={installHelp} onClose={() => setInstallHelp(null)} />
    </div>
    </TaskProvider>
  );
};

export default App;