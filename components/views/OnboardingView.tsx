import React, { useState } from 'react';
import { UserProfile } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Map as MapIcon, Shield, LogIn, Cloud } from 'lucide-react';
import { isFirebaseConfigured } from '../../services/firebase';

interface OnboardingViewProps {
  onComplete: (profile: UserProfile) => void;
  onSwitchToCloudLogin?: () => void;
}

const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete, onSwitchToCloudLogin }) => {
  const [nickname, setNickname] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firebaseReady = isFirebaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    setIsSubmitting(true);

    const newProfile: UserProfile = {
      id: 'current-user',
      nickname: nickname.trim(),
      provider: 'local',
      joinedAt: new Date().toISOString()
    };

    try {
      await dbService.put(STORES.PROFILE, newProfile);
      setTimeout(() => onComplete(newProfile), 800); // Small delay for effect
    } catch (error) {
      console.error("Signup failed", error);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-midnight flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-midnight-light border border-gray-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-gradient"></div>
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 rounded-2xl mb-4 overflow-hidden">
            <img src="/clearmindlogo.png" alt="ClearMind" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">ClearMind</h1>
          <p className="text-gray-400 text-center">
            Login to your local workspace. <br/>
            <span className="text-xs text-gray-500">Anonymous & Private. Stored on this device.</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Display Name</label>
            <input
              type="text"
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Who are you today?"
              className="w-full bg-midnight border border-gray-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
            />
          </div>

          <div className="bg-blue-900/10 border border-blue-900/30 rounded-lg p-3 flex items-start gap-3">
             <Shield size={16} className="text-blue-400 mt-0.5 shrink-0" />
             <p className="text-xs text-blue-300">
               Data is stored locally using IndexedDB. Clearing browser cache will reset your account.
             </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !nickname.trim()}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02]"
          >
            {isSubmitting ? 'Entering...' : 'Enter Workspace'}
            {!isSubmitting && <LogIn size={18} />}
          </button>
        </form>

        {/* Cloud Login Option */}
        {firebaseReady && onSwitchToCloudLogin && (
          <div className="mt-6 pt-6 border-t border-gray-800">
            <button
              onClick={onSwitchToCloudLogin}
              className="w-full text-gray-400 hover:text-white py-3 px-4 rounded-xl border border-gray-700 hover:border-gray-600 flex items-center justify-center gap-2 transition-colors"
            >
              <Cloud size={18} />
              Sign in with Cloud Account
            </button>
            <p className="text-xs text-gray-500 text-center mt-2">
              Sync your data across devices
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingView;