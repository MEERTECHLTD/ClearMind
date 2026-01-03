import React, { useState, useEffect, useMemo } from 'react';
import { Task } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, CheckCircle, Circle, Trash2, Calendar, Bell, Clock, Edit2, X, Save, ArrowUpDown } from 'lucide-react';

const TasksView: React.FC = () => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [newTaskTime, setNewTaskTime] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [permission, setPermission] = useState<NotificationPermission>(Notification.permission);
  
  // Edit state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriority, setEditPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  
  // Sort state
  const [sortBy, setSortBy] = useState<'default' | 'priority-high' | 'priority-low' | 'date'>('default');

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

  const getNextTaskNumber = async (): Promise<number> => {
    const allTasks = await dbService.getAll<Task>(STORES.TASKS);
    const maxNumber = allTasks.reduce((max, task) => Math.max(max, task.taskNumber || 0), 0);
    return maxNumber + 1;
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    
    // Default to today if no date picked
    const dateToUse = newTaskDate || new Date().toISOString().split('T')[0];
    const taskNumber = await getNextTaskNumber();

    const newTask: Task = {
      id: Date.now().toString(),
      title: newTaskTitle,
      completed: false,
      priority: newTaskPriority,
      dueDate: dateToUse,
      dueTime: newTaskTime || undefined,
      taskNumber,
      notified: false
    };
    
    await dbService.put(STORES.TASKS, newTask);
    setTasks([newTask, ...tasks]);
    setNewTaskTitle('');
    setNewTaskDate('');
    setNewTaskTime('');
    setNewTaskPriority('Medium');
  };

  const startEditing = (task: Task) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDate(task.dueDate || '');
    setEditTime(task.dueTime || '');
    setEditPriority(task.priority);
  };

  const cancelEditing = () => {
    setEditingTaskId(null);
    setEditTitle('');
    setEditDate('');
    setEditTime('');
    setEditPriority('Medium');
  };

  const saveEdit = async () => {
    if (!editingTaskId || !editTitle.trim()) return;
    
    const task = tasks.find(t => t.id === editingTaskId);
    if (!task) return;

    const updatedTask: Task = {
      ...task,
      title: editTitle,
      dueDate: editDate || undefined,
      dueTime: editTime || undefined,
      priority: editPriority
    };

    await dbService.put(STORES.TASKS, updatedTask);
    setTasks(tasks.map(t => t.id === editingTaskId ? updatedTask : t));
    cancelEditing();
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
      case 'High': return 'text-red-500 bg-red-100 dark:bg-red-500/20 border-red-300 dark:border-red-500/30';
      case 'Medium': return 'text-green-500 bg-green-100 dark:bg-green-500/20 border-green-300 dark:border-green-500/30';
      case 'Low': return 'text-blue-500 bg-blue-100 dark:bg-blue-500/20 border-blue-300 dark:border-blue-500/30';
      default: return 'text-gray-500';
    }
  };

  const getPriorityDot = (p: string) => {
    switch(p) {
      case 'High': return 'bg-red-500';
      case 'Medium': return 'bg-green-500';
      case 'Low': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const formatTime = (time: string) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const getPriorityValue = (priority: 'High' | 'Medium' | 'Low'): number => {
    switch (priority) {
      case 'High': return 3;
      case 'Medium': return 2;
      case 'Low': return 1;
      default: return 0;
    }
  };

  const sortedTasks = useMemo(() => {
    const sorted = [...tasks];
    
    switch (sortBy) {
      case 'priority-high':
        return sorted.sort((a, b) => {
          if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
          return getPriorityValue(b.priority) - getPriorityValue(a.priority);
        });
      case 'priority-low':
        return sorted.sort((a, b) => {
          if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
          return getPriorityValue(a.priority) - getPriorityValue(b.priority);
        });
      case 'date':
        return sorted.sort((a, b) => {
          if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
          const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return dateA - dateB;
        });
      default:
        return sorted.sort((a, b) => Number(a.completed) - Number(b.completed));
    }
  }, [tasks, sortBy]);

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
          
          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown size={16} className="text-gray-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              title="Sort tasks"
              className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="default">Default</option>
              <option value="priority-high">Priority: High to Low</option>
              <option value="priority-low">Priority: Low to High</option>
              <option value="date">Due Date</option>
            </select>
          </div>
          
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {tasks.filter(t => t.completed).length} / {tasks.length} Completed
          </div>
        </div>
      </div>

      <form onSubmit={addTask} className="mb-8 space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl py-4 pl-6 pr-4 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 transition-colors placeholder-gray-500"
          />
          <button type="submit" title="Add task" className="p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 flex items-center justify-center">
            <Plus size={24} />
          </button>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {/* Priority Selector */}
          <div className="flex items-center gap-2 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl px-4 py-2">
            <span className="text-sm text-gray-500 dark:text-gray-400">Priority:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setNewTaskPriority('High')}
                title="High priority"
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  newTaskPriority === 'High' ? 'bg-red-500 ring-2 ring-red-300' : 'bg-red-500/30 hover:bg-red-500/50'
                }`}
              >
                {newTaskPriority === 'High' && <CheckCircle size={14} className="text-white" />}
              </button>
              <button
                type="button"
                onClick={() => setNewTaskPriority('Medium')}
                title="Medium priority"
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  newTaskPriority === 'Medium' ? 'bg-green-500 ring-2 ring-green-300' : 'bg-green-500/30 hover:bg-green-500/50'
                }`}
              >
                {newTaskPriority === 'Medium' && <CheckCircle size={14} className="text-white" />}
              </button>
              <button
                type="button"
                onClick={() => setNewTaskPriority('Low')}
                title="Low priority"
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                  newTaskPriority === 'Low' ? 'bg-blue-500 ring-2 ring-blue-300' : 'bg-blue-500/30 hover:bg-blue-500/50'
                }`}
              >
                {newTaskPriority === 'Low' && <CheckCircle size={14} className="text-white" />}
              </button>
            </div>
          </div>

          {/* Date Picker */}
          <div className="relative">
            <input 
              type="date"
              value={newTaskDate}
              onChange={(e) => setNewTaskDate(e.target.value)}
              title="Due date"
              className="h-full bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl px-4 py-2 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Time Picker */}
          <div className="relative flex items-center gap-2 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl px-4 py-2">
            <Clock size={16} className="text-gray-500" />
            <input 
              type="time"
              value={newTaskTime}
              onChange={(e) => setNewTaskTime(e.target.value)}
              title="Due time"
              className="bg-transparent dark:text-white text-gray-900 focus:outline-none"
            />
          </div>
        </div>
      </form>

      <div className="space-y-3">
        {sortedTasks.map(task => (
          <div 
            key={task.id} 
            className={`group flex items-center justify-between p-4 rounded-xl border transition-all duration-200
              ${task.completed 
                ? 'bg-midnight-light/50 dark:border-gray-800/50 border-gray-200 opacity-60' 
                : 'bg-midnight-light dark:border-gray-800 border-gray-200 hover:border-blue-400'}`}
          >
            {editingTaskId === task.id ? (
              // Edit Mode
              <div className="flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Task title"
                    className="flex-1 bg-midnight border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-2 dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Priority Selector for Edit */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Priority:</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setEditPriority('High')}
                        title="High priority"
                        className={`w-5 h-5 rounded-full transition-all ${
                          editPriority === 'High' ? 'bg-red-500 ring-2 ring-red-300' : 'bg-red-500/30 hover:bg-red-500/50'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setEditPriority('Medium')}
                        title="Medium priority"
                        className={`w-5 h-5 rounded-full transition-all ${
                          editPriority === 'Medium' ? 'bg-green-500 ring-2 ring-green-300' : 'bg-green-500/30 hover:bg-green-500/50'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setEditPriority('Low')}
                        title="Low priority"
                        className={`w-5 h-5 rounded-full transition-all ${
                          editPriority === 'Low' ? 'bg-blue-500 ring-2 ring-blue-300' : 'bg-blue-500/30 hover:bg-blue-500/50'
                        }`}
                      />
                    </div>
                  </div>
                  <input 
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    title="Due date"
                    className="bg-midnight border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                  <input 
                    type="time"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    title="Due time"
                    className="bg-midnight border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2 ml-auto">
                    <button 
                      onClick={saveEdit}
                      title="Save changes"
                      className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <Save size={16} />
                    </button>
                    <button 
                      onClick={cancelEditing}
                      title="Cancel editing"
                      className="p-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              // View Mode
              <>
                <div className="flex items-center gap-4 flex-1">
                  <button 
                    onClick={() => toggleTask(task.id)}
                    title={task.completed ? "Mark incomplete" : "Mark complete"}
                    className={`transition-colors ${task.completed ? 'text-green-500' : 'text-gray-400 hover:text-blue-500'}`}
                  >
                    {task.completed ? <CheckCircle size={24} /> : <Circle size={24} />}
                  </button>
                  
                  {/* Task Number Badge */}
                  {task.taskNumber && (
                    <span className="text-xs font-mono bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded">
                      #{task.taskNumber}
                    </span>
                  )}
                  
                  {/* Priority Dot */}
                  <span className={`w-2.5 h-2.5 rounded-full ${getPriorityDot(task.priority)}`} title={`${task.priority} priority`} />
                  
                  <span className={`text-lg ${task.completed ? 'line-through text-gray-400' : 'dark:text-white text-gray-800'}`}>
                    {task.title}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Date & Time Display */}
                  {(task.dueDate || task.dueTime) && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {task.dueDate && (
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span className="hidden sm:inline">{task.dueDate}</span>
                        </div>
                      )}
                      {task.dueTime && (
                        <div className="flex items-center gap-1">
                          <Clock size={14} />
                          <span className="hidden sm:inline">{formatTime(task.dueTime)}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Priority Badge */}
                  <span className={`text-xs px-2 py-1 rounded-full font-medium border ${getPriorityColor(task.priority)}`}>
                    {task.priority}
                  </span>
                  
                  {/* Edit Button */}
                  <button 
                    onClick={() => startEditing(task)}
                    title="Edit task"
                    className="text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Edit2 size={18} />
                  </button>
                  
                  {/* Delete Button */}
                  <button 
                    onClick={() => deleteTask(task.id)}
                    title="Delete task"
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </>
            )}
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