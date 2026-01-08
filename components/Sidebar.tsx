import React from 'react';
import { 
  LayoutDashboard, 
  Folder, 
  CheckSquare, 
  FileText, 
  Repeat, 
  Target, 
  Flag, 
  Sparkles, 
  MessageSquare, 
  Book, 
  BarChart2, 
  Settings,
  Brain,
  ChevronLeft,
  MoreHorizontal,
  Network,
  Calendar,
  ClipboardList,
  Briefcase,
  BookOpen
} from 'lucide-react';
import { ViewState, UserProfile } from '../types';

interface SidebarProps {
  currentView: ViewState;
  onChangeView: (view: ViewState) => void;
  isCollapsed: boolean;
  toggleCollapse: () => void;
  user: UserProfile;
  isMobileOpen?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isCollapsed, toggleCollapse, user, isMobileOpen }) => {
  
  const menuItems: { id: ViewState; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
    { id: 'projects', label: 'Projects', icon: <Folder size={20} /> },
    { id: 'tasks', label: 'Tasks', icon: <CheckSquare size={20} /> },
    { id: 'applications', label: 'Applications', icon: <Briefcase size={20} /> },
    { id: 'calendar', label: 'Calendar', icon: <Calendar size={20} /> },
    { id: 'dailymapper', label: 'Daily Mapper', icon: <ClipboardList size={20} /> },
    { id: 'notes', label: 'Notes', icon: <FileText size={20} /> },
    { id: 'learningvault', label: 'Learning Vault', icon: <BookOpen size={20} /> },
    { id: 'habits', label: 'Habits', icon: <Repeat size={20} /> },
    { id: 'goals', label: 'Goals', icon: <Target size={20} /> },
    { id: 'milestones', label: 'Milestones', icon: <Flag size={20} /> },
    { id: 'mindmap', label: 'Mind Map', icon: <Network size={20} /> },
    { id: 'iris', label: 'AI (Iris)', icon: <Sparkles size={20} className="text-purple-400" /> },
    { id: 'rant', label: 'Rant Corner', icon: <MessageSquare size={20} /> },
    { id: 'dailylog', label: 'Daily Log', icon: <Book size={20} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart2 size={20} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} /> },
  ];

  const sidebarClasses = `
    h-screen bg-midnight-light border-r dark:border-gray-800 border-gray-200 
    flex flex-col transition-all duration-300 z-50
    ${isMobileOpen ? 'translate-x-0 w-64 fixed' : '-translate-x-full fixed md:relative md:translate-x-0'}
    ${isCollapsed ? 'md:w-16' : 'md:w-64'}
  `;

  return (
    <aside className={sidebarClasses}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between h-16 border-b dark:border-gray-800 border-gray-200">
        {(!isCollapsed || isMobileOpen) && (
          <div className="flex items-center gap-2 text-blue-500 font-bold text-lg animate-fade-in">
            <img src="/clearmindlogo.png" alt="ClearMind" className="w-8 h-8 object-contain" />
            <span className="whitespace-nowrap truncate">ClearMind</span>
          </div>
        )}
        {isCollapsed && !isMobileOpen && (
          <img src="/clearmindlogo.png" alt="ClearMind" className="w-8 h-8 object-contain mx-auto" />
        )}
        <button onClick={toggleCollapse} className="hidden md:block text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          <ChevronLeft size={20} className={`transform transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 touch-pan-y overscroll-contain">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onChangeView(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${currentView === item.id 
                    ? 'bg-midnight-lighter text-blue-600 dark:text-blue-400 border-l-2 border-blue-500' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800/50'
                  }`}
                title={(isCollapsed && !isMobileOpen) ? item.label : ''}
              >
                <span className={currentView === item.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}>
                  {item.icon}
                </span>
                {(!isCollapsed || isMobileOpen) && <span>{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer / User Profile */}
      <div className="p-4 border-t dark:border-gray-800 border-gray-200">
         <div className="flex items-center gap-3">
            {user.githubUsername ? (
               <img 
                 src={`https://github.com/${user.githubUsername}.png`} 
                 alt={user.nickname}
                 className="w-8 h-8 rounded-full border dark:border-gray-700 border-gray-200 bg-midnight"
               />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-xs font-bold text-white uppercase">
                {user.nickname.substring(0, 2)}
              </div>
            )}
            
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium dark:text-white text-gray-900 truncate">{user.nickname}</p>
                <p className="text-xs text-gray-500 truncate">
                  {user.provider === 'google' ? 'Google User' : 
                   user.provider === 'github' ? 'GitHub User' : 
                   user.provider === 'email' ? 'Email User' :
                   user.provider === 'anonymous' ? 'Guest User' :
                   user.provider === 'local' ? 'Local Workspace' : 
                   user.cloudUserId ? 'Cloud User' : 'Local Workspace'}
                </p>
              </div>
            )}
            {(!isCollapsed || isMobileOpen) && <MoreHorizontal size={16} className="text-gray-500" />}
         </div>
      </div>
    </aside>
  );
};

export default Sidebar;