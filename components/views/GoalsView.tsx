import React, { useState, useEffect } from 'react';
import { Goal } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Target, Trophy, Clock, Edit3, Trash2, Check, X, Plus } from 'lucide-react';

const GoalsView: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Goal | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    targetDate: '',
    category: 'Personal' as Goal['category'],
    progress: 0
  });

  useEffect(() => {
    const loadGoals = async () => {
      const data = await dbService.getAll<Goal>(STORES.GOALS);
      setGoals(data);
    };
    loadGoals();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'goals') {
        loadGoals();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const handleAddGoal = async () => {
    if (!newGoal.title.trim()) return;

    const goal: Goal = {
      id: Date.now().toString(),
      title: newGoal.title,
      targetDate: newGoal.targetDate || 'No deadline',
      progress: newGoal.progress,
      category: newGoal.category
    };

    await dbService.put(STORES.GOALS, goal);
    setGoals([...goals, goal]);
    setNewGoal({ title: '', targetDate: '', category: 'Personal', progress: 0 });
    setShowAddModal(false);
  };

  const handleEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setEditForm({ ...goal });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    await dbService.put(STORES.GOALS, editForm);
    setGoals(goals.map(g => g.id === editForm.id ? editForm : g));
    setEditingId(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    await dbService.delete(STORES.GOALS, id);
    setGoals(goals.filter(g => g.id !== id));
  };

  const categories: Goal['category'][] = ['Career', 'Personal', 'Health', 'Skill'];

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Goals</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Long term vision determines short term actions.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Goal
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {goals.map(goal => (
          <div key={goal.id} className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 p-6 rounded-xl hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
            {editingId === goal.id && editForm ? (
              /* Edit Mode */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Category</label>
                    <select
                      value={editForm.category}
                      onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Goal['category'] })}
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Target Date</label>
                    <input
                      type="date"
                      value={editForm.targetDate}
                      onChange={(e) => setEditForm({ ...editForm, targetDate: e.target.value })}
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Progress: {editForm.progress}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={editForm.progress}
                    onChange={(e) => setEditForm({ ...editForm, progress: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <Check size={16} /> Save
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                  >
                    <X size={16} /> Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* View Mode */
              <>
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 dark:bg-gray-800 bg-gray-100 rounded-lg text-blue-500">
                      <Target size={24} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg dark:text-white text-gray-900">{goal.title}</h3>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">{goal.category}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(goal)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                      title="Edit goal"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(goal.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete goal"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                  <Clock size={12} />
                  <span>{goal.targetDate}</span>
                  {goal.progress === 100 && <Trophy size={14} className="text-yellow-500 ml-2" />}
                </div>

                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-500">Progress</span>
                    <span className="dark:text-white text-gray-900 font-medium">{goal.progress}%</span>
                  </div>
                  <div className="h-2 w-full dark:bg-gray-800 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${goal.progress === 100 ? 'bg-gradient-to-r from-green-500 to-emerald-500' : 'bg-gradient-to-r from-blue-600 to-purple-600'}`}
                      style={{ width: `${goal.progress}%` }}
                    ></div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
        
        {/* Add Goal Placeholder */}
        <div 
            onClick={() => setShowAddModal(true)}
            className="border border-dashed dark:border-gray-700 border-gray-400 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white hover:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/30 cursor-pointer transition-all min-h-[180px]"
        >
           <Target size={32} className="mb-3 opacity-50" />
           <p className="font-medium">Set a New Goal</p>
        </div>
      </div>

      {/* Add Goal Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-6">Create New Goal</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Goal Title</label>
                <input
                  type="text"
                  value={newGoal.title}
                  onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
                  placeholder="What do you want to achieve?"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Category</label>
                  <select
                    value={newGoal.category}
                    onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value as Goal['category'] })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Target Date</label>
                  <input
                    type="date"
                    value={newGoal.targetDate}
                    onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Initial Progress: {newGoal.progress}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={newGoal.progress}
                  onChange={(e) => setNewGoal({ ...newGoal, progress: parseInt(e.target.value) })}
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddGoal}
                disabled={!newGoal.title.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors"
              >
                Create Goal
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewGoal({ title: '', targetDate: '', category: 'Personal', progress: 0 });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalsView;
