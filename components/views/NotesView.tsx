import React, { useState, useEffect } from 'react';
import { Note } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Edit3, X, Save } from 'lucide-react';

const NotesView: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeNote, setActiveNote] = useState<Partial<Note>>({});
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const loadNotes = async () => {
      const data = await dbService.getAll<Note>(STORES.NOTES);
      setNotes(data.reverse()); // Newest first
    };
    loadNotes();
  }, []);

  const handleSave = async () => {
    if (!activeNote.title || !activeNote.content) return;
    
    let updatedNote: Note;

    if (activeNote.id) {
      // Update
      updatedNote = { 
        ...activeNote as Note, 
        lastEdited: new Date().toLocaleString() 
      };
      setNotes(notes.map(n => n.id === activeNote.id ? updatedNote : n));
    } else {
      // Create
      updatedNote = {
        id: Date.now().toString(),
        title: activeNote.title,
        content: activeNote.content,
        tags: ['Draft'],
        lastEdited: new Date().toLocaleString()
      };
      setNotes([updatedNote, ...notes]);
    }
    
    await dbService.put(STORES.NOTES, updatedNote);
    setIsEditing(false);
    setActiveNote({});
  };

  const openNote = (note: Note) => {
    setActiveNote(note);
    setIsEditing(true);
  };

  return (
    <div className="p-8 h-full flex flex-col animate-fade-in">
      {!isEditing ? (
        <>
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Notes</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Capture your thoughts and technical specs.</p>
            </div>
            <button 
              onClick={() => { setActiveNote({}); setIsEditing(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus size={16} />
              New Note
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
               <p>No notes created yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto">
              {notes.map(note => (
                <div 
                  key={note.id} 
                  onClick={() => openNote(note)}
                  className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 hover:border-blue-500/50 cursor-pointer transition-all group flex flex-col h-64 shadow-sm dark:shadow-none"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold dark:text-white text-gray-900 truncate">{note.title}</h3>
                    <Edit3 size={16} className="text-gray-400 group-hover:text-blue-500" />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-4 flex-1 whitespace-pre-line">{note.content}</p>
                  <div className="flex items-center justify-between pt-4 border-t dark:border-gray-800 border-gray-200">
                    <span className="text-xs text-gray-500">{note.lastEdited}</span>
                    <div className="flex gap-2">
                      {note.tags.map(tag => (
                        <span key={tag} className="text-[10px] dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 px-2 py-0.5 rounded">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="h-full flex flex-col animate-fade-in">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => setIsEditing(false)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2"
            >
              <X size={20} />
              Cancel
            </button>
            <button 
              onClick={handleSave}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg flex items-center gap-2 font-medium"
            >
              <Save size={18} />
              Save Note
            </button>
          </div>
          <div className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 flex flex-col shadow-sm dark:shadow-none transition-colors">
            <input 
              type="text" 
              placeholder="Note Title"
              value={activeNote.title || ''}
              onChange={(e) => setActiveNote({...activeNote, title: e.target.value})}
              className="bg-transparent text-3xl font-bold dark:text-white text-gray-900 mb-6 focus:outline-none placeholder-gray-400 dark:placeholder-gray-600"
            />
            <textarea 
              placeholder="Start typing..."
              value={activeNote.content || ''}
              onChange={(e) => setActiveNote({...activeNote, content: e.target.value})}
              className="flex-1 bg-transparent dark:text-gray-300 text-gray-800 resize-none focus:outline-none leading-relaxed text-lg placeholder-gray-400 dark:placeholder-gray-700"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default NotesView;
