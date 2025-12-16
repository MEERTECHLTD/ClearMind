import React, { useState, useEffect } from 'react';
import { Habit } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Check, Flame } from 'lucide-react';

const HabitsView: React.FC = () => {
  const [habits, setHabits] = useState<Habit[]>([]);

  useEffect(() => {
    const loadHabits = async () => {
      const data = await dbService.getAll<Habit>(STORES.HABITS);
      setHabits(data);
    };
    loadHabits();
  }, []);

  const toggleToday = async (id: string) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;

    const updatedHabit = {
        ...habit,
        completedToday: !habit.completedToday,
        streak: !habit.completedToday ? habit.streak + 1 : Math.max(0, habit.streak - 1),
        history: [...habit.history.slice(0, -1), !habit.completedToday]
    };

    setHabits(habits.map(h => h.id === id ? updatedHabit : h));
    await dbService.put(STORES.HABITS, updatedHabit);
  };

  const handleAddHabit = async () => {
    const name = prompt("Enter habit name:");
    if (!name) return;

    const newHabit: Habit = {
        id: Date.now().toString(),
        name,
        streak: 0,
        completedToday: false,
        history: [false, false, false, false, false, false, false]
    };
    
    await dbService.put(STORES.HABITS, newHabit);
    setHabits([...habits, newHabit]);
  };

  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Habit Tracker</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Consistency is the key to mastery.</p>
        </div>
        <button 
          onClick={handleAddHabit}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium"
        >
          <Plus size={16} />
          Add Habit
        </button>
      </div>

      <div className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl overflow-hidden shadow-sm dark:shadow-none transition-colors">
        <div className="grid grid-cols-12 gap-4 p-4 dark:bg-gray-900/50 bg-gray-100 border-b dark:border-gray-800 border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          <div className="col-span-4">Habit Name</div>
          <div className="col-span-6 flex justify-between px-4">
             {days.map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div className="col-span-2 text-right">Streak</div>
        </div>

        {habits.length === 0 ? (
           <div className="p-8 text-center text-gray-500">No habits tracked yet.</div>
        ) : (
          habits.map((habit) => (
            <div key={habit.id} className="grid grid-cols-12 gap-4 p-4 border-b dark:border-gray-800 border-gray-200 items-center hover:bg-gray-100 dark:hover:bg-gray-800/30 transition-colors">
              <div className="col-span-4 font-medium dark:text-white text-gray-800 flex items-center gap-2">
                <button 
                  onClick={() => toggleToday(habit.id)}
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-all
                    ${habit.completedToday 
                      ? 'bg-green-500 border-green-500 text-white' 
                      : 'border-gray-400 dark:border-gray-600 hover:border-green-500 text-transparent'}`}
                >
                  <Check size={14} />
                </button>
                <span className="truncate">{habit.name}</span>
              </div>
              
              <div className="col-span-6 flex justify-between px-4">
                {habit.history.map((done, idx) => (
                  <div 
                    key={idx} 
                    className={`w-3 h-3 rounded-sm ${done ? 'bg-blue-500' : 'dark:bg-gray-800 bg-gray-300'}`}
                    title={done ? 'Done' : 'Missed'}
                  ></div>
                ))}
              </div>

              <div className="col-span-2 text-right flex items-center justify-end gap-2 text-orange-500 font-bold">
                <Flame size={16} className={habit.streak > 0 ? 'fill-orange-500' : 'text-gray-400'} />
                {habit.streak}
              </div>
            </div>
          ))
        )}
      </div>
      
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-100 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/50 p-6 rounded-xl">
          <h4 className="text-blue-600 dark:text-blue-400 font-medium mb-1">Completion Rate</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">--%</p>
        </div>
        <div className="bg-purple-100 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-900/50 p-6 rounded-xl">
          <h4 className="text-purple-600 dark:text-purple-400 font-medium mb-1">Total Active</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">{habits.length} Habits</p>
        </div>
        <div className="bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-900/50 p-6 rounded-xl">
          <h4 className="text-orange-600 dark:text-orange-400 font-medium mb-1">Longest Streak</h4>
          <p className="text-2xl font-bold dark:text-white text-gray-900">
            {habits.length > 0 ? Math.max(...habits.map(h => h.streak)) : 0} Days
          </p>
        </div>
      </div>
    </div>
  );
};

export default HabitsView;
