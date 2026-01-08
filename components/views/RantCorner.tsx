import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Trash2, Save, History, X, Sparkles, Bot, Loader2, Send } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { Rant, Project, Task, Note, Habit, Goal, Milestone, LogEntry, UserProfile, CalendarEvent, Application } from '../../types';
import { generateIrisResponse, UserContext } from '../../services/geminiService';

interface IrisAdvice {
  rantContent: string;
  advice: string;
  timestamp: Date;
}

const RantCorner: React.FC = () => {
  const [rant, setRant] = useState('');
  const [savedRants, setSavedRants] = useState<Rant[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGettingAdvice, setIsGettingAdvice] = useState(false);
  const [irisAdvice, setIrisAdvice] = useState<IrisAdvice | null>(null);
  const [userContext, setUserContext] = useState<UserContext | null>(null);
  const [showAdvicePanel, setShowAdvicePanel] = useState(false);

  // Load saved rants on mount
  useEffect(() => {
    const loadRants = async () => {
      try {
        const rants = await dbService.getAll<Rant>(STORES.RANTS);
        setSavedRants(rants.sort((a, b) => 
          new Date(b.createdAt || b.timestamp || 0).getTime() - new Date(a.createdAt || a.timestamp || 0).getTime()
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
      const now = new Date().toISOString();
      const newRant: Rant = {
        id: `rant-${Date.now()}`,
        content: rant,
        createdAt: now,
        timestamp: now,
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

  // Fetch user context for Iris
  const fetchUserContext = useCallback(async () => {
    try {
      const [projects, tasks, notes, habits, goals, milestones, logs, rants, events, applications] = await Promise.all([
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Note>(STORES.NOTES),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<Milestone>(STORES.MILESTONES),
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Rant>(STORES.RANTS),
        dbService.getAll<CalendarEvent>(STORES.EVENTS),
        dbService.getAll<Application>(STORES.APPLICATIONS),
      ]);
      
      let profile: UserProfile | undefined;
      try {
        profile = await dbService.get<UserProfile>(STORES.PROFILE, 'user');
      } catch {
        profile = undefined;
      }

      setUserContext({
        profile,
        projects,
        tasks,
        notes,
        habits,
        goals,
        milestones,
        logs,
        rants,
        events,
        applications,
      });
    } catch (error) {
      console.error('Failed to fetch user context:', error);
    }
  }, []);

  // Load user context on mount
  useEffect(() => {
    fetchUserContext();
  }, [fetchUserContext]);

  // Get advice from Iris about the rant
  const handleGetAdvice = async () => {
    if (!rant.trim()) return;
    
    setIsGettingAdvice(true);
    setShowAdvicePanel(true);
    setIrisAdvice(null);

    try {
      // Refresh context before getting advice
      await fetchUserContext();
      
      // Create a special prompt for Iris to analyze the rant and provide actionable advice
      const advicePrompt = `The user is venting/ranting in the Rant Corner. They are frustrated about their schedules, tasks, or productivity not having the real-life impact they expected. 

Here's their rant:
"${rant}"

As Iris, please:
1. Acknowledge their frustration with empathy
2. Analyze their current data (tasks, habits, goals, schedules, projects) to understand their situation
3. Identify specific patterns or issues that might explain why they feel their efforts aren't translating to real-life results
4. Provide 2-3 concrete, actionable suggestions based on THEIR ACTUAL DATA to help bridge the gap between planning and real impact
5. If relevant, suggest adjustments to their tasks, habits, or goals that could help
6. End with encouragement and a specific next step they can take today

Remember: Reference their SPECIFIC tasks, habits, projects, and goals by name. Make this personal and data-driven, not generic advice.`;

      const history = [
        { role: 'model', parts: [{ text: "I'm here to help you work through this frustration. Let me look at your data and see what's really going on..." }] }
      ];

      const response = await generateIrisResponse(history, advicePrompt, userContext || undefined);
      
      setIrisAdvice({
        rantContent: rant,
        advice: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Failed to get advice from Iris:', error);
      setIrisAdvice({
        rantContent: rant,
        advice: "I'm having trouble connecting right now. But I want you to know that your frustration is valid. Take a breath, and let's try again in a moment.",
        timestamp: new Date()
      });
    } finally {
      setIsGettingAdvice(false);
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
          Vent here. Get it out of your system. Iris can analyze your situation and give advice based on your actual data.
        </p>
      </div>

      <div className="flex-1 bg-midnight-light border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex flex-col relative overflow-hidden shadow-sm dark:shadow-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500"></div>
        <textarea
          value={rant}
          onChange={(e) => setRant(e.target.value)}
          placeholder="Feeling like your tasks aren't making a difference? Schedules not translating to real results? Let it out here, then ask Iris for personalized advice..."
          className="w-full h-full bg-transparent resize-none focus:outline-none dark:text-gray-200 text-gray-800 placeholder-gray-400 dark:placeholder-gray-700 font-mono"
        />
      </div>

      <div className="mt-6 flex justify-between gap-4 flex-wrap">
        <button 
          onClick={() => setShowHistory(!showHistory)}
          className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-purple-500 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-all flex items-center gap-2"
        >
          <History size={18} />
          {showHistory ? 'Hide' : 'View'} History ({savedRants.length})
        </button>
        <div className="flex gap-3 flex-wrap">
          <button 
            onClick={handleGetAdvice}
            disabled={!rant.trim() || isGettingAdvice}
            className="px-6 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 transition-all flex items-center gap-2 shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGettingAdvice ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Get Advice from Iris
              </>
            )}
          </button>
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

      {/* Iris Advice Panel */}
      {showAdvicePanel && (
        <div className="mt-6 bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800/50 rounded-xl p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500"></div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-300">Iris's Advice</h3>
            </div>
            <button
              onClick={() => setShowAdvicePanel(false)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          {isGettingAdvice ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 size={32} className="animate-spin mx-auto text-purple-500 mb-3" />
                <p className="text-purple-600 dark:text-purple-400">Analyzing your data and crafting personalized advice...</p>
              </div>
            </div>
          ) : irisAdvice ? (
            <div className="space-y-4">
              <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Your concern:</p>
                <p className="text-gray-700 dark:text-gray-300 italic">"{irisAdvice.rantContent}"</p>
              </div>
              <div className="prose prose-purple dark:prose-invert max-w-none">
                <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{irisAdvice.advice}</p>
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Advice generated at {irisAdvice.timestamp.toLocaleTimeString()} based on your current data
              </p>
            </div>
          ) : null}
        </div>
      )}

      {/* History Panel */}
      {showHistory && savedRants.length > 0 && (
        <div className="mt-6 bg-midnight-light border border-gray-200 dark:border-gray-800 rounded-xl p-4 max-h-64 overflow-y-auto">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Previous Rants</h3>
          <div className="space-y-3">
            {savedRants.map(r => {
              const rantDate = new Date(r.createdAt || r.timestamp || Date.now());
              return (
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
                    {rantDate.toLocaleDateString()} at {rantDate.toLocaleTimeString()}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default RantCorner;