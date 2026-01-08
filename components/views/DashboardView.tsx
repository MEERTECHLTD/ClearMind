import React, { useEffect, useState } from 'react';
import { Flame, CheckCircle, Github, Activity, Folder, FileText, Plus, X, Clock, Target } from 'lucide-react';
import { UserProfile, Task, Habit, LogEntry, Project, Goal } from '../../types';
import { dbService, STORES } from '../../services/db';

interface DashboardProps {
  user: UserProfile | null;
  onNavigate?: (view: string) => void;
}

const StatCard = ({ title, value, subtitle, icon: Icon, color, onClick }: any) => (
  <div 
    onClick={onClick}
    className={`bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl flex items-start justify-between shadow-sm dark:shadow-none transition-all duration-300 ${onClick ? 'cursor-pointer hover:border-blue-400 hover:scale-[1.02]' : ''}`}
  >
    <div>
      <p className="text-gray-500 dark:text-gray-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">{value}</h3>
      <p className="text-xs text-gray-500">{subtitle}</p>
    </div>
    <div className={`p-3 rounded-lg bg-opacity-10 ${color.bg}`}>
      <Icon className={color.text} size={24} />
    </div>
  </div>
);

const DashboardView: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const [stats, setStats] = useState({
    completedTasks: 0,
    totalTasks: 0,
    activeHabits: 0,
    habitsCompletedToday: 0,
    logStreak: 0,
    totalLogs: 0,
    activeProjects: 0,
    activeGoals: 0
  });
  
  const [recentTasks, setRecentTasks] = useState<Task[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [todayHabits, setTodayHabits] = useState<Habit[]>([]);
  
  // Quick Action Modal States
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickLogContent, setQuickLogContent] = useState('');
  const [quickLogMood, setQuickLogMood] = useState<'Productive' | 'Neutral' | 'Frustrated' | 'Flow State'>('Productive');

  const loadData = async () => {
    const tasks = await dbService.getAll<Task>(STORES.TASKS);
    const habits = await dbService.getAll<Habit>(STORES.HABITS);
    const logs = await dbService.getAll<LogEntry>(STORES.LOGS);
    const projects = await dbService.getAll<Project>(STORES.PROJECTS);
    const goals = await dbService.getAll<Goal>(STORES.GOALS);

    const completed = tasks.filter(t => t.completed).length;
    const pendingTasks = tasks.filter(t => !t.completed);
    const activeProjects = projects.filter(p => p.status === 'In Progress').length;
    const habitsCompletedToday = habits.filter(h => h.completedToday).length;
    
    // Get upcoming tasks (due today or in the future, not completed)
    const today = new Date().toISOString().split('T')[0];
    const upcoming = pendingTasks
      .filter(t => t.dueDate && t.dueDate >= today)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 5);
    
    // Calculate log streak
    let currentStreak = 0;
    if (logs.length > 0) {
      const sortedLogs = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      const todayDate = new Date();
      todayDate.setHours(0, 0, 0, 0);
      
      let checkDate = new Date(todayDate);
      
      for (const log of sortedLogs) {
        const logDate = new Date(log.date);
        logDate.setHours(0, 0, 0, 0);
        
        if (logDate.getTime() === checkDate.getTime()) {
          currentStreak++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (logDate.getTime() === checkDate.getTime() - 86400000) {
          // Log is from yesterday, continue streak
          currentStreak++;
          checkDate = logDate;
          checkDate.setDate(checkDate.getDate() - 1);
        } else {
          break;
        }
      }
    }

    setStats({
      completedTasks: completed,
      totalTasks: tasks.length,
      activeHabits: habits.length,
      habitsCompletedToday,
      logStreak: currentStreak,
      totalLogs: logs.length,
      activeProjects,
      activeGoals: goals.length
    });
    
    setRecentTasks(pendingTasks.slice(0, 3));
    setUpcomingTasks(upcoming);
    setTodayHabits(habits.slice(0, 4));
  };

  useEffect(() => {
    loadData();
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    
    // Listen for sync events to reload data immediately
    const handleSync = () => {
      loadData();
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('clearmind-sync', handleSync as EventListener);
    };
  }, []);

  const handleQuickTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    
    const allTasks = await dbService.getAll<Task>(STORES.TASKS);
    const maxNumber = allTasks.reduce((max, task) => Math.max(max, task.taskNumber || 0), 0);
    
    const newTask: Task = {
      id: Date.now().toString(),
      title: quickTaskTitle,
      completed: false,
      priority: 'Medium',
      dueDate: new Date().toISOString().split('T')[0],
      taskNumber: maxNumber + 1,
      notified: false
    };
    
    await dbService.put(STORES.TASKS, newTask);
    setQuickTaskTitle('');
    setShowQuickTask(false);
    loadData(); // Refresh dashboard data
  };

  const handleQuickLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickLogContent.trim()) return;
    
    const newLog: LogEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      content: quickLogContent,
      mood: quickLogMood
    };
    
    await dbService.put(STORES.LOGS, newLog);
    setQuickLogContent('');
    setShowQuickLog(false);
    loadData(); // Refresh dashboard data
  };

  const toggleHabit = async (habit: Habit) => {
    const updatedHabit = { 
      ...habit, 
      completedToday: !habit.completedToday,
      streak: !habit.completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1)
    };
    await dbService.put(STORES.HABITS, updatedHabit);
    loadData();
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'High': return 'bg-red-500';
      case 'Medium': return 'bg-green-500';
      case 'Low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="p-8 space-y-8 animate-fade-in overflow-y-auto h-[calc(100vh-64px)]">
      {/* Quick Task Modal */}
      {showQuickTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQuickTask(false)}>
          <div className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-white text-gray-900">Quick Add Task</h3>
              <button onClick={() => setShowQuickTask(false)} title="Close" className="text-gray-400 hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickTaskSubmit}>
              <input
                type="text"
                value={quickTaskTitle}
                onChange={(e) => setQuickTaskTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full bg-midnight border dark:border-gray-700 border-gray-300 rounded-xl px-4 py-3 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 mb-4"
              />
              <button type="submit" className="w-full bg-blue-600 text-white rounded-xl py-3 font-medium hover:bg-blue-700 transition-colors">
                Add Task
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Quick Log Modal */}
      {showQuickLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowQuickLog(false)}>
          <div className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold dark:text-white text-gray-900">Quick Log Entry</h3>
              <button onClick={() => setShowQuickLog(false)} title="Close" className="text-gray-400 hover:text-gray-200">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleQuickLogSubmit}>
              <textarea
                value={quickLogContent}
                onChange={(e) => setQuickLogContent(e.target.value)}
                placeholder="What did you accomplish today?"
                autoFocus
                rows={4}
                className="w-full bg-midnight border dark:border-gray-700 border-gray-300 rounded-xl px-4 py-3 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 mb-3 resize-none"
              />
              <div className="flex gap-2 mb-4">
                {(['Productive', 'Neutral', 'Frustrated', 'Flow State'] as const).map(mood => (
                  <button
                    key={mood}
                    type="button"
                    onClick={() => setQuickLogMood(mood)}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-all ${
                      quickLogMood === mood 
                        ? 'bg-blue-600 border-blue-500 text-white' 
                        : 'bg-midnight border-gray-700 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    {mood}
                  </button>
                ))}
              </div>
              <button type="submit" className="w-full bg-purple-600 text-white rounded-xl py-3 font-medium hover:bg-purple-700 transition-colors">
                Save Entry
              </button>
            </form>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold dark:text-white text-gray-900 mb-2">Welcome back, {user?.nickname || 'Friend'}.</h1>
        <p className="text-gray-500 dark:text-gray-400">Let's build something consistent today. 🔥</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Tasks" 
          value={`${stats.completedTasks}/${stats.totalTasks}`}
          subtitle={`${stats.totalTasks - stats.completedTasks} pending`}
          icon={CheckCircle}
          color={{ bg: 'bg-green-500', text: 'text-green-500' }}
          onClick={() => onNavigate?.('tasks')}
        />
        <StatCard 
          title="Habits Today" 
          value={`${stats.habitsCompletedToday}/${stats.activeHabits}`}
          subtitle={stats.activeHabits > 0 ? `${Math.round((stats.habitsCompletedToday / stats.activeHabits) * 100)}% complete` : 'No habits yet'}
          icon={Flame}
          color={{ bg: 'bg-orange-500', text: 'text-orange-500' }}
          onClick={() => onNavigate?.('habits')}
        />
        <StatCard 
          title="Log Streak" 
          value={`${stats.logStreak} day${stats.logStreak !== 1 ? 's' : ''}`}
          subtitle={`${stats.totalLogs} total entries`}
          icon={FileText}
          color={{ bg: 'bg-blue-500', text: 'text-blue-500' }}
          onClick={() => onNavigate?.('dailylog')}
        />
        <StatCard 
          title="Projects" 
          value={stats.activeProjects.toString()} 
          subtitle={`${stats.activeGoals} active goals`}
          icon={Folder}
          color={{ bg: 'bg-purple-500', text: 'text-purple-500' }}
          onClick={() => onNavigate?.('projects')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Tasks */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold dark:text-white text-gray-900">Upcoming Tasks</h3>
            <Clock size={18} className="text-gray-400" />
          </div>
          <div className="space-y-3">
            {upcomingTasks.length > 0 ? upcomingTasks.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors">
                <span className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm dark:text-gray-200 text-gray-800 truncate">{task.title}</p>
                  <p className="text-xs text-gray-500">{task.dueDate}{task.dueTime && ` at ${task.dueTime}`}</p>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center py-4">No upcoming tasks</p>
            )}
          </div>
          {upcomingTasks.length > 0 && (
            <button 
              onClick={() => onNavigate?.('tasks')}
              className="w-full mt-4 text-sm text-blue-500 hover:text-blue-400 transition-colors"
            >
              View all tasks →
            </button>
          )}
        </div>

        {/* Today's Habits */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold dark:text-white text-gray-900">Today's Habits</h3>
            <Target size={18} className="text-gray-400" />
          </div>
          <div className="space-y-3">
            {todayHabits.length > 0 ? todayHabits.map(habit => (
              <div 
                key={habit.id} 
                onClick={() => toggleHabit(habit)}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
              >
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                  habit.completedToday 
                    ? 'bg-green-500 border-green-500' 
                    : 'border-gray-400 dark:border-gray-600'
                }`}>
                  {habit.completedToday && <CheckCircle size={12} className="text-white" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm ${habit.completedToday ? 'text-gray-400 line-through' : 'dark:text-gray-200 text-gray-800'}`}>
                    {habit.name}
                  </p>
                </div>
                <span className="text-xs text-orange-500 font-medium">{habit.streak}🔥</span>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center py-4">No habits tracked yet</p>
            )}
          </div>
          {todayHabits.length > 0 && (
            <button 
              onClick={() => onNavigate?.('habits')}
              className="w-full mt-4 text-sm text-blue-500 hover:text-blue-400 transition-colors"
            >
              Manage habits →
            </button>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 flex flex-col shadow-sm dark:shadow-none transition-colors duration-300">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3 flex-1">
            <div 
              onClick={() => onNavigate?.('projects')}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group"
            >
               <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                 <Folder size={16} />
               </div>
               <div>
                 <p className="text-sm font-medium dark:text-gray-200 text-gray-800">New Project</p>
                 <p className="text-xs text-gray-500">Start a new endeavor</p>
               </div>
            </div>
            
            <div 
              onClick={() => setShowQuickTask(true)}
              className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group"
            >
               <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                 <Plus size={16} />
               </div>
               <div>
                 <p className="text-sm font-medium dark:text-gray-200 text-gray-800">Add Task</p>
                 <p className="text-xs text-gray-500">Track a deliverable</p>
               </div>
            </div>

             <div 
               onClick={() => setShowQuickLog(true)}
               className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group"
             >
               <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                 <FileText size={16} />
               </div>
               <div>
                 <p className="text-sm font-medium dark:text-gray-200 text-gray-800">Log Entry</p>
                 <p className="text-xs text-gray-500">Document today's win</p>
               </div>
            </div>
          </div>
        </div>
      </div>

      {/* GitHub Integration */}
      {user?.githubUsername && (
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <Github className="dark:text-white text-gray-800" size={24} />
            <div>
              <p className="dark:text-white text-gray-900 font-medium">GitHub Connected</p>
              <p className="text-sm text-gray-500">@{user.githubUsername}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardView;
