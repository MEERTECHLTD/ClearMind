import React, { useState, useEffect } from 'react';
import { Task } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, CheckCircle, Circle, Trash2, Calendar, Bell } from 'lucide-react';

const TasksView: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission);

  useEffect(() => {
    const loadTasks = async () => {
      const data = await dbService.getAll<Task>(STORES.TASKS);
      setTasks(data.sort((a, b) => Number(a.completed) - Number(b.completed)));
    };
    loadTasks();
  }, []);

  const requestNotificationPermission = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    // Default to today if no date picked
    const dateToUse = newTaskDate || new Date().toISOString().split('T')[0];

    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      completed: false,
      priority: 'Medium',
      dueDate: dateToUse,
      notified: false
    };
    
    await dbService.put(STORES.TASKS, newTask);
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDate('');
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    const updatedTask = { ...task, completed: !task.completed };
    setTasks(tasks.map(t => t.id === id ? updatedTask : t));
    await dbService.put(STORES.TASKS, updatedTask);
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    await dbService.delete(STORES.TASKS, id);
  };

  const getPriorityColor = (p: string) => {
    switch(p) {
      case 'High': return 'text-red-500 bg-red-100 dark:bg-red-400/10';
      case 'Medium': return 'text-orange-500 bg-orange-100 dark:bg-orange-400/10';
      case 'Low': return 'text-blue-500 bg-blue-100 dark:bg-blue-400/10';
      default: return 'text-gray-500';
    }
  };

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Tasks</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Stay on top of your deliverables.</p>
        </div>
        <div className="flex items-center gap-4">
          {permission !== 'granted' && (
            <button 
              onClick={requestNotificationPermission}
              className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors"
            >
              <Bell size={16} /> Enable Reminders
            </button>
          )}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {tasks.filter(t => t.completed).length} / {tasks.length} Completed
          </div>
        </div>
      </div>

      <form onSubmit={addTask} className="mb-8 relative flex flex-col md:flex-row gap-3">
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add a new task..."
          className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl py-4 pl-6 pr-4 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-500"
        />
        <div className="relative">
          <input 
            type="date"
            value={newTaskDate}
            onChange={(e) => setNewTaskDate(e.target.value)}
            className="w-full md:w-auto h-full bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl px-4 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-500"
          />
        </div>
        <button type="submit" className="p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center">
          <Plus size={24} />
        </button>
      </form>

      <div className="space-y-3">
        {tasks.map(task => (
          <div 
            key={task.id} 
            className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200
              ${task.completed 
                ? 'bg-midnight-light/50 dark:border-gray-800/50 border-gray-200 opacity-60' 
                : 'bg-midnight-light dark:border-gray-800 border-gray-200 hover:border-blue-400'}`}
          >
            <div className="flex items-center gap-4 flex-1">
              <button 
                onClick={() => toggleTask(task.id)}
                className={`transition-colors ${task.completed ? 'text-green-500' : 'text-gray-400 hover:text-blue-500'}`}
              >
                {task.completed ? <CheckCircle size={24} /> : <Circle size={24} />}
              </button>
              <span className={`text-lg ${task.completed ? 'line-through text-gray-400' : 'dark:text-white text-gray-800'}`}>
                {task.title}
              </span>
            </div>

            <div className="flex items-center gap-4">
              {task.dueDate && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Calendar size={14} />
                  <span className="hidden sm:inline">{task.dueDate}</span>
                </div>
              )}
              <span className={`text-xs px-2 py-1 rounded font-medium ${getPriorityColor(task.priority)}`}>
                {task.priority}
              </span>
              <button 
                onClick={() => deleteTask(task.id)}
                className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>No tasks yet. Enjoy your freedom or add some work!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksView;