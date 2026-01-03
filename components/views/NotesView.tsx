import React, { useState, useEffect } from 'react';
import { Note } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Edit3, X, Save, ChevronRight, FileText, Trash2 } from 'lucide-react';

const NotesView: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeNote, setActiveNote] = useState<Partial<Note>>({});
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const loadNotes = async () => {
      const data = await dbService.getAll<Note>(STORES.NOTES);
      // Sort by lastEdited date (newest first)
      const sorted = data.sort((a, b) => {
        const dateA = new Date(a.lastEdited).getTime();
        const dateB = new Date(b.lastEdited).getTime();
        return dateB - dateA;
      });
      setNotes(sorted);
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
    setSelectedNoteId(updatedNote.id);
  };

  const openNote = (note: Note) => {
    setActiveNote(note);
    setIsEditing(true);
  };

  const toggleNote = (noteId: string) => {
    setSelectedNoteId(selectedNoteId === noteId ? null : noteId);
  };

  const deleteNote = async (e: React.MouseEvent, noteId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this note?')) return;
    
    await dbService.delete(STORES.NOTES, noteId);
    setNotes(notes.filter(n => n.id !== noteId));
    if (selectedNoteId === noteId) setSelectedNoteId(null);
  };

  const selectedNote = notes.find(n => n.id === selectedNoteId);

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
            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Notes List - Left Side */}
              <div className="w-full lg:w-1/3 overflow-y-auto space-y-2 pr-2">
                {notes.map((note, index) => (
                  <div 
                    key={note.id}
                    onClick={() => toggleNote(note.id)}
                    className={`group flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all duration-200
                      ${selectedNoteId === note.id 
                        ? 'bg-blue-500/10 border-blue-500/50 dark:border-blue-500/50' 
                        : 'bg-midnight-light dark:border-gray-800 border-gray-200 hover:border-blue-400'}`}
                  >
                    <span className="text-sm font-mono text-gray-400 w-6">{index + 1}.</span>
                    <FileText size={18} className={`flex-shrink-0 ${selectedNoteId === note.id ? 'text-blue-500' : 'text-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium truncate ${selectedNoteId === note.id ? 'text-blue-500' : 'dark:text-white text-gray-900'}`}>
                        {note.title}
                      </h3>
                      <p className="text-xs text-gray-500 truncate">{note.lastEdited}</p>
                    </div>
                    <ChevronRight 
                      size={18} 
                      className={`text-gray-400 transition-transform flex-shrink-0 ${selectedNoteId === note.id ? 'rotate-90' : ''}`} 
                    />
                  </div>
                ))}
              </div>

              {/* Note Content - Right Side */}
              <div className="hidden lg:flex flex-1 flex-col">
                {selectedNote ? (
                  <div className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 flex flex-col shadow-sm overflow-hidden">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-1">{selectedNote.title}</h3>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{selectedNote.lastEdited}</span>
                          <div className="flex gap-2">
                            {selectedNote.tags.map(tag => (
                              <span key={tag} className="text-[10px] dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 px-2 py-0.5 rounded">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => openNote(selectedNote)}
                          title="Edit note"
                          className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Edit3 size={18} />
                        </button>
                        <button 
                          onClick={(e) => deleteNote(e, selectedNote.id)}
                          title="Delete note"
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      <p className="dark:text-gray-300 text-gray-700 whitespace-pre-wrap leading-relaxed">
                        {selectedNote.content}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl flex items-center justify-center">
                    <div className="text-center text-gray-500">
                      <FileText size={48} className="mx-auto mb-3 opacity-30" />
                      <p>Select a note to view its content</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile: Show content below list when selected */}
              {selectedNote && (
                <div className="lg:hidden fixed inset-0 bg-midnight z-50 p-6 overflow-y-auto">
                  <div className="flex items-center justify-between mb-6">
                    <button 
                      onClick={() => setSelectedNoteId(null)}
                      className="text-gray-400 hover:text-white flex items-center gap-2"
                    >
                      <X size={20} />
                      Close
                    </button>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => openNote(selectedNote)}
                        title="Edit note"
                        className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg"
                      >
                        <Edit3 size={20} />
                      </button>
                      <button 
                        onClick={(e) => deleteNote(e, selectedNote.id)}
                        title="Delete note"
                        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold dark:text-white text-gray-900 mb-2">{selectedNote.title}</h3>
                  <p className="text-xs text-gray-500 mb-6">{selectedNote.lastEdited}</p>
                  <p className="dark:text-gray-300 text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {selectedNote.content}
                  </p>
                </div>
              )}
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
