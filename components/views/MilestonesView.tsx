import React, { useState, useEffect } from 'react';
import { Milestone } from '../../types';
import { dbService, STORES } from '../../services/db';
import { CheckCircle2, Circle, Plus, Edit2, Trash2, X, Save, Calendar } from 'lucide-react';

const MilestonesView: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    const loadMilestones = async () => {
      const data = await dbService.getAll<Milestone>(STORES.MILESTONES);
      setMilestones(data);
    };
    loadMilestones();
  }, []);

  const openAddModal = () => {
    setFormData({
      title: '',
      description: '',
      date: new Date().toISOString().split('T')[0]
    });
    setEditingMilestone(null);
    setShowModal(true);
  };

  const openEditModal = (milestone: Milestone) => {
    setFormData({
      title: milestone.title,
      description: milestone.description || '',
      date: milestone.date
    });
    setEditingMilestone(milestone);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.title.trim()) return;

    const formattedDate = new Date(formData.date).toLocaleDateString('en-US', { 
      month: 'short', 
      year: 'numeric' 
    });

    if (editingMilestone) {
      const updated: Milestone = {
        ...editingMilestone,
        title: formData.title,
        description: formData.description,
        date: formattedDate
      };
      await dbService.put(STORES.MILESTONES, updated);
      setMilestones(milestones.map(m => m.id === editingMilestone.id ? updated : m));
    } else {
      const newMilestone: Milestone = {
        id: Date.now().toString(),
        title: formData.title,
        description: formData.description,
        date: formattedDate,
        completed: false
      };
      await dbService.put(STORES.MILESTONES, newMilestone);
      setMilestones([...milestones, newMilestone]);
    }

    setShowModal(false);
    setEditingMilestone(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this milestone?')) return;
    await dbService.delete(STORES.MILESTONES, id);
    setMilestones(milestones.filter(m => m.id !== id));
  };

  const toggleMilestone = async (id: string) => {
    const m = milestones.find(m => m.id === id);
    if (!m) return;
    const updated = { ...m, completed: !m.completed };
    
    await dbService.put(STORES.MILESTONES, updated);
    setMilestones(milestones.map(item => item.id === id ? updated : item));
  };

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="mb-10 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Journey Milestones</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Visualize how far you have come.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-gray-800 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm transition-colors"
        >
          <Plus size={14} />
          Add Event
        </button>
      </div>

      <div className="relative max-w-3xl mx-auto pl-8 border-l-2 dark:border-gray-800 border-gray-300 space-y-12">
        {milestones.length === 0 ? (
          <p className="text-gray-500 italic pl-4">No milestones yet. Add your first big win!</p>
        ) : (
          milestones.map((milestone) => (
            <div key={milestone.id} className="relative group">
              {/* Dot on timeline */}
              <button
                onClick={() => toggleMilestone(milestone.id)}
                title={milestone.completed ? "Mark as incomplete" : "Mark as completed"}
                className={`absolute -left-[41px] top-1 rounded-full p-1 border-4 dark:border-midnight border-gray-100 cursor-pointer transition-colors
                ${milestone.completed ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 dark:bg-gray-800 dark:text-gray-400 hover:text-white'}`}
              >
                {milestone.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </button>

              <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl hover:border-gray-400 dark:hover:border-gray-600 transition-colors ml-4 relative shadow-sm dark:shadow-none">
                <span className="absolute -left-2 top-6 w-2 h-2 bg-midnight-light border-l border-b dark:border-gray-800 border-gray-200 transform rotate-45"></span>
                
                <div className="flex justify-between items-start mb-2">
                  <h3 className={`text-xl font-bold ${milestone.completed ? 'dark:text-white text-gray-900' : 'text-gray-500 dark:text-gray-400'}`}>
                    {milestone.title}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-blue-500 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10 px-2 py-1 rounded">
                      {milestone.date}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openEditModal(milestone)}
                        title="Edit milestone"
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(milestone.id)}
                        title="Delete milestone"
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400">{milestone.description}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold dark:text-white text-gray-900">
                {editingMilestone ? 'Edit Milestone' : 'New Milestone'}
              </h3>
              <button 
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Launched my first app"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Details about this milestone..."
                  rows={3}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Date</label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={!formData.title.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingMilestone ? 'Update' : 'Create'}
              </button>
              <button
                onClick={() => setShowModal(false)}
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

export default MilestonesView;
