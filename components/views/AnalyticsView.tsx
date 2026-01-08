import React, { useEffect, useState } from 'react';
import { BarChart2, PieChart as PieIcon, Activity, TrendingUp, Target, CheckCircle2, Calendar, Flame, Brain, Clock } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { LogEntry, Task, Project, Habit, Goal, CalendarEvent, Rant } from '../../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, AreaChart, Area } from 'recharts';

interface WeeklyTaskData {
  day: string;
  completed: number;
  created: number;
}

interface HabitStreakData {
  name: string;
  streak: number;
  color: string;
}

interface GoalProgressData {
  title: string;
  progress: number;
  category: string;
  color: string;
}

interface ProductivityByHour {
  hour: string;
  tasks: number;
}

const AnalyticsView: React.FC = () => {
  const [moodData, setMoodData] = useState<{name: string, value: number, color: string}[]>([]);
  const [weeklyTaskData, setWeeklyTaskData] = useState<WeeklyTaskData[]>([]);
  const [habitStreaks, setHabitStreaks] = useState<HabitStreakData[]>([]);
  const [goalProgress, setGoalProgress] = useState<GoalProgressData[]>([]);
  const [projectStatusData, setProjectStatusData] = useState<{name: string, value: number, color: string}[]>([]);
  const [counts, setCounts] = useState({
    totalProjects: 0,
    completedTasks: 0,
    pendingTasks: 0,
    totalLogs: 0,
    totalHabits: 0,
    totalGoals: 0,
    upcomingEvents: 0,
    totalRants: 0,
    avgHabitStreak: 0,
    taskCompletionRate: 0,
  });

  useEffect(() => {
    const processData = async () => {
      const [logs, tasks, projects, habits, goals, events, rants] = await Promise.all([
        dbService.getAll<LogEntry>(STORES.LOGS),
        dbService.getAll<Task>(STORES.TASKS),
        dbService.getAll<Project>(STORES.PROJECTS),
        dbService.getAll<Habit>(STORES.HABITS),
        dbService.getAll<Goal>(STORES.GOALS),
        dbService.getAll<CalendarEvent>(STORES.EVENTS),
        dbService.getAll<Rant>(STORES.RANTS),
      ]);

      // Mood Distribution from logs
      const moods: Record<string, number> = {};
      logs.forEach(log => {
        moods[log.mood] = (moods[log.mood] || 0) + 1;
      });

      const moodColors: Record<string, string> = {
        'Productive': '#10B981',
        'Flow State': '#F59E0B',
        'Neutral': '#6B7280',
        'Frustrated': '#EF4444'
      };

      const chartData = Object.keys(moods).map(key => ({
        name: key,
        value: moods[key],
        color: moodColors[key] || '#3B82F6'
      }));
      setMoodData(chartData);

      // Weekly task completion data (last 7 days)
      const today = new Date();
      const weekData: WeeklyTaskData[] = [];
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const dayName = dayNames[date.getDay()];
        
        // Count tasks completed on this day (based on dueDate for now)
        const completedOnDay = tasks.filter(t => t.completed && t.dueDate === dateStr).length;
        const createdOnDay = tasks.filter(t => t.dueDate === dateStr).length;
        
        weekData.push({
          day: dayName,
          completed: completedOnDay,
          created: createdOnDay
        });
      }
      setWeeklyTaskData(weekData);

      // Habit streaks data
      const streakData = habits
        .map(h => ({
          name: h.name.length > 15 ? h.name.substring(0, 15) + '...' : h.name,
          streak: h.streak,
          color: h.color || '#3b82f6'
        }))
        .sort((a, b) => b.streak - a.streak)
        .slice(0, 5);
      setHabitStreaks(streakData);

      // Goal progress data
      const categoryColors: Record<string, string> = {
        'Career': '#8B5CF6',
        'Personal': '#10B981',
        'Health': '#EF4444',
        'Skill': '#F59E0B'
      };
      const progressData = goals.map(g => ({
        title: g.title.length > 20 ? g.title.substring(0, 20) + '...' : g.title,
        progress: g.progress,
        category: g.category,
        color: categoryColors[g.category] || '#3B82F6'
      }));
      setGoalProgress(progressData);

      // Project status distribution
      const statusCounts: Record<string, number> = {};
      projects.forEach(p => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      const statusColors: Record<string, string> = {
        'Not Started': '#6B7280',
        'Planning': '#F59E0B',
        'In Progress': '#3B82F6',
        'On Hold': '#EF4444',
        'Completed': '#10B981',
        'Cancelled': '#991B1B'
      };
      const projectData = Object.keys(statusCounts).map(key => ({
        name: key,
        value: statusCounts[key],
        color: statusColors[key] || '#6B7280'
      }));
      setProjectStatusData(projectData);

      // Calculate statistics
      const completedTasks = tasks.filter(t => t.completed).length;
      const pendingTasks = tasks.filter(t => !t.completed).length;
      const totalTasks = tasks.length;
      const avgStreak = habits.length > 0 
        ? Math.round(habits.reduce((sum, h) => sum + h.streak, 0) / habits.length) 
        : 0;
      const completionRate = totalTasks > 0 
        ? Math.round((completedTasks / totalTasks) * 100) 
        : 0;

      const todayStr = new Date().toISOString().split('T')[0];
      const upcomingEventsCount = events.filter(e => e.date >= todayStr).length;

      setCounts({
        totalProjects: projects.length,
        completedTasks,
        pendingTasks,
        totalLogs: logs.length,
        totalHabits: habits.length,
        totalGoals: goals.length,
        upcomingEvents: upcomingEventsCount,
        totalRants: rants.length,
        avgHabitStreak: avgStreak,
        taskCompletionRate: completionRate,
      });
    };
    processData();
    
    // Listen for sync events to reload data immediately
    const handleSync = () => {
      processData();
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    
    return () => {
      window.removeEventListener('clearmind-sync', handleSync as EventListener);
    };
  }, []);

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Analytics</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Real insights from your productivity data.</p>
      </div>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-center gap-2 mb-1">
            <CheckCircle2 size={16} className="text-green-500" />
            <h4 className="text-gray-500 dark:text-gray-400 text-xs">Task Completion</h4>
          </div>
          <p className="text-2xl font-bold text-green-500">{counts.taskCompletionRate}%</p>
          <p className="text-xs text-gray-400">{counts.completedTasks}/{counts.completedTasks + counts.pendingTasks} done</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Flame size={16} className="text-orange-500" />
            <h4 className="text-gray-500 dark:text-gray-400 text-xs">Avg Habit Streak</h4>
          </div>
          <p className="text-2xl font-bold text-orange-500">{counts.avgHabitStreak}</p>
          <p className="text-xs text-gray-400">{counts.totalHabits} habits tracked</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Target size={16} className="text-purple-500" />
            <h4 className="text-gray-500 dark:text-gray-400 text-xs">Active Goals</h4>
          </div>
          <p className="text-2xl font-bold text-purple-500">{counts.totalGoals}</p>
          <p className="text-xs text-gray-400">in progress</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Calendar size={16} className="text-blue-500" />
            <h4 className="text-gray-500 dark:text-gray-400 text-xs">Upcoming Events</h4>
          </div>
          <p className="text-2xl font-bold text-blue-500">{counts.upcomingEvents}</p>
          <p className="text-xs text-gray-400">scheduled</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-4 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Brain size={16} className="text-red-500" />
            <h4 className="text-gray-500 dark:text-gray-400 text-xs">Daily Logs</h4>
          </div>
          <p className="text-2xl font-bold text-red-500">{counts.totalLogs}</p>
          <p className="text-xs text-gray-400">reflections</p>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Mood Distribution */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <PieIcon size={18} /> Mood Distribution
          </h3>
          {moodData.length > 0 ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie 
                  data={moodData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={50} 
                  outerRadius={70} 
                  paddingAngle={5} 
                  dataKey="value"
                >
                  {moodData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                  itemStyle={{ color: 'var(--text-main)' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
             <div className="h-full flex flex-col items-center justify-center text-gray-500">
               <Activity size={32} className="mb-2 opacity-50" />
               <p>No log data available yet.</p>
               <p className="text-xs mt-1">Start logging to see mood patterns.</p>
             </div>
          )}
        </div>

        {/* Weekly Task Activity */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <TrendingUp size={18} /> Weekly Task Activity
          </h3>
          {weeklyTaskData.some(d => d.completed > 0 || d.created > 0) ? (
            <ResponsiveContainer width="100%" height="85%">
              <AreaChart data={weeklyTaskData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis dataKey="day" stroke="#6B7280" fontSize={12} />
                <YAxis stroke="#6B7280" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '8px' }}
                  itemStyle={{ color: '#E5E7EB' }}
                />
                <Area type="monotone" dataKey="completed" stroke="#10B981" fill="#10B981" fillOpacity={0.3} name="Completed" />
                <Area type="monotone" dataKey="created" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.2} name="Due" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <BarChart2 size={32} className="mb-2 opacity-50" />
              <p>No task activity this week.</p>
              <p className="text-xs mt-1">Complete tasks to see trends.</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* Habit Streaks */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <Flame size={18} /> Top Habit Streaks
          </h3>
          {habitStreaks.length > 0 ? (
            <ResponsiveContainer width="100%" height="85%">
              <BarChart data={habitStreaks} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis type="number" stroke="#6B7280" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="#6B7280" fontSize={11} width={100} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '8px' }}
                  itemStyle={{ color: '#E5E7EB' }}
                />
                <Bar dataKey="streak" name="Day Streak" radius={[0, 4, 4, 0]}>
                  {habitStreaks.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <Flame size={32} className="mb-2 opacity-50" />
              <p>No habits tracked yet.</p>
              <p className="text-xs mt-1">Create habits to build streaks.</p>
            </div>
          )}
        </div>

        {/* Project Status Distribution */}
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <BarChart2 size={18} /> Project Status
          </h3>
          {projectStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie 
                  data={projectStatusData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={50} 
                  outerRadius={70} 
                  paddingAngle={5} 
                  dataKey="value"
                >
                  {projectStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '8px' }}
                  itemStyle={{ color: '#E5E7EB' }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              <BarChart2 size={32} className="mb-2 opacity-50" />
              <p>No projects created yet.</p>
              <p className="text-xs mt-1">Start a project to track progress.</p>
            </div>
          )}
        </div>
      </div>

      {/* Goal Progress Section */}
      {goalProgress.length > 0 && (
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 shadow-sm dark:shadow-none transition-colors mb-8">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <Target size={18} /> Goal Progress
          </h3>
          <div className="space-y-4">
            {goalProgress.map((goal, index) => (
              <div key={index} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{goal.title}</span>
                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${goal.color}20`, color: goal.color }}>
                    {goal.category}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${goal.progress}%`, backgroundColor: goal.color }}
                    />
                  </div>
                  <span className="text-sm font-medium" style={{ color: goal.color }}>{goal.progress}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Projects Started</h4>
            <p className="text-4xl font-bold text-green-500">{counts.totalProjects}</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Tasks Completed</h4>
            <p className="text-4xl font-bold text-blue-500">{counts.completedTasks}</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Pending Tasks</h4>
            <p className="text-4xl font-bold text-amber-500">{counts.pendingTasks}</p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
