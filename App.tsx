import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import { ViewState, UserProfile, Task } from './types';
import { dbService, STORES } from './services/db';

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

// Loading fallback component
const ViewLoader = () => (
  <div className="flex-1 flex items-center justify-center bg-midnight">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-400 text-sm">Loading...</p>
    </div>
  </div>
);

// Helper function to get view from hash
const getViewFromHash = (): ViewState => {
  const hash = window.location.hash.slice(1); // Remove the '#'
  const validViews: ViewState[] = [
    'dashboard', 'projects', 'tasks', 'notes', 'habits', 
    'goals', 'milestones', 'iris', 'rant', 'dailylog', 
    'analytics', 'settings', 'mindmap'
  ];
  return validViews.includes(hash as ViewState) ? (hash as ViewState) : 'dashboard';
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>(getViewFromHash()); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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

    // Auth Check
    const checkUser = async () => {
      try {
        const profile = await dbService.get<UserProfile>(STORES.PROFILE, 'current-user');
        if (profile) {
          setUserProfile(profile);
        }
      } catch (e) {
        console.error("Error loading profile", e);
      } finally {
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
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Notification Logic Loop
    const checkNotifications = async () => {
      if (Notification.permission !== 'granted') return;

      const tasks = await dbService.getAll<Task>(STORES.TASKS);
      const today = new Date().toISOString().split('T')[0];

      for (const task of tasks) {
        if (!task.completed && !task.notified && task.dueDate === today) {
          // Send Notification
          new Notification('ClearMind Task Reminder', {
            body: `Today: ${task.title}`,
            icon: '/icon.png' // Fallback to whatever icon is cached or served
          });

          // Mark as notified
          const updatedTask = { ...task, notified: true };
          await dbService.put(STORES.TASKS, updatedTask);
        }
      }
    };

    // Check every minute
    const notificationInterval = setInterval(checkNotifications, 60000);
    // Also check on mount
    checkNotifications();

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
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
        }
        setDeferredPrompt(null);
      });
    }
  }, [deferredPrompt]);

  const handleLogout = useCallback(async () => {
      if(confirm("Are you sure you want to sign out? This will return you to the login screen.")) {
          await dbService.delete(STORES.PROFILE, 'current-user');
          setUserProfile(null);
          setCurrentView('dashboard');
      }
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
      default:
        return <DashboardView user={userProfile} onNavigate={handleViewChange} />;
    }
  }, [currentView, userProfile, handleLogout, handleViewChange]);

  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-midnight flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userProfile) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <OnboardingView onComplete={setUserProfile} />
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
          canInstall={!!deferredPrompt}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          onLogout={handleLogout}
          onNavigate={handleViewChange}
        />
        <div className="flex-1 relative overflow-hidden">
          <Suspense fallback={<ViewLoader />}>
            {viewContent}
          </Suspense>
        </div>
      </main>
    </div>
  );
};

export default App;