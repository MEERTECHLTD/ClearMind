import React, { useState, useEffect } from 'react';
import { Application } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, ExternalLink, Edit2, Trash2, X, Save, Calendar, Briefcase, GraduationCap, FileText, Check, Clock, XCircle, Send, FolderOpen } from 'lucide-react';

const ApplicationsView: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingApplication, setEditingApplication] = useState<Application | null>(null);
  const [filter, setFilter] = useState<'all' | 'job' | 'grant' | 'other'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | Application['status']>('all');
  
  const [formData, setFormData] = useState({
    name: '',
    link: '',
    type: 'job' as Application['type'],
    status: 'draft' as Application['status'],
    openingDate: '',
    closingDate: '',
    submissionDeadline: '',
    submittedDate: '',
    notes: '',
    organization: ''
  });

  useEffect(() => {
    const loadApplications = async () => {
      try {
        const data = await dbService.getAll<Application>(STORES.APPLICATIONS);
        setApplications(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      } catch (err) {
        console.error("Failed to load applications", err);
      } finally {
        setTimeout(() => setIsLoading(false), 500);
      }
    };
    loadApplications();
  }, []);

  const resetForm = () => {
    setFormData({
      name: '',
      link: '',
      type: 'job',
      status: 'draft',
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
      default: return <FileText size={16} className="text-gray-500" />;
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

  const filteredApplications = applications.filter(app => {
    if (filter !== 'all' && app.type !== filter) return false;
    if (statusFilter !== 'all' && app.status !== statusFilter) return false;
    return true;
  });

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
          <p className="text-gray-500 dark:text-gray-400 text-sm">Track your job and grant applications.</p>
        </div>
        <button 
          onClick={openAddModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Application
        </button>
      </div>

      {/* Filters */}
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
        <div className="text-sm text-gray-500 ml-auto">
          {filteredApplications.length} application{filteredApplications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Applications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredApplications.map((app) => (
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

            <div className="mb-4">
              {getStatusBadge(app.status)}
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
        ))}
      </div>

      {filteredApplications.length === 0 && (
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as Application['type'] })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="job">Job</option>
                    <option value="grant">Grant</option>
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
};

export default ApplicationsView;
