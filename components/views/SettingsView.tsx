import React, { useState } from 'react';
import { User, Bell, Shield, Cloud, LogOut, Moon, Save, Info } from 'lucide-react';
import { UserProfile } from '../../types';
import { dbService, STORES } from '../../services/db';

interface SettingsProps {
  user: UserProfile | null;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
}

const SettingsView: React.FC<SettingsProps> = ({ user, onUpdateUser, onLogout }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.nickname || '');
  const [editGithub, setEditGithub] = useState(user?.githubUsername || '');

  const handleSaveProfile = async () => {
    if (!user) return;
    
    let cleanGithub = editGithub.trim();
    if (cleanGithub.includes('github.com/')) {
      cleanGithub = cleanGithub.split('github.com/')[1].split('/')[0];
    }

    const updated: UserProfile = {
      ...user,
      nickname: editName,
      githubUsername: cleanGithub
    };

    await dbService.put(STORES.PROFILE, updated);
    onUpdateUser(updated);
    setIsEditing(false);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in overflow-y-auto h-[calc(100vh-64px)]">
      <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-8">Settings</h2>

      <div className="space-y-6">
        {/* Profile Section */}
        <section className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white uppercase shrink-0">
               {user?.githubUsername ? (
                 <img src={`https://github.com/${user.githubUsername}.png`} className="w-full h-full rounded-full" />
               ) : (
                 editName.substring(0, 2)
               )}
            </div>
            
            <div className="flex-1 space-y-4">
              {!isEditing ? (
                <>
                  <div>
                    <h3 className="text-xl font-bold dark:text-white text-gray-900">{user?.nickname}</h3>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {user?.githubUsername ? `github.com/${user.githubUsername}` : 'No GitHub Linked'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">Joined: {new Date(user?.joinedAt || Date.now()).toLocaleDateString()}</p>
                  </div>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 border dark:border-gray-700 border-gray-300 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:border-gray-500 transition-colors"
                  >
                    Edit Profile
                  </button>
                </>
              ) : (
                <div className="space-y-4 max-w-md">
                   <div>
                     <label className="text-xs text-gray-500 uppercase font-semibold">Nickname</label>
                     <input 
                       value={editName}
                       onChange={e => setEditName(e.target.value)}
                       className="w-full bg-midnight-light border dark:border-gray-700 border-gray-300 rounded p-2 dark:text-white text-gray-900 mt-1"
                     />
                   </div>
                   <div>
                     <label className="text-xs text-gray-500 uppercase font-semibold">GitHub Username</label>
                     <input 
                       value={editGithub}
                       onChange={e => setEditGithub(e.target.value)}
                       className="w-full bg-midnight-light border dark:border-gray-700 border-gray-300 rounded p-2 dark:text-white text-gray-900 mt-1"
                     />
                   </div>
                   <div className="flex gap-2">
                     <button 
                       onClick={handleSaveProfile}
                       className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"
                     >
                       <Save size={14} /> Save
                     </button>
                     <button 
                       onClick={() => setIsEditing(false)}
                       className="px-4 py-2 border dark:border-gray-700 border-gray-300 text-gray-600 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                     >
                       Cancel
                     </button>
                   </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Preferences */}
        <section className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-colors">
          <div className="p-4 border-b dark:border-gray-800 border-gray-200 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800/30 cursor-pointer">
            <div className="flex items-center gap-3">
              <Bell className="text-gray-400" size={20} />
              <div>
                <p className="dark:text-white text-gray-900 font-medium">Notifications</p>
                <p className="text-xs text-gray-500">Manage daily reminders and alerts</p>
              </div>
            </div>
            <div className="w-10 h-5 bg-blue-600 rounded-full relative">
                <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
            </div>
          </div>

          <div className="p-4 border-b dark:border-gray-800 border-gray-200 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800/30 cursor-pointer">
            <div className="flex items-center gap-3">
              <Moon className="text-gray-400" size={20} />
              <div>
                <p className="dark:text-white text-gray-900 font-medium">Appearance</p>
                <p className="text-xs text-gray-500">Theme and layout customization</p>
              </div>
            </div>
            <span className="text-sm text-gray-500">Midnight</span>
          </div>

          <div className="p-4 border-b dark:border-gray-800 border-gray-200 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800/30 cursor-pointer">
             <div className="flex items-center gap-3">
              <Cloud className="text-gray-400" size={20} />
              <div>
                <p className="dark:text-white text-gray-900 font-medium">Data Sync</p>
                <p className="text-xs text-gray-500">Backup your diary to GitHub (Local Only for now)</p>
              </div>
            </div>
            <button className="text-blue-500 text-sm font-medium">Configure</button>
          </div>

          <div 
            onClick={onLogout}
            className="p-4 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-900/10 cursor-pointer text-red-500 dark:text-red-400 transition-colors"
          >
             <div className="flex items-center gap-3">
              <LogOut size={20} />
              <span className="font-medium">Sign Out</span>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center gap-3 mb-4">
            <Info size={24} className="text-blue-500" />
            <h3 className="text-lg font-bold dark:text-white text-gray-900">About ClearMind</h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 leading-relaxed">
            ClearMind is a free, open-source productivity tool designed for individuals seeking clarity in their planning and consistency in their journey. 
            Built with a focus on privacy and offline-first capability.
          </p>
          <div className="flex flex-wrap gap-4 text-xs font-medium text-gray-500">
            <span className="flex items-center gap-1">
               Supported by <a href="https://meertech.tech" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">meertech.tech</a>
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
               Google DeepMind
            </span>
          </div>
        </section>

        <p className="text-center text-xs text-gray-500 dark:text-gray-600 pt-4">ClearMind v1.0.0</p>
      </div>
    </div>
  );
};

export default SettingsView;