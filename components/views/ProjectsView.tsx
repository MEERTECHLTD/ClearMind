import React, { useState, useEffect } from 'react';
import { Project } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, MoreVertical, Calendar, Code, ExternalLink } from 'lucide-react';

const ProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const data = await dbService.getAll<Project>(STORES.PROJECTS);
        setProjects(data);
      } catch (err) {
        console.error("Failed to load projects", err);
      } finally {
        setTimeout(() => setIsLoading(false), 500); // Small delay for UX transition
      }
    };
    loadProjects();
  }, []);

  const handleAddProject = async () => {
    // Simple prompt for now to ensure functionality without complex modal UI overhead
    const title = prompt("Enter project title:");
    if (!title) return;
    
    const description = prompt("Enter project description:", "A new exciting endeavor.");
    
    const newProject: Project = {
      id: Date.now().toString(),
      title,
      description: description || '',
      status: 'In Progress',
      progress: 0,
      tags: ['New']
    };

    await dbService.put(STORES.PROJECTS, newProject);
    setProjects(prev => [...prev, newProject]);
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
          onClick={handleAddProject}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Project
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div key={project.id} className="bg-midnight-light border dark:border-gray-800 border-gray-200 rounded-xl p-6 hover:border-gray-400 dark:hover:border-gray-700 transition-all group shadow-sm dark:shadow-none">
            <div className="flex justify-between items-start mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Code className="text-blue-500 dark:text-blue-400" size={20} />
              </div>
              <button className="text-gray-500 hover:text-gray-900 dark:hover:text-white">
                <MoreVertical size={16} />
              </button>
            </div>
            
            <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{project.title}</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 h-10 line-clamp-2">{project.description}</p>
            
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
              <div className="flex gap-2">
                {project.tags.map(tag => (
                  <span key={tag} className="text-[10px] uppercase tracking-wider dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 px-2 py-1 rounded">
                    {tag}
                  </span>
                ))}
              </div>
              <ExternalLink size={14} className="text-gray-500 hover:text-gray-900 dark:hover:text-white cursor-pointer" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProjectsView;