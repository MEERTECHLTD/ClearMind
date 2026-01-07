import React, { useState, useEffect } from 'react';
import { Project, ProjectMilestone } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Calendar, Code, ExternalLink, Edit3, Trash2, Check, X, Clock, Users, Flag, ChevronDown, ChevronUp } from 'lucide-react';

const ProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Project | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    status: 'In Progress' as Project['status'],
    tags: '',
    deadline: '',
    startDate: '',
    reportingStructure: '',
    team: '',
    priority: 'Medium' as Project['priority'],
    category: '',
    notes: ''
  });

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await dbService.getAll<Project>(STORES.PROJECTS);
        setProjects(data);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setTimeout(() => setIsLoading(false), 500);
      }
    };
    loadProjects();
  }, []);

  const handleAddProject = async () => {
    if (!newProject.title.trim()) return;
    
    const project: Project = {
      id: Date.now().toString(),
      title: newProject.title,
      description: newProject.description || '',
      status: newProject.status,
      progress: 0,
      tags: newProject.tags.split(',').map(t => t.trim()).filter(t => t),
      deadline: newProject.deadline || undefined,
      startDate: newProject.startDate || undefined,
      reportingStructure: newProject.reportingStructure || undefined,
      team: newProject.team ? newProject.team.split(',').map(t => t.trim()).filter(t => t) : undefined,
      priority: newProject.priority || 'Medium',
      category: newProject.category || undefined,
      notes: newProject.notes || undefined,
      projectMilestones: []
    };

    await dbService.put(STORES.PROJECTS, project);
    setProjects(prev => [...prev, project]);
    setNewProject({ 
      title: '', 
      description: '', 
      status: 'In Progress', 
      tags: '', 
      deadline: '',
      startDate: '',
      reportingStructure: '',
      team: '',
      priority: 'Medium',
      category: '',
      notes: ''
    });
    setShowAddModal(false);
  };

  const handleEdit = (project: Project) => {
    setEditingId(project.id);
    setEditForm({ ...project });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    await dbService.put(STORES.PROJECTS, editForm);
    setProjects(projects.map(p => p.id === editForm.id ? editForm : p));
    setEditingId(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    await dbService.delete(STORES.PROJECTS, id);
    setProjects(projects.filter(p => p.id !== id));
  };

  const statuses: Project['status'][] = ['In Progress', 'Completed', 'On Hold'];

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-gray-500 font-medium animate-pulse">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Projects</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Manage your active development efforts.</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 hover:border-gray-400 dark:hover:border-gray-700 transition-all group shadow-sm dark:shadow-none">
            {editingId === project.id && editForm ? (
              /* Edit Mode */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Project title"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={2}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    placeholder="Project description"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Status</label>
                    <select
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Project['status'] })}
                      title="Project status"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {statuses.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Deadline</label>
                    <input
                      type="date"
                      value={editForm.deadline || ''}
                      onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                      title="Project deadline"
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
                    title="Project progress"
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={editForm.tags.join(', ')}
                    onChange={(e) => setEditForm({ ...editForm, tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="react, typescript, api"
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
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Code className="text-blue-500 dark:text-blue-400" size={20} />
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(project)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                      title="Edit project"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                      title="Delete project"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{project.title}</h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4 h-10 line-clamp-2">{project.description}</p>
                
                {/* Deadline display */}
                {project.deadline && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                    <Calendar size={12} />
                    <span>Deadline: {formatDate(project.deadline)}</span>
                  </div>
                )}

                {/* Status badge */}
                <div className="mb-4">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                    project.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                    project.status === 'On Hold' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {project.status}
                  </span>
                </div>
                
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Progress</span>
                    <span>{project.progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                    <div 
                      className={`h-1.5 rounded-full ${project.progress === 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                      style={{ width: `${project.progress}%` }}
                    ></div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t dark:border-gray-800/50 border-gray-200">
                  <div className="flex gap-2 flex-wrap">
                    {project.tags.map(tag => (
                      <span key={tag} className="text-[10px] uppercase tracking-wider dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 px-2 py-1 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <ExternalLink size={14} className="text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer flex-shrink-0" />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add Project Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-6">Create New Project</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Project Title *</label>
                <input
                  type="text"
                  value={newProject.title}
                  onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                  placeholder="My awesome project"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Description</label>
                <textarea
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="What is this project about?"
                  rows={3}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Status</label>
                  <select
                    value={newProject.status}
                    onChange={(e) => setNewProject({ ...newProject, status: e.target.value as Project['status'] })}
                    title="Project status"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {statuses.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Priority</label>
                  <select
                    value={newProject.priority}
                    onChange={(e) => setNewProject({ ...newProject, priority: e.target.value as Project['priority'] })}
                    title="Project priority"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newProject.startDate}
                    onChange={(e) => setNewProject({ ...newProject, startDate: e.target.value })}
                    title="Project start date"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Deadline</label>
                  <input
                    type="date"
                    value={newProject.deadline}
                    onChange={(e) => setNewProject({ ...newProject, deadline: e.target.value })}
                    title="Project deadline"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Category</label>
                <input
                  type="text"
                  value={newProject.category}
                  onChange={(e) => setNewProject({ ...newProject, category: e.target.value })}
                  placeholder="e.g., Development, Research, Marketing"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Reporting Structure</label>
                <input
                  type="text"
                  value={newProject.reportingStructure}
                  onChange={(e) => setNewProject({ ...newProject, reportingStructure: e.target.value })}
                  placeholder="e.g., Reports to: John Smith (Project Manager)"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Team Members (comma-separated)</label>
                <input
                  type="text"
                  value={newProject.team}
                  onChange={(e) => setNewProject({ ...newProject, team: e.target.value })}
                  placeholder="Alice, Bob, Charlie"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={newProject.tags}
                  onChange={(e) => setNewProject({ ...newProject, tags: e.target.value })}
                  placeholder="react, typescript, frontend"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Notes</label>
                <textarea
                  value={newProject.notes}
                  onChange={(e) => setNewProject({ ...newProject, notes: e.target.value })}
                  placeholder="Additional notes about this project..."
                  rows={2}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddProject}
                disabled={!newProject.title.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors"
              >
                Create Project
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewProject({ 
                    title: '', 
                    description: '', 
                    status: 'In Progress', 
                    tags: '', 
                    deadline: '',
                    startDate: '',
                    reportingStructure: '',
                    team: '',
                    priority: 'Medium',
                    category: '',
                    notes: ''
                  });
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

export default ProjectsView;