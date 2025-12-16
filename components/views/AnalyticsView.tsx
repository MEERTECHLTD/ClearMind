import React, { useEffect, useState } from 'react';
import { BarChart2, PieChart as PieIcon, Activity } from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { LogEntry, Task, Project } from '../../types';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';

const AnalyticsView: React.FC = () => {
  const [moodData, setMoodData] = useState<{name: string, value: number, color: string}[]>([]);
  const [counts, setCounts] = useState({
    totalProjects: 0,
    completedTasks: 0,
    totalLogs: 0
  });

  useEffect(() => {
    const processData = async () => {
      const logs = await dbService.getAll<LogEntry>(STORES.LOGS);
      const tasks = await dbService.getAll<Task>(STORES.TASKS);
      const projects = await dbService.getAll<Project>(STORES.PROJECTS);

      // Mood Distribution
      const moods: Record<string, number> = {};
      logs.forEach(log => {
        moods[log.mood] = (moods[log.mood] || 0) + 1;
      });

      const moodColors: Record<string, string> = {
        'Productive': '#10B981', // green
        'Flow State': '#F59E0B', // yellow/orange
        'Neutral': '#6B7280',    // gray
        'Frustrated': '#EF4444'  // red
      };

      const chartData = Object.keys(moods).map(key => ({
        name: key,
        value: moods[key],
        color: moodColors[key] || '#3B82F6'
      }));

      setMoodData(chartData);
      setCounts({
        totalProjects: projects.length,
        completedTasks: tasks.filter(t => t.completed).length,
        totalLogs: logs.length
      });
    };
    processData();
  }, []);

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Analytics</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Real insights from your data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
            <PieIcon size={18} /> Mood Distribution
          </h3>
          {moodData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={moodData} 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={60} 
                  outerRadius={80} 
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
             </div>
          )}
        </div>

        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 h-80 shadow-sm dark:shadow-none transition-colors flex flex-col items-center justify-center">
          <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 w-full text-left flex items-center gap-2">
            <BarChart2 size={18} /> Productivity Hours
          </h3>
          <div className="text-center text-gray-500 dark:text-gray-400">
            <BarChart2 size={48} className="mx-auto mb-3 opacity-30" />
            <p>Not enough data to calculate hourly productivity.</p>
            <p className="text-xs mt-1">Start logging your work to see patterns.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Total Logs</h4>
            <p className="text-4xl font-bold dark:text-white text-gray-900">{counts.totalLogs}</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Projects Started</h4>
            <p className="text-4xl font-bold text-green-500">{counts.totalProjects}</p>
        </div>
        <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl text-center shadow-sm dark:shadow-none transition-colors">
            <h4 className="text-gray-500 dark:text-gray-400 text-sm mb-2">Tasks Completed</h4>
            <p className="text-4xl font-bold text-blue-500">{counts.completedTasks}</p>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
