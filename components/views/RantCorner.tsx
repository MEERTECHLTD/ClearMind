import React, { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Save, History, X } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { Rant } from '../../types';

const RantCorner: React.FC = () => {
  const [rant, setRant] = useState('');
  const [savedRants, setSavedRants] = useState<Rant[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load saved rants on mount
  useEffect(() => {
    const loadRants = async () => {
      try {
        const rants = await dbService.getAll<Rant>(STORES.RANTS);
        setSavedRants(rants.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));
      } catch (error) {
        console.error('Failed to load rants:', error);
      }
    };
    loadRants();
  }, []);

  const handleSaveRant = async () => {
    if (!rant.trim()) return;
    
    setIsSaving(true);
    try {
      const newRant: Rant = {
        id: `rant-${Date.now()}`,
        content: rant,
        timestamp: new Date().toISOString(),
        mood: 'venting'
      };
      
      await dbService.put(STORES.RANTS, newRant);
      setSavedRants(prev => [newRant, ...prev]);
      setRant('');
    } catch (error) {
      console.error('Failed to save rant:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRant = async (id: string) => {
    try {
      await dbService.delete(STORES.RANTS, id);
      setSavedRants(prev => prev.filter(r => r.id !== id));
    } catch (error) {
      console.error('Failed to delete rant:', error);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto h-[calc(100vh-64px)] flex flex-col animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-red-500">Rant Corner</h1>
            <AlertTriangle className="text-red-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400">
          Sometimes code doesn't work. Sometimes generic error messages break you. 
          Vent here. Get it out of your system. Iris listens but doesn't judge.
        </p>
      </div>

      <div className="flex-1 bg-midnight-light border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex flex-col relative overflow-hidden shadow-sm dark:shadow-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500"></div>
        <textarea
          value={rant}
          onChange={(e) => setRant(e.target.value)}
          placeholder="Why is the dependency tree broken? Why is CSS not cascading? Type it out..."
          className="w-full h-full bg-transparent resize-none focus:outline-none dark:text-gray-200 text-gray-800 placeholder-gray-400 dark:placeholder-gray-700 font-mono"
        />
      </div>

      <div className="mt-6 flex justify-between gap-4">
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-purple-500 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all flex items-center gap-2"
        >
          <History size={18} />
          {showHistory ? 'Hide' : 'View'} History ({savedRants.length})
        </button>
        <div className="flex gap-4">
          <button 
            onClick={() => setRant('')}
            className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-2"
          >
            <Trash2 size={18} />
            Burn it
          </button>
          <button 
            onClick={handleSaveRant}
            disabled={!rant.trim() || isSaving}
            className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />
            {isSaving ? 'Saving...' : 'Save to Diary'}
          </button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && savedRants.length > 0 && (
        <div className="mt-6 bg-midnight-light border border-gray-200 dark:border-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Previous Rants</h3>
          <div className="space-y-3">
            {savedRants.map(r => (
              <div key={r.id} className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                <div className="flex justify-between items-start gap-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap flex-1">{r.content}</p>
                  <button 
                    onClick={() => handleDeleteRant(r.id)}
                    title="Delete rant"
                    className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <X size={16} />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  {new Date(r.timestamp).toLocaleDateString()} at {new Date(r.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default RantCorner;