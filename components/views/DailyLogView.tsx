import React, { useState, useEffect } from 'react';
import { LogEntry } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Calendar, Smile, Frown, Meh, Zap, Save, CheckCircle } from 'lucide-react';

const DailyLogView: React.FC = () => {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [todayContent, setTodayContent] = useState('');
  const [selectedMood, setSelectedMood] = useState<LogEntry['mood']>('Neutral');

  useEffect(() => {
    const loadLogs = async () => {
      const data = await dbService.getAll<LogEntry>(STORES.LOGS);
      setEntries(data.reverse()); // Newest first
    };
    loadLogs();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'logs') {
        loadLogs();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const saveLog = async () => {
    if (!todayContent.trim()) return;
    const newEntry: LogEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      content: todayContent,
      mood: selectedMood
    };
    
    await dbService.put(STORES.LOGS, newEntry);
    setEntries([newEntry, ...entries]);
    setTodayContent('');
  };

  const getMoodIcon = (mood: LogEntry['mood']) => {
    switch(mood) {
      case 'Productive': return <CheckCircle className="text-green-500" />;
      case 'Flow State': return <Zap className="text-yellow-500" />;
      case 'Frustrated': return <Frown className="text-red-500" />;
      default: return <Meh className="text-gray-500" />;
    }
  };

  return (
    <div className="p-8 h-full flex flex-col md:flex-row gap-8 animate-fade-in overflow-y-auto md:overflow-hidden">
      {/* Editor Section */}
      <div className="flex-1 flex flex-col min-h-[400px]">
        <div className="mb-6">
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Daily Log</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Document your failures and small wins.</p>
        </div>

        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl flex-1 flex flex-col p-6 shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center gap-4 mb-6 pb-6 border-b dark:border-gray-800 border-gray-200">
            <span className="text-gray-500 dark:text-gray-400 text-sm font-mono">{new Date().toDateString()}</span>
            <div className="flex gap-2 flex-wrap">
              {['Productive', 'Flow State', 'Neutral', 'Frustrated'].map((mood) => (
                <button
                  key={mood}
                  onClick={() => setSelectedMood(mood as any)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                    ${selectedMood === mood 
                      ? 'bg-blue-600 border-blue-600 text-white' 
                      : 'dark:border-gray-700 border-gray-300 dark:text-gray-400 text-gray-600 hover:border-blue-500'}`}
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>
          
          <textarea
            value={todayContent}
            onChange={(e) => setTodayContent(e.target.value)}
            placeholder="How was your coding session today? What did you learn?"
            className="flex-1 bg-transparent resize-none focus:outline-none dark:text-gray-200 text-gray-800 placeholder-gray-400 dark:placeholder-gray-600 leading-relaxed text-lg"
          />

          <div className="mt-4 flex justify-end">
            <button 
              onClick={saveLog}
              disabled={!todayContent.trim()}
              className="bg-gray-900 dark:bg-white text-white dark:text-midnight font-bold px-6 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={18} />
              Save Entry
            </button>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      <div className="w-full md:w-80 border-t md:border-t-0 md:border-l dark:border-gray-800 border-gray-200 pt-6 md:pt-0 md:pl-8 overflow-y-auto max-h-[50vh] md:max-h-full">
        <h3 className="font-bold dark:text-white text-gray-900 mb-6 flex items-center gap-2">
          <Calendar size={18} /> History
        </h3>
        <div className="space-y-4">
          {entries.length === 0 ? (
            <p className="text-gray-500 text-sm italic">No logs yet. Write your first entry!</p>
          ) : (
            entries.map(entry => (
              <div key={entry.id} className="group cursor-pointer">
                <div className="flex items-center gap-2 mb-1">
                   <span className="text-xs text-blue-500 dark:text-blue-400 font-mono">{entry.date}</span>
                   {getMoodIcon(entry.mood)}
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-3 dark:group-hover:text-gray-200 group-hover:text-gray-900 transition-colors border-l-2 dark:border-gray-800 border-gray-300 pl-3 py-1 group-hover:border-blue-500">
                  {entry.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DailyLogView;
