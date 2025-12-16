import React, { useState, useEffect } from 'react';
import { Goal } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Target, Trophy, Clock } from 'lucide-react';

const GoalsView: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    const loadGoals = async () => {
      const data = await dbService.getAll<Goal>(STORES.GOALS);
      setGoals(data);
    };
    loadGoals();
  }, []);

  const handleAddGoal = async () => {
    const title = prompt("Enter your goal:");
    if (!title) return;

    const newGoal: Goal = {
      id: Date.now().toString(),
      title,
      targetDate: 'Dec 2024',
      progress: 0,
      category: 'Personal'
    };

    await dbService.put(STORES.GOALS, newGoal);
    setGoals([...goals, newGoal]);
  };

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="mb-8">
        <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Goals</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">Long term vision determines short term actions.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {goals.map(goal => (
          <div key={goal.id} className="bg-midnight-light border dark:border-gray-800 border-gray-200 p-6 rounded-xl hover:border-blue-500/50 transition-colors shadow-sm dark:shadow-none">
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
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                  <Clock size={12} />
                  {goal.targetDate}
                </div>
                <Trophy size={16} className={goal.progress === 100 ? 'text-yellow-500' : 'text-gray-400'} />
              </div>
            </div>

            <div className="mt-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-500">Progress</span>
                <span className="dark:text-white text-gray-900 font-medium">{goal.progress}%</span>
              </div>
              <div className="h-2 w-full dark:bg-gray-800 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-600 to-purple-600" 
                  style={{ width: `${goal.progress}%` }}
                ></div>
              </div>
            </div>
          </div>
        ))}
        
        {/* Add Goal Placeholder */}
        <div 
            onClick={handleAddGoal}
            className="border border-dashed dark:border-gray-700 border-gray-400 rounded-xl p-6 flex flex-col items-center justify-center text-gray-500 hover:text-gray-800 dark:hover:text-white hover:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800/30 cursor-pointer transition-all min-h-[180px]"
        >
           <Target size={32} className="mb-3 opacity-50" />
           <p className="font-medium">Set a New Goal</p>
        </div>
      </div>
    </div>
  );
};

export default GoalsView;
