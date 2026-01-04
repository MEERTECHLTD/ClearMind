import React, { useState, useRef, useEffect } from 'react';
import { Search, Moon, Sun, Download, Bell, Menu, LogOut, Settings, Clock } from 'lucide-react';
import { UserProfile, ViewState, Task, Project, Note } from '../types';
import { dbService, STORES } from '../services/db';

interface SearchResult {
  type: 'task' | 'project' | 'note';
  id: string;
  title: string;
  subtitle?: string;
}

interface TopBarProps {
  user: UserProfile;
  toggleTheme: () => void;
  isDarkMode: boolean;
  onInstallApp: () => void;
  canInstall: boolean;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
  onNavigate: (view: ViewState) => void;
}

const TopBar: React.FC<TopBarProps> = ({ 
  user, 
  toggleTheme, 
  isDarkMode, 
  onInstallApp, 
  canInstall, 
  onOpenMobileMenu,
  onLogout,
  onNavigate
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search functionality
  useEffect(() => {
    const performSearch = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        setIsSearchOpen(false);
        return;
      }

      const query = searchQuery.toLowerCase();
      const results: SearchResult[] = [];

      try {
        // Search tasks
        const tasks = await dbService.getAll<Task>(STORES.TASKS);
        tasks.filter(t => t.title.toLowerCase().includes(query)).slice(0, 3).forEach(t => {
          results.push({ type: 'task', id: t.id, title: t.title, subtitle: t.priority + ' Priority' });
        });

        // Search projects
        const projects = await dbService.getAll<Project>(STORES.PROJECTS);
        projects.filter(p => p.title.toLowerCase().includes(query) || p.description.toLowerCase().includes(query)).slice(0, 3).forEach(p => {
          results.push({ type: 'project', id: p.id, title: p.title, subtitle: p.status });
        });

        // Search notes
        const notes = await dbService.getAll<Note>(STORES.NOTES);
        notes.filter(n => n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query)).slice(0, 3).forEach(n => {
          results.push({ type: 'note', id: n.id, title: n.title, subtitle: n.tags.join(', ') || 'No tags' });
        });

        setSearchResults(results);
        setIsSearchOpen(results.length > 0);
      } catch (e) {
        console.error("Search failed:", e);
      }
    };

    const debounce = setTimeout(performSearch, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const handleSearchResultClick = (result: SearchResult) => {
    onNavigate(result.type === 'task' ? 'tasks' : result.type === 'project' ? 'projects' : 'notes');
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  // Poll for notifications (Tasks due today or overdue)
  useEffect(() => {
    const fetchNotifications = async () => {
        try {
            const tasks = await dbService.getAll<Task>(STORES.TASKS);
            const today = new Date().toISOString().split('T')[0];
            // Filter: Incomplete and Due Date is today or older
            const dueTasks = tasks.filter(t => !t.completed && t.dueDate && t.dueDate <= today);
            // Sort by due date (oldest first implies most urgent overdue)
            dueTasks.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
            setNotifications(dueTasks);
        } catch (e) {
            console.error("Failed to load notifications", e);
        }
    };
    
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const handleNotificationClick = () => {
      onNavigate('tasks');
      setIsNotificationsOpen(false);
  };

  return (
    <header className="h-16 bg-midnight border-b dark:border-gray-800 border-gray-200 flex items-center justify-between px-6 sticky top-0 z-10 transition-colors duration-300">
      
      {/* Mobile Menu Trigger */}
      <button onClick={onOpenMobileMenu} className="mr-4 md:hidden text-gray-500 hover:text-gray-900 dark:hover:text-white">
        <Menu size={24} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-xl" ref={searchRef}>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" size={18} />
          <input 
            type="text" 
            placeholder="Search projects, notes, tasks..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setIsSearchOpen(true)}
            className="w-full bg-midnight-light border dark:border-gray-800 border-gray-200 dark:text-gray-300 text-gray-900 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all placeholder-gray-500"
          />
          
          {/* Search Results Dropdown */}
          {isSearchOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-midnight-light border dark:border-gray-700 border-gray-200 rounded-lg shadow-xl overflow-hidden z-50">
              {searchResults.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSearchResultClick(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-800/50 flex items-center gap-3 border-b dark:border-gray-700/50 border-gray-200/50 last:border-0"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    result.type === 'task' ? 'bg-blue-500/20 text-blue-400' :
                    result.type === 'project' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {result.type.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium dark:text-white text-gray-900 truncate">{result.title}</p>
                    {result.subtitle && <p className="text-xs text-gray-500 truncate">{result.subtitle}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sm:gap-4 ml-4">
        <button 
          onClick={toggleTheme}
          className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
        >
          {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        
        {canInstall && (
          <button 
            onClick={onInstallApp}
            className="hidden sm:flex items-center gap-2 bg-midnight-light hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-300 text-gray-700 border dark:border-gray-700 border-gray-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
          >
            <Download size={16} />
            <span>Install App</span>
          </button>
        )}

        <div className="h-6 w-px dark:bg-gray-800 bg-gray-300 mx-1"></div>

        {/* Install Button (Mobile/Desktop icon) - Next to notifications */}
        {canInstall && (
          <button 
            onClick={onInstallApp}
            className="sm:hidden relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors p-1 animate-pulse hover:animate-none"
            title="Install App"
          >
            <Download size={20} />
          </button>
        )}

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
            <button 
                onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                className="relative text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors p-1"
            >
              <Bell size={20} />
              {notifications.length > 0 && (
                  <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              )}
            </button>

            {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-midnight-light border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1 z-50 animate-fade-in origin-top-right overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Notifications</h3>
                        <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{notifications.length} Pending</span>
                    </div>
                    
                    <div className="max-h-80 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="p-6 text-center text-gray-500 dark:text-gray-400 text-sm">
                                <Bell size={24} className="mx-auto mb-2 opacity-50" />
                                <p>All caught up! No tasks due.</p>
                            </div>
                        ) : (
                            notifications.map(task => (
                                <div 
                                    key={task.id} 
                                    onClick={handleNotificationClick}
                                    className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800/50 last:border-0 transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${task.priority === 'High' ? 'bg-red-500' : task.priority === 'Medium' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                                        <div>
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 line-clamp-1">{task.title}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`text-xs flex items-center gap-1 ${task.dueDate && task.dueDate < new Date().toISOString().split('T')[0] ? 'text-red-500 font-bold' : 'text-gray-500'}`}>
                                                    <Clock size={10} />
                                                    {task.dueDate === new Date().toISOString().split('T')[0] ? 'Due Today' : `Due ${task.dueDate}`}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    {notifications.length > 0 && (
                        <div className="p-2 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30">
                            <button 
                                onClick={handleNotificationClick}
                                className="w-full text-center text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline py-1"
                            >
                                View all tasks
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        {/* Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="relative block focus:outline-none"
          >
            {user.githubUsername ? (
                <img 
                  src={`https://github.com/${user.githubUsername}.png`} 
                  alt="Profile" 
                  className={`w-8 h-8 rounded-full border border-gray-200 dark:border-gray-700 object-cover hover:border-blue-500 transition-colors ${isProfileOpen ? 'ring-2 ring-blue-500' : ''}`}
                />
            ) : (
                <div className={`w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white uppercase hover:ring-2 hover:ring-blue-500 transition-all ${isProfileOpen ? 'ring-2 ring-blue-500' : ''}`}>
                    {user.nickname.substring(0, 2)}
                </div>
            )}
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-midnight-light border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1 z-50 animate-fade-in origin-top-right">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{user.nickname}</p>
                <p className="text-xs text-gray-500 truncate">Logged in</p>
              </div>
              
              <button 
                onClick={() => { onNavigate('settings'); setIsProfileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
              >
                <Settings size={16} />
                Settings
              </button>

              <button 
                onClick={() => { onLogout(); setIsProfileOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>

      </div>
    </header>
  );
};

export default TopBar;