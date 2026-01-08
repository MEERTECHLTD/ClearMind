import React, { useState, useEffect, useMemo } from 'react';
import { Application, ApplicationPreferences } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, ExternalLink, Edit2, Trash2, X, Save, Calendar, Briefcase, GraduationCap, FileText, Check, Clock, XCircle, Send, FolderOpen, ArrowUpDown, Layers, Award } from 'lucide-react';

const PREFS_KEY = 'application-preferences';

const ApplicationsView: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [filter, setFilter] = useState<'all' | Application['type']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Application['status']>('all');
  
  // Sorting and Grouping preferences (saved to localStorage)
  const [sortBy, setSortBy] = useState<'deadline' | 'priority' | 'created' | 'name'>(() => {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      try { return JSON.parse(saved).sortBy || 'deadline'; } catch { return 'deadline'; }
    }
    return 'deadline';
  });
  const [groupBy, setGroupBy] = useState<'none' | 'type' | 'status' | 'priority'>(() => {
    const saved = localStorage.getItem(PREFS_KEY);
    if (saved) {
      try { return JSON.parse(saved).groupBy || 'none'; } catch { return 'none'; }
    }
    return 'none';
  });
  
  const [formData, setFormData] = useState({
    name: '',
    link: '',
    type: 'job' as Application['type'],
    status: 'draft' as Application['status'],
    priority: 'Medium' as Application['priority'],
    openingDate: '',
    closingDate: '',
    submissionDeadline: '',
    submittedDate: '',
    notes: '',
    organization: ''
  });

  // Save preferences to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ sortBy, groupBy }));
  }, [sortBy, groupBy]);

  useEffect(() => {
    const loadApplications = async () => {
      try {
        const data = await dbService.getAll<Application>(STORES.APPLICATIONS);
        setApplications(data);
      } catch (err) {
        console.error("Failed to load applications", err);
      } finally {
        setTimeout(() => setIsLoading(false), 500);
      }
    };
    loadApplications();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'applications') {
        loadApplications();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      link: '',
      type: 'job',
      status: 'draft',
      priority: 'Medium',
      openingDate: '',
      closingDate: '',
      submissionDeadline: '',
      submittedDate: '',
      notes: '',
      organization: ''
    });
  };

  const openAddModal = () => {
    resetForm();
    setEditingApplication(null);
    setShowModal(true);
  };

  const openEditModal = (app: Application) => {
    setFormData({
      name: app.name,
      link: app.link || '',
      type: app.type,
      status: app.status,
      priority: app.priority || 'Medium',
      openingDate: app.openingDate || '',
      closingDate: app.closingDate || '',
      submissionDeadline: app.submissionDeadline || '',
      submittedDate: app.submittedDate || '',
      notes: app.notes || '',
      organization: app.organization || ''
    });
    setEditingApplication(app);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;

    if (editingApplication) {
      const updated: Application = {
        ...editingApplication,
        ...formData,
        updatedAt: new Date().toISOString()
      };
      await dbService.put(STORES.APPLICATIONS, updated);
      setApplications(applications.map(a => a.id === editingApplication.id ? updated : a));
    } else {
      const newApp: Application = {
        id: Date.now().toString(),
        ...formData,
        createdAt: new Date().toISOString()
      };
      await dbService.put(STORES.APPLICATIONS, newApp);
      setApplications([newApp, ...applications]);
    }

    setShowModal(false);
    setEditingApplication(null);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this application?')) return;
    await dbService.delete(STORES.APPLICATIONS, id);
    setApplications(applications.filter(a => a.id !== id));
  };

  const getTypeIcon = (type: Application['type']) => {
    switch (type) {
      case 'job': return <Briefcase size={16} className="text-blue-500" />;
      case 'grant': return <GraduationCap size={16} className="text-green-500" />;
      case 'scholarship': return <Award size={16} className="text-purple-500" />;
      default: return <FileText size={16} className="text-gray-500" />;
    }
  };

  const getPriorityBadge = (priority: Application['priority']) => {
    const styles: Record<Application['priority'], string> = {
      High: 'bg-red-500/20 text-red-400 border-red-500/30',
      Medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      Low: 'bg-green-500/20 text-green-400 border-green-500/30'
    };
    return (
      <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded border ${styles[priority]}`}>
        {priority}
      </span>
    );
  };

  const getPriorityValue = (priority: Application['priority']): number => {
    switch (priority) {
      case 'High': return 3;
      case 'Medium': return 2;
      case 'Low': return 1;
      default: return 0;
    }
  };

  const getStatusBadge = (status: Application['status']) => {
    const styles: Record<Application['status'], string> = {
      draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      open: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      submitted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      closed: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30'
    };

    const icons: Record<Application['status'], React.ReactNode> = {
      draft: <FileText size={12} />,
      open: <FolderOpen size={12} />,
      submitted: <Send size={12} />,
      closed: <Clock size={12} />,
      accepted: <Check size={12} />,
      rejected: <XCircle size={12} />
    };

    return (
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${styles[status]}`}>
        {icons[status]}
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isDeadlineSoon = (deadline?: string) => {
    if (!deadline) return false;
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  };

  // Filter, sort, and group applications
  const processedApplications = useMemo(() => {
    // First filter
    let filtered = applications.filter(app => {
      if (filter !== 'all' && app.type !== filter) return false;
      if (statusFilter !== 'all' && app.status !== statusFilter) return false;
      return true;
    });

    // Then sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'deadline':
          const dateA = a.submissionDeadline ? new Date(a.submissionDeadline).getTime() : Infinity;
          const dateB = b.submissionDeadline ? new Date(b.submissionDeadline).getTime() : Infinity;
          return dateA - dateB;
        case 'priority':
          return getPriorityValue(b.priority || 'Medium') - getPriorityValue(a.priority || 'Medium');
        case 'name':
          return a.name.localeCompare(b.name);
        case 'created':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return filtered;
  }, [applications, filter, statusFilter, sortBy]);

  // Group applications if grouping is enabled
  const groupedApplications = useMemo(() => {
    if (groupBy === 'none') return null;

    const groups: Record<string, Application[]> = {};
    
    processedApplications.forEach(app => {
      let key: string;
      switch (groupBy) {
        case 'type':
          key = app.type.charAt(0).toUpperCase() + app.type.slice(1);
          break;
        case 'status':
          key = app.status.charAt(0).toUpperCase() + app.status.slice(1);
          break;
        case 'priority':
          key = (app.priority || 'Medium') + ' Priority';
          break;
        default:
          key = 'Other';
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(app);
    });

    return groups;
  }, [processedApplications, groupBy]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)]">
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 border-4 border-gray-800 rounded-full"></div>
          <div className="absolute inset-0 border-4 border-blue-500 rounded-full border-t-transparent animate-spin"></div>
        </div>
        <p className="text-gray-500 font-medium animate-pulse">Loading applications...</p>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Applications</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Track your job, grant, and scholarship applications.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Application
        </button>
      </div>

      {/* Filters and Sorting */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Type:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Types</option>
            <option value="job">Jobs</option>
            <option value="grant">Grants</option>
            <option value="scholarship">Scholarships</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="submitted">Submitted</option>
            <option value="closed">Closed</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
          >
            <option value="deadline">Deadline</option>
            <option value="priority">Priority</option>
            <option value="created">Created Date</option>
            <option value="name">Name</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500">Group:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as typeof groupBy)}
            className="bg-midnight-light border dark:border-gray-700 border-gray-300 rounded-lg px-3 py-1.5 text-sm dark:text-white text-gray-900 focus:outline-none focus:border-blue-500"
          >
            <option value="none">No Grouping</option>
            <option value="type">By Type</option>
            <option value="status">By Status</option>
            <option value="priority">By Priority</option>
          </select>
        </div>
        <div className="text-sm text-gray-500 ml-auto">
          {processedApplications.length} application{processedApplications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Applications Grid - Grouped or Ungrouped */}
      {groupedApplications ? (
        // Grouped view
        <div className="space-y-8">
          {Object.entries(groupedApplications).map(([groupName, apps]: [string, Application[]]) => (
            <div key={groupName}>
              <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                {groupName}
                <span className="text-sm font-normal text-gray-500">({apps.length})</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {apps.map((app) => renderApplicationCard(app))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Ungrouped view
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {processedApplications.map((app) => renderApplicationCard(app))}
        </div>
      )}

      {processedApplications.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Briefcase size={48} className="mx-auto mb-4 opacity-50" />
          <p>No applications yet. Add your first application to track!</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold dark:text-white text-gray-900">
                {editingApplication ? 'Edit Application' : 'New Application'}
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
                <label className="block text-sm text-gray-500 mb-1">Application Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Software Engineer at Google"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Organization</label>
                <input
                  type="text"
                  value={formData.organization}
                  onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                  placeholder="Company or organization name"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Application Link</label>
                <input
                  type="url"
                  value={formData.link}
                  onChange={(e) => setFormData({ ...formData, link: e.target.value })}
                  placeholder="https://..."
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Application['type'] })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="job">Job</option>
                    <option value="grant">Grant</option>
                    <option value="scholarship">Scholarship</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as Application['status'] })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="draft">Draft</option>
                    <option value="open">Open</option>
                    <option value="submitted">Submitted</option>
                    <option value="closed">Closed</option>
                    <option value="accepted">Accepted</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as Application['priority'] })}
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
                  <label className="block text-sm text-gray-500 mb-1">Opening Date</label>
                  <input
                    type="date"
                    value={formData.openingDate}
                    onChange={(e) => setFormData({ ...formData, openingDate: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Closing Date</label>
                  <input
                    type="date"
                    value={formData.closingDate}
                    onChange={(e) => setFormData({ ...formData, closingDate: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Submission Deadline</label>
                  <input
                    type="date"
                    value={formData.submissionDeadline}
                    onChange={(e) => setFormData({ ...formData, submissionDeadline: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Submitted Date</label>
                  <input
                    type="date"
                    value={formData.submittedDate}
                    onChange={(e) => setFormData({ ...formData, submittedDate: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this application..."
                  rows={3}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={!formData.name.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                {editingApplication ? 'Update' : 'Create'}
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

  // Render individual application card
  function renderApplicationCard(app: Application) {
    return (
      <div 
        key={app.id} 
        className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 hover:border-gray-400 dark:hover:border-gray-700 transition-all group shadow-sm dark:shadow-none"
      >
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2">
            {getTypeIcon(app.type)}
            <span className="text-xs uppercase tracking-wider text-gray-500">{app.type}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => openEditModal(app)}
              className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Edit application"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={() => handleDelete(app.id)}
              className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
              title="Delete application"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <h3 className="text-lg font-semibold dark:text-white text-gray-900 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {app.name}
        </h3>
        
        {app.organization && (
          <p className="text-sm text-gray-500 mb-3">{app.organization}</p>
        )}

        <div className="flex items-center gap-2 mb-4">
          {getStatusBadge(app.status)}
          {app.priority && getPriorityBadge(app.priority)}
        </div>

        {/* Dates */}
        <div className="space-y-2 text-xs text-gray-500 mb-4">
          {app.submissionDeadline && (
            <div className={`flex items-center gap-2 ${isDeadlineSoon(app.submissionDeadline) ? 'text-orange-500' : ''}`}>
              <Calendar size={12} />
              <span>Deadline: {formatDate(app.submissionDeadline)}</span>
              {isDeadlineSoon(app.submissionDeadline) && <span className="text-orange-500 font-medium">Soon!</span>}
            </div>
          )}
          {app.openingDate && (
            <div className="flex items-center gap-2">
              <Clock size={12} />
              <span>Opens: {formatDate(app.openingDate)}</span>
            </div>
          )}
          {app.closingDate && (
            <div className="flex items-center gap-2">
              <Clock size={12} />
              <span>Closes: {formatDate(app.closingDate)}</span>
            </div>
          )}
          {app.submittedDate && (
            <div className="flex items-center gap-2 text-green-500">
              <Send size={12} />
              <span>Submitted: {formatDate(app.submittedDate)}</span>
            </div>
          )}
        </div>

        {/* Notes preview */}
        {app.notes && (
          <p className="text-sm text-gray-400 line-clamp-2 mb-4">{app.notes}</p>
        )}

        {/* Link */}
        {app.link && (
          <a
            href={app.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-500 hover:text-blue-400 transition-colors"
          >
            <ExternalLink size={14} />
            Open Application
          </a>
        )}
      </div>
    );
  }
};

export default ApplicationsView;
