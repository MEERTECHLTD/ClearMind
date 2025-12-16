import React, { useState } from 'react';
import { AlertTriangle, Trash2, Save } from 'lucide-react';

const RantCorner: React.FC = () => {
  const [rant, setRant] = useState('');

  return (
    <div className="p-8 max-w-4xl mx-auto h-[calc(100vh-64px)] flex flex-col animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-red-500">Rant Corner</h1>
            <AlertTriangle className="text-red-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400">
          Sometimes code doesn't work. Sometimes generic error messages break you. 
          Vent here. Get it out of your system. Iris listens but doesn't judge.
        </p>
      </div>

      <div className="flex-1 bg-midnight-light border border-red-200 dark:border-red-900/30 rounded-xl p-4 flex flex-col relative overflow-hidden shadow-sm dark:shadow-none">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-red-400 to-red-500"></div>
        <textarea
          value={rant}
          onChange={(e) => setRant(e.target.value)}
          placeholder="Why is the dependency tree broken? Why is CSS not cascading? Type it out..."
          className="w-full h-full bg-transparent resize-none focus:outline-none dark:text-gray-200 text-gray-800 placeholder-gray-400 dark:placeholder-gray-700 font-mono"
        />
      </div>

      <div className="mt-6 flex justify-end gap-4">
        <button 
          onClick={() => setRant('')}
          className="px-6 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-500 hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all flex items-center gap-2"
        >
          <Trash2 size={18} />
          Burn it
        </button>
        <button className="px-6 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-2 shadow-lg shadow-red-900/20">
          <Save size={18} />
          Save to Diary
        </button>
      </div>
    </div>
  );
};

export default RantCorner;