import React, { useEffect, useState } from 'react';
import { Flame, CheckCircle, Github, Activity, Folder, FileText } from 'lucide-react';
import { UserProfile, Task, Habit, LogEntry } from '../../types';
import { dbService, STORES } from '../../services/db';

interface DashboardProps {
  user: UserProfile | null;
}

const StatCard = ({ title, value, subtitle, icon: Icon, color }: any) => (
  <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl flex items-start justify-between shadow-sm dark:shadow-none transition-colors duration-300">
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

const DashboardView: React.FC<DashboardProps> = ({ user }) => {
  const [stats, setStats] = useState({
    completedTasks: 0,
    activeHabits: 0,
    logStreak: 0,
    totalLogs: 0
  });

  useEffect(() => {
    const loadStats = async () => {
      const tasks = await dbService.getAll<Task>(STORES.TASKS);
      const habits = await dbService.getAll<Habit>(STORES.HABITS);
      const logs = await dbService.getAll<LogEntry>(STORES.LOGS);

      const completed = tasks.filter(t => t.completed).length;
      
      // Calculate simple streak based on logs (consecutive days)
      // This is a simplified calculation
      let currentStreak = 0;
      if (logs.length > 0) {
        // Sort logs by date descending
        const sortedLogs = logs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const today = new Date().toISOString().split('T')[0];
        const lastLogDate = sortedLogs[0].date;
        
        // If last log was today or yesterday, start counting
        if (lastLogDate === today || 
            new Date(lastLogDate).getTime() === new Date(Date.now() - 86400000).setHours(0,0,0,0)) {
           currentStreak = 1; 
           // Logic to count backwards would go here, keeping it simple for now
        }
      }

      setStats({
        completedTasks: completed,
        activeHabits: habits.length,
        logStreak: currentStreak,
        totalLogs: logs.length
      });
    };
    loadStats();
  }, []);

  return (
    <div className="p-8 space-y-8 animate-fade-in overflow-y-auto h-[calc(100vh-64px)]">
      <div>
        <h1 className="text-2xl font-bold dark:text-white text-gray-900 mb-2">Welcome back, {user?.nickname || 'Friend'}.</h1>
        <p className="text-gray-500 dark:text-gray-400">Let's build something consistent today. 🔥</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          title="Daily Logs" 
          value={stats.totalLogs.toString()}
          subtitle="Total entries recorded"
          icon={FileText}
          color={{ bg: 'bg-blue-500', text: 'text-blue-500' }}
        />
        <StatCard 
          title="Tasks Completed" 
          value={stats.completedTasks.toString()}
          subtitle="All time"
          icon={CheckCircle}
          color={{ bg: 'bg-green-500', text: 'text-green-500' }}
        />
        <StatCard 
          title="Active Habits" 
          value={stats.activeHabits.toString()}
          subtitle="Being tracked"
          icon={Flame}
          color={{ bg: 'bg-orange-500', text: 'text-orange-500' }}
        />
        <StatCard 
          title="GitHub" 
          value={user?.githubUsername ? "Linked" : "No Link"} 
          subtitle={user?.githubUsername ? `@${user.githubUsername}` : "Connect in Settings"}
          icon={Github}
          color={{ bg: 'dark:bg-white bg-black', text: 'dark:text-white text-black' }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors duration-300 flex items-center justify-center">
          <div className="text-center">
            <Activity className="mx-auto text-gray-300 dark:text-gray-600 mb-4" size={48} />
            <h3 className="text-lg font-semibold dark:text-white text-gray-900">Activity Chart</h3>
            <p className="text-gray-500 text-sm mt-2">
              As you complete tasks and add logs, <br/> your consistency graph will appear here.
            </p>
          </div>
        </div>

        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 flex flex-col shadow-sm dark:shadow-none transition-colors duration-300">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-4 flex-1">
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group">
               <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                 <Folder size={16} />
               </div>
               <div>
                 <p className="text-sm font-medium dark:text-gray-200 text-gray-800">New Project</p>
                 <p className="text-xs text-gray-500">Start a new endeavor</p>
               </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group">
               <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center">
                 <CheckCircle size={16} />
               </div>
               <div>
                 <p className="text-sm font-medium dark:text-gray-200 text-gray-800">Add Task</p>
                 <p className="text-xs text-gray-500">Track a deliverable</p>
               </div>
            </div>

             <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors border border-transparent dark:hover:border-gray-800 hover:border-gray-300 cursor-pointer group">
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
    </div>
  );
};

export default DashboardView;
