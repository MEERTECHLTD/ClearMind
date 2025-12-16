import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import ProjectsView from './components/views/ProjectsView';
import DashboardView from './components/views/DashboardView';
import IrisView from './components/views/IrisView';
import RantCorner from './components/views/RantCorner';
import TasksView from './components/views/TasksView';
import NotesView from './components/views/NotesView';
import HabitsView from './components/views/HabitsView';
import GoalsView from './components/views/GoalsView';
import MilestonesView from './components/views/MilestonesView';
import DailyLogView from './components/views/DailyLogView';
import AnalyticsView from './components/views/AnalyticsView';
import SettingsView from './components/views/SettingsView';
import OnboardingView from './components/views/OnboardingView';
import { ViewState, UserProfile, Task } from './types';
import { dbService, STORES } from './services/db';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard'); 
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  
  // Theme State
  const [isDarkMode, setIsDarkMode] = useState(true);

  // PWA State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

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

  const toggleTheme = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      setIsDarkMode(true);
    }
  };

  const handleInstallApp = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        }
        setDeferredPrompt(null);
      });
    }
  };

  const handleLogout = async () => {
      if(confirm("Are you sure you want to sign out? This will return you to the login screen.")) {
          await dbService.delete(STORES.PROFILE, 'current-user');
          setUserProfile(null);
          setCurrentView('dashboard');
      }
  };

  const handleViewChange = (view: ViewState) => {
    setCurrentView(view);
    // Close mobile menu on navigation
    setIsMobileMenuOpen(false);
  };

  const renderContent = () => {
    switch (currentView) {
      case 'dashboard':
        return <DashboardView user={userProfile} />;
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
      default:
        return <DashboardView user={userProfile} />;
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-midnight flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!userProfile) {
    return <OnboardingView onComplete={setUserProfile} />;
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
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default App;