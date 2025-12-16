import React, { useState, useEffect } from 'react';
import { Milestone } from '../../types';
import { dbService, STORES } from '../../services/db';
import { CheckCircle2, Circle, Plus } from 'lucide-react';

const MilestonesView: React.FC = () => {
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  useEffect(() => {
    const loadMilestones = async () => {
      const data = await dbService.getAll<Milestone>(STORES.MILESTONES);
      setMilestones(data);
    };
    loadMilestones();
  }, []);

  const handleAddMilestone = async () => {
      const title = prompt("Enter milestone title:");
      if (!title) return;
      const description = prompt("Description:");
      
      const newMilestone: Milestone = {
          id: Date.now().toString(),
          title,
          description: description || '',
          date: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          completed: false
      };
      
      await dbService.put(STORES.MILESTONES, newMilestone);
      setMilestones([...milestones, newMilestone]);
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
          onClick={handleAddMilestone}
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
              <div 
                onClick={() => toggleMilestone(milestone.id)}
                className={`absolute -left-[41px] top-1 rounded-full p-1 border-4 dark:border-midnight border-gray-100 cursor-pointer transition-colors
                ${milestone.completed ? 'bg-blue-500 text-white' : 'bg-gray-700 text-gray-300 dark:bg-gray-800 dark:text-gray-400 hover:text-white'}`}
              >
                {milestone.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
              </div>

              <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl hover:border-gray-400 dark:hover:border-gray-600 transition-colors ml-4 relative shadow-sm dark:shadow-none">
                <span className="absolute -left-2 top-6 w-2 h-2 bg-midnight-light border-l border-b dark:border-gray-800 border-gray-200 transform rotate-45"></span>
                
                <div className="flex justify-between items-start mb-2">
                   <h3 className={`text-xl font-bold ${milestone.completed ? 'dark:text-white text-gray-900' : 'text-gray-500 dark:text-gray-400'}`}>
                     {milestone.title}
                   </h3>
                   <span className="text-sm font-mono text-blue-500 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10 px-2 py-1 rounded">
                     {milestone.date}
                   </span>
                </div>
                <p className="text-gray-600 dark:text-gray-400">{milestone.description}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default MilestonesView;
