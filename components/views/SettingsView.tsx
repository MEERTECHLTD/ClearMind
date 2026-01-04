import React, { useState } from 'react';
import { Bell, Cloud, LogOut, Moon, Save, Info, RefreshCw, Check, AlertCircle, Loader2, Link } from 'lucide-react';
import { UserProfile } from '../../types';
import { dbService, STORES } from '../../services/db';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';

interface SettingsProps {
  user: UserProfile | null;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
}

const SettingsView: React.FC<SettingsProps> = ({ user, onUpdateUser, onLogout }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(user?.nickname || '');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const isCloudUser = user?.provider && user.provider !== 'local';
  const firebaseReady = isFirebaseConfigured();

  const handleSaveProfile = async () => {
    if (!user) return;

    const updated: UserProfile = {
      ...user,
      nickname: editName
    };

    await dbService.put(STORES.PROFILE, updated);
    onUpdateUser(updated);
    setIsEditing(false);
  };

  const handleSync = async () => {
    if (!isCloudUser || !firebaseReady) return;
    
    setIsSyncing(true);
    setSyncMessage(null);

    try {
      // Sync all stores
      const stores = [
        STORES.TASKS,
        STORES.NOTES,
        STORES.HABITS,
        STORES.GOALS,
        STORES.MILESTONES,
        STORES.PROJECTS,
        STORES.LOGS,
        STORES.EVENTS,
        STORES.DAILY_MAPPER,
        STORES.RANTS,
        STORES.MINDMAPS,
      ];

      for (const storeName of stores) {
        const localItems = await dbService.getAll<{ id: string }>(storeName);
        const syncedItems = await firebaseService.fullSync(storeName, localItems);
        for (const item of syncedItems) {
          await dbService.put(storeName, item);
        }
      }

      const now = new Date().toISOString();
      const updated = { ...user!, lastSyncedAt: now };
      await dbService.put(STORES.PROFILE, updated);
      onUpdateUser(updated);
      setSyncMessage({ type: 'success', text: 'Data synced successfully!' });
    } catch (error: any) {
      console.error('Sync error:', error);
      setSyncMessage({ type: 'error', text: error.message || 'Sync failed. Please try again.' });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in overflow-y-auto h-[calc(100vh-64px)]">
      <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-8">Settings</h2>

      <div className="space-y-6">
        {/* Profile Section */}
        <section className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-start gap-6">
            {user?.photoURL ? (
              <img 
                src={user.photoURL} 
                alt={user.nickname}
                className="w-20 h-20 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-2xl font-bold text-white uppercase shrink-0">
                {editName.substring(0, 2)}
              </div>
            )}
            
            <div className="flex-1 space-y-4">
              {!isEditing ? (
                <>
                  <div>
                    <h3 className="text-xl font-bold dark:text-white text-gray-900">{user?.nickname}</h3>
                    {user?.email && (
                      <p className="text-sm text-gray-400 mt-0.5">{user.email}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isCloudUser 
                          ? 'bg-green-500/10 text-green-400 border border-green-500/30' 
                          : 'bg-gray-500/10 text-gray-400 border border-gray-500/30'
                      }`}>
                        {isCloudUser ? `${user?.provider} account` : 'Local account'}
                      </span>
                      {user?.lastSyncedAt && (
                        <span className="text-xs text-gray-500">
                          Last sync: {new Date(user.lastSyncedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-600 mt-2">Joined: {new Date(user?.joinedAt || Date.now()).toLocaleDateString()}</p>
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
                     <label htmlFor="nickname-input" className="text-xs text-gray-500 uppercase font-semibold">Nickname</label>
                     <input 
                       id="nickname-input"
                       value={editName}
                       onChange={e => setEditName(e.target.value)}
                       placeholder="Enter your nickname"
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

        {/* Cloud Sync Section */}
        {firebaseReady && (
          <section className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <Cloud size={24} className="text-blue-500" />
              <h3 className="text-lg font-bold dark:text-white text-gray-900">Cloud Sync</h3>
            </div>
            
            {isCloudUser ? (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  Your data is connected to the cloud. Sync your local changes or restore from cloud backup.
                </p>
                
                {syncMessage && (
                  <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                    syncMessage.type === 'success' 
                      ? 'bg-green-500/10 border border-green-500/30 text-green-400'
                      : 'bg-red-500/10 border border-red-500/30 text-red-400'
                  }`}>
                    {syncMessage.type === 'success' ? <Check size={16} /> : <AlertCircle size={16} />}
                    {syncMessage.text}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {isSyncing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <RefreshCw size={16} />
                    )}
                    {isSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  
                  <button
                    className="px-4 py-2 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  >
                    <Link size={16} />
                    Connected as {user?.email}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-400">
                  You're using a local account. Sign in with a cloud account to sync your data across devices.
                </p>
                <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                  <p className="text-sm text-blue-400 mb-3">
                    Benefits of cloud sync:
                  </p>
                  <ul className="text-xs text-blue-300/80 space-y-1">
                    <li>• Access your data from any device</li>
                    <li>• Automatic backup and restore</li>
                    <li>• Never lose your productivity data</li>
                  </ul>
                </div>
                <button
                  onClick={onLogout}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg text-sm flex items-center gap-2 transition-all"
                >
                  <Cloud size={16} />
                  Link Cloud Account
                </button>
              </div>
            )}
          </section>
        )}

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