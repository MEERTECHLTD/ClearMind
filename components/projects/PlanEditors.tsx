/**
 * Project plan editors — team check-ins, strategic alignment, performance
 * metrics, implementation phases, risks and resources & budget. Moved from the
 * original Project planner (components/views/ProjectsView.tsx) unchanged so all
 * of its editing capabilities stay available, now reachable from a project's
 * Plan view (#project/<id>?tab=plan) and from the portfolio (#projects).
 *
 * Writes go through `persist`, which the caller routes: personal projects via
 * the task layer's updateProject (components/tasks/actions.ts), shared-workspace
 * projects via workspaceService. Every write spreads the existing record.
 */
import React, { useState } from 'react';
import type { Project, ProjectCategory, TeamCheckIn, ProjectAlignment, PerformanceMetric, ProjectPhase, ProjectRisk, ProjectResource } from '../../types';
import { Plus, Calendar, Code, ExternalLink, Edit3, Trash2, Check, X, Clock, Users, Flag, ChevronDown, ChevronUp, Zap, DollarSign, Leaf, Heart, Monitor, GraduationCap, Building, Factory, ShoppingBag, Megaphone, FlaskConical, Landmark, HandHeart, Rocket, User, FolderOpen, MessageSquare, UserCheck, AlertCircle, Target, TrendingUp, TrendingDown, Minus, BarChart3, Compass, Layers, FileText, AlertTriangle, Wallet, PlayCircle, PauseCircle, CheckCircle2, XCircle, CircleDot, ChevronRight, Copy, Download, Upload } from 'lucide-react';

export type PlanEditor = 'checkin' | 'alignment' | 'metrics' | 'phases' | 'risks' | 'resources';


// Project Categories with icons and colors
const PROJECT_CATEGORIES: { value: ProjectCategory; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'Energy', label: 'Energy', icon: <Zap size={14} />, color: 'text-yellow-500 bg-yellow-500/10' },
  { value: 'Green Energy', label: 'Green Energy', icon: <Leaf size={14} />, color: 'text-green-500 bg-green-500/10' },
  { value: 'Finance', label: 'Finance', icon: <DollarSign size={14} />, color: 'text-emerald-500 bg-emerald-500/10' },
  { value: 'Health', label: 'Health', icon: <Heart size={14} />, color: 'text-red-500 bg-red-500/10' },
  { value: 'IT', label: 'IT', icon: <Monitor size={14} />, color: 'text-blue-500 bg-blue-500/10' },
  { value: 'Education', label: 'Education', icon: <GraduationCap size={14} />, color: 'text-purple-500 bg-purple-500/10' },
  { value: 'Construction', label: 'Construction', icon: <Building size={14} />, color: 'text-orange-500 bg-orange-500/10' },
  { value: 'Manufacturing', label: 'Manufacturing', icon: <Factory size={14} />, color: 'text-gray-500 bg-gray-500/10' },
  { value: 'Retail', label: 'Retail', icon: <ShoppingBag size={14} />, color: 'text-pink-500 bg-pink-500/10' },
  { value: 'Marketing', label: 'Marketing', icon: <Megaphone size={14} />, color: 'text-indigo-500 bg-indigo-500/10' },
  { value: 'Research', label: 'Research', icon: <FlaskConical size={14} />, color: 'text-cyan-500 bg-cyan-500/10' },
  { value: 'Government', label: 'Government', icon: <Landmark size={14} />, color: 'text-slate-500 bg-slate-500/10' },
  { value: 'Non-Profit', label: 'Non-Profit', icon: <HandHeart size={14} />, color: 'text-rose-500 bg-rose-500/10' },
  { value: 'Startup', label: 'Startup', icon: <Rocket size={14} />, color: 'text-violet-500 bg-violet-500/10' },
  { value: 'Personal', label: 'Personal', icon: <User size={14} />, color: 'text-teal-500 bg-teal-500/10' },
  { value: 'Other', label: 'Other', icon: <FolderOpen size={14} />, color: 'text-gray-400 bg-gray-400/10' },
];

const getCategoryInfo = (category?: ProjectCategory) => {
  return PROJECT_CATEGORIES.find(c => c.value === category) || PROJECT_CATEGORIES[PROJECT_CATEGORIES.length - 1];
};


export { PROJECT_CATEGORIES, getCategoryInfo };

export function PlanEditors({ project, editor, onClose, persist }: {
  project: Project | null;
  editor: PlanEditor | null;
  onClose: () => void;
  persist: (p: Project) => Promise<void> | void;
}) {
  const [newCheckIn, setNewCheckIn] = useState<Omit<TeamCheckIn, 'id'>>({
    date: new Date().toISOString().split('T')[0],
    attendees: [],
    notes: '',
    blockers: [],
    nextSteps: [],
    mood: 'Neutral'
  });
  const [newPhase, setNewPhase] = useState<Omit<ProjectPhase, 'id' | 'status' | 'progress'>>({
    name: '',
    description: '',
    order: 1,
    deliverables: [],
    startDate: '',
    endDate: ''
  });
  const [newRisk, setNewRisk] = useState<Omit<ProjectRisk, 'id' | 'status'>>({
    title: '',
    description: '',
    severity: 'Medium',
    likelihood: 'Medium',
    mitigation: ''
  });
  const [newResource, setNewResource] = useState<Omit<ProjectResource, 'id'>>({
    name: '',
    type: 'Budget',
    allocated: 0,
    used: 0,
    unit: '$'
  });
  const [newAlignment, setNewAlignment] = useState<Omit<ProjectAlignment, 'id'>>({
    strategicGoal: '',
    alignmentScore: 50,
    notes: ''
  });
  const [newMetric, setNewMetric] = useState<Omit<PerformanceMetric, 'id'>>({
    name: '',
    target: 0,
    current: 0,
    unit: '',
    trend: 'Stable'
  });

  // Add Team Check-in
  const handleAddCheckIn = async (projectId: string) => {
    if (!project) return;

    const checkIn: TeamCheckIn = {
      id: Date.now().toString(),
      date: newCheckIn.date,
      attendees: newCheckIn.attendees,
      notes: newCheckIn.notes,
      blockers: newCheckIn.blockers?.filter(b => b.trim()),
      nextSteps: newCheckIn.nextSteps?.filter(n => n.trim()),
      mood: newCheckIn.mood
    };

    const updatedProject: Project = {
      ...project,
      teamCheckIns: [...(project.teamCheckIns || []), checkIn],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
    onClose();
    setNewCheckIn({
      date: new Date().toISOString().split('T')[0],
      attendees: [],
      notes: '',
      blockers: [],
      nextSteps: [],
      mood: 'Neutral'
    });
  };

  // Add Strategic Alignment
  const handleAddAlignment = async (projectId: string) => {
    if (!project || !newAlignment.strategicGoal.trim()) return;

    const alignment: ProjectAlignment = {
      strategicGoal: newAlignment.strategicGoal,
      alignmentScore: newAlignment.alignmentScore,
      notes: newAlignment.notes
    };

    const updatedProject: Project = {
      ...project,
      alignments: [...(project.alignments || []), alignment],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
    onClose();
    setNewAlignment({
      strategicGoal: '',
      alignmentScore: 50,
      notes: ''
    });
  };

  // Delete Alignment
  const handleDeleteAlignment = async (projectId: string, goalName: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      alignments: project.alignments?.filter(a => a.strategicGoal !== goalName) || [],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Add Performance Metric
  const handleAddMetric = async (projectId: string) => {
    if (!project || !newMetric.name.trim()) return;

    const metric: PerformanceMetric = {
      id: Date.now().toString(),
      name: newMetric.name,
      target: newMetric.target,
      current: newMetric.current,
      unit: newMetric.unit,
      trend: newMetric.trend
    };

    const updatedProject: Project = {
      ...project,
      performanceMetrics: [...(project.performanceMetrics || []), metric],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
    onClose();
    setNewMetric({
      name: '',
      target: 0,
      current: 0,
      unit: '',
      trend: 'Stable'
    });
  };

  // Delete Metric
  const handleDeleteMetric = async (projectId: string, metricId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      performanceMetrics: project.performanceMetrics?.filter(m => m.id !== metricId) || [],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Update Metric Value
  const handleUpdateMetricValue = async (projectId: string, metricId: string, newValue: number) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      performanceMetrics: project.performanceMetrics?.map(m => {
        if (m.id === metricId) {
          const prevValue = m.current;
          let trend: PerformanceMetric['trend'] = 'Stable';
          if (newValue > prevValue) trend = 'Up';
          else if (newValue < prevValue) trend = 'Down';
          return { ...m, current: newValue, trend };
        }
        return m;
      }) || [],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Calculate average alignment score
  const getAverageAlignmentScore = (alignments?: ProjectAlignment[]) => {
    if (!alignments || alignments.length === 0) return null;
    const sum = alignments.reduce((acc, a) => acc + a.alignmentScore, 0);
    return Math.round(sum / alignments.length);
  };

  // Add Phase
  const handleAddPhase = async (projectId: string) => {
    if (!project || !newPhase.name.trim()) return;

    const phase: ProjectPhase = {
      id: Date.now().toString(),
      name: newPhase.name,
      description: newPhase.description,
      order: (project.implementationPlan?.phases?.length || 0) + 1,
      deliverables: newPhase.deliverables,
      startDate: newPhase.startDate || undefined,
      endDate: newPhase.endDate || undefined,
      status: 'Not Started',
      progress: 0
    };

    const updatedProject: Project = {
      ...project,
      implementationPlan: {
        ...project.implementationPlan,
        phases: [...(project.implementationPlan?.phases || []), phase]
      },
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
    setNewPhase({ name: '', description: '', order: 1, deliverables: [], startDate: '', endDate: '' });
  };

  // Update Phase Status
  const handleUpdatePhaseStatus = async (projectId: string, phaseId: string, status: ProjectPhase['status'], progress: number) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      implementationPlan: {
        ...project.implementationPlan,
        phases: project.implementationPlan?.phases?.map(p => 
          p.id === phaseId ? { ...p, status, progress } : p
        ) || []
      },
      updatedAt: new Date().toISOString()
    };

    // Calculate overall project progress based on phases
    const phases = updatedProject.implementationPlan?.phases || [];
    if (phases.length > 0) {
      const totalProgress = phases.reduce((acc, p) => acc + p.progress, 0);
      updatedProject.progress = Math.round(totalProgress / phases.length);
    }

    await persist(updatedProject);
  };

  // Delete Phase
  const handleDeletePhase = async (projectId: string, phaseId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      implementationPlan: {
        ...project.implementationPlan,
        phases: project.implementationPlan?.phases?.filter(p => p.id !== phaseId) || []
      },
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Add Risk
  const handleAddRisk = async (projectId: string) => {
    if (!project || !newRisk.title.trim()) return;

    const risk: ProjectRisk = {
      id: Date.now().toString(),
      title: newRisk.title,
      description: newRisk.description,
      severity: newRisk.severity,
      likelihood: newRisk.likelihood,
      mitigation: newRisk.mitigation,
      status: 'Open'
    };

    const updatedProject: Project = {
      ...project,
      risks: [...(project.risks || []), risk],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
    setNewRisk({ title: '', description: '', severity: 'Medium', likelihood: 'Medium', mitigation: '' });
  };

  // Update Risk Status
  const handleUpdateRiskStatus = async (projectId: string, riskId: string, status: ProjectRisk['status']) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      risks: project.risks?.map(r => r.id === riskId ? { ...r, status } : r) || [],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Delete Risk
  const handleDeleteRisk = async (projectId: string, riskId: string) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      risks: project.risks?.filter(r => r.id !== riskId) || [],
      updatedAt: new Date().toISOString()
    };

    await persist(updatedProject);
  };

  // Add Resource
  const handleAddResource = async (projectId: string) => {
    if (!project || !newResource.name.trim()) return;

    const resource: ProjectResource = {
      id: Date.now().toString(),
      name: newResource.name,
      type: newResource.type,
      allocated: newResource.allocated,
      used: newResource.used,
      unit: newResource.unit
    };

    const updatedProject: Project = {
      ...project,
      resources: [...(project.resources || []), resource],
      updatedAt: new Date().toISOString()
    };

    // Update total budget if it's a budget resource
    if (resource.type === 'Budget') {
      updatedProject.totalBudget = (updatedProject.totalBudget || 0) + resource.allocated;
      updatedProject.budgetUsed = (updatedProject.budgetUsed || 0) + resource.used;
    }

    await persist(updatedProject);
    setNewResource({ name: '', type: 'Budget', allocated: 0, used: 0, unit: '$' });
  };

  // Update Resource Usage
  const handleUpdateResourceUsage = async (projectId: string, resourceId: string, used: number) => {
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      resources: project.resources?.map(r => r.id === resourceId ? { ...r, used } : r) || [],
      updatedAt: new Date().toISOString()
    };

    // Recalculate budget used
    updatedProject.budgetUsed = updatedProject.resources
      ?.filter(r => r.type === 'Budget')
      .reduce((acc, r) => acc + r.used, 0) || 0;

    await persist(updatedProject);
  };

  // Delete Resource
  const handleDeleteResource = async (projectId: string, resourceId: string) => {
    if (!project) return;

    const resourceToDelete = project.resources?.find(r => r.id === resourceId);
    const updatedProject: Project = {
      ...project,
      resources: project.resources?.filter(r => r.id !== resourceId) || [],
      updatedAt: new Date().toISOString()
    };

    // Update budget totals
    if (resourceToDelete?.type === 'Budget') {
      updatedProject.totalBudget = (updatedProject.totalBudget || 0) - resourceToDelete.allocated;
      updatedProject.budgetUsed = (updatedProject.budgetUsed || 0) - resourceToDelete.used;
    }

    await persist(updatedProject);
  };

  // Get phase status icon
  const getPhaseStatusIcon = (status: ProjectPhase['status']) => {
    switch (status) {
      case 'Completed': return <CheckCircle2 size={14} className="text-green-500" />;
      case 'In Progress': return <PlayCircle size={14} className="text-blue-500" />;
      case 'Blocked': return <XCircle size={14} className="text-red-500" />;
      default: return <CircleDot size={14} className="text-gray-400" />;
    }
  };

  // Get risk severity color
  const getRiskSeverityColor = (severity: ProjectRisk['severity']) => {
    switch (severity) {
      case 'Critical': return 'bg-red-500/20 text-red-400';
      case 'High': return 'bg-orange-500/20 text-orange-400';
      case 'Medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'Low': return 'bg-green-500/20 text-green-400';
    }
  };

  if (!project || !editor) return null;

  return (
    <>
      {/* Team Check-in Modal */}
      {editor === 'checkin' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <h3 className="text-xl font-bold dark:text-white text-gray-900 mb-2">Add Team Check-in</h3>
            <p className="text-gray-500 text-sm mb-6">Record a team meeting or status update</p>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={newCheckIn.date}
                    onChange={(e) => setNewCheckIn({ ...newCheckIn, date: e.target.value })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Team Mood</label>
                  <select
                    value={newCheckIn.mood}
                    onChange={(e) => setNewCheckIn({ ...newCheckIn, mood: e.target.value as TeamCheckIn['mood'] })}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="Positive">Positive 😊</option>
                    <option value="Neutral">Neutral 😐</option>
                    <option value="Concerned">Concerned 😟</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Attendees (comma-separated)</label>
                <input
                  type="text"
                  value={newCheckIn.attendees.join(', ')}
                  onChange={(e) => setNewCheckIn({ ...newCheckIn, attendees: e.target.value.split(',').map(a => a.trim()).filter(a => a) })}
                  placeholder="Alice, Bob, Charlie"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Notes / Discussion Summary</label>
                <textarea
                  value={newCheckIn.notes}
                  onChange={(e) => setNewCheckIn({ ...newCheckIn, notes: e.target.value })}
                  placeholder="What was discussed in this check-in?"
                  rows={3}
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Blockers (comma-separated)</label>
                <input
                  type="text"
                  value={newCheckIn.blockers?.join(', ') || ''}
                  onChange={(e) => setNewCheckIn({ ...newCheckIn, blockers: e.target.value.split(',').map(b => b.trim()) })}
                  placeholder="Any blockers or issues?"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Next Steps (comma-separated)</label>
                <input
                  type="text"
                  value={newCheckIn.nextSteps?.join(', ') || ''}
                  onChange={(e) => setNewCheckIn({ ...newCheckIn, nextSteps: e.target.value.split(',').map(n => n.trim()) })}
                  placeholder="Action items for next meeting"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddCheckIn(project.id)}
                disabled={!newCheckIn.notes.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <UserCheck size={16} />
                Save Check-in
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewCheckIn({
                    date: new Date().toISOString().split('T')[0],
                    attendees: [],
                    notes: '',
                    blockers: [],
                    nextSteps: [],
                    mood: 'Neutral'
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

      {/* Strategic Alignment Modal */}
      {editor === 'alignment' && (() => {
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <Compass className="text-purple-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Strategic Alignment</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Connect this project to strategic goals and track alignment</p>
            
            {/* Existing Alignments */}
            {project.alignments && project.alignments.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-3">Current Alignments</h4>
                <div className="space-y-3">
                  {project.alignments.map((alignment, idx) => (
                    <div key={idx} className="dark:bg-gray-800/50 bg-gray-100 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Target size={14} className="text-purple-400" />
                          <span className="font-medium dark:text-white text-gray-900">{alignment.strategicGoal}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteAlignment(project.id, alignment.strategicGoal)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove alignment"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${
                              alignment.alignmentScore >= 70 ? 'bg-green-500' :
                              alignment.alignmentScore >= 40 ? 'bg-yellow-500' :
                              'bg-red-500'
                            }`}
                            style={{ width: `${alignment.alignmentScore}%` }}
                          ></div>
                        </div>
                        <span className={`text-sm font-medium ${
                          alignment.alignmentScore >= 70 ? 'text-green-400' :
                          alignment.alignmentScore >= 40 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {alignment.alignmentScore}%
                        </span>
                      </div>
                      {alignment.notes && (
                        <p className="text-xs text-gray-400 mt-2">{alignment.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add New Alignment */}
            <div className="border-t dark:border-gray-700 border-gray-200 pt-6">
              <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-4">Add Strategic Goal Alignment</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Strategic Goal *</label>
                  <input
                    type="text"
                    value={newAlignment.strategicGoal}
                    onChange={(e) => setNewAlignment({ ...newAlignment, strategicGoal: e.target.value })}
                    placeholder="e.g., Increase market share by 20%"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Alignment Score: {newAlignment.alignmentScore}%</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={newAlignment.alignmentScore}
                    onChange={(e) => setNewAlignment({ ...newAlignment, alignmentScore: parseInt(e.target.value) })}
                    className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Low alignment</span>
                    <span>High alignment</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Notes (optional)</label>
                  <textarea
                    value={newAlignment.notes || ''}
                    onChange={(e) => setNewAlignment({ ...newAlignment, notes: e.target.value })}
                    placeholder="How does this project contribute to this goal?"
                    rows={2}
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddAlignment(project.id)}
                disabled={!newAlignment.strategicGoal.trim()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Target size={16} />
                Add Alignment
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewAlignment({ strategicGoal: '', alignmentScore: 50, notes: '' });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Performance Metrics Modal */}
      {editor === 'metrics' && (() => {
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="text-cyan-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Performance Metrics</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Track KPIs and performance indicators for this project</p>
            
            {/* Existing Metrics */}
            {project.performanceMetrics && project.performanceMetrics.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-3">Current Metrics</h4>
                <div className="space-y-3">
                  {project.performanceMetrics.map((metric) => {
                    const progress = metric.target > 0 ? Math.min((metric.current / metric.target) * 100, 100) : 0;
                    const isOnTarget = metric.current >= metric.target;
                    return (
                    <div key={metric.id} className="dark:bg-gray-800/50 bg-gray-100 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium dark:text-white text-gray-900">{metric.name}</span>
                          {metric.trend && (
                            <span className={`flex items-center gap-0.5 text-xs ${
                              metric.trend === 'Up' ? 'text-green-400' :
                              metric.trend === 'Down' ? 'text-red-400' :
                              'text-gray-400'
                            }`}>
                              {metric.trend === 'Up' && <TrendingUp size={12} />}
                              {metric.trend === 'Down' && <TrendingDown size={12} />}
                              {metric.trend === 'Stable' && <Minus size={12} />}
                              {metric.trend}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteMetric(project.id, metric.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove metric"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${isOnTarget ? 'bg-green-500' : 'bg-cyan-500'}`}
                            style={{ width: `${progress}%` }}
                          ></div>
                        </div>
                        <span className={`text-sm font-medium ${isOnTarget ? 'text-green-400' : 'text-cyan-400'}`}>
                          {Math.round(progress)}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-400">
                        <span>Current: <span className="font-medium dark:text-white text-gray-900">{metric.current} {metric.unit}</span></span>
                        <span>Target: <span className="font-medium dark:text-white text-gray-900">{metric.target} {metric.unit}</span></span>
                      </div>
                      <div className="mt-2">
                        <label className="block text-xs text-gray-500 mb-1">Update value:</label>
                        <input
                          type="number"
                          value={metric.current}
                          onChange={(e) => handleUpdateMetricValue(project.id, metric.id, parseFloat(e.target.value) || 0)}
                          className="w-full dark:bg-gray-700 bg-white dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-600 border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm"
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* Add New Metric */}
            <div className="border-t dark:border-gray-700 border-gray-200 pt-6">
              <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-4">Add New Metric</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Metric Name *</label>
                    <input
                      type="text"
                      value={newMetric.name}
                      onChange={(e) => setNewMetric({ ...newMetric, name: e.target.value })}
                      placeholder="e.g., Customer Satisfaction"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Unit</label>
                    <input
                      type="text"
                      value={newMetric.unit}
                      onChange={(e) => setNewMetric({ ...newMetric, unit: e.target.value })}
                      placeholder="e.g., %, $, users"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Target Value *</label>
                    <input
                      type="number"
                      value={newMetric.target}
                      onChange={(e) => setNewMetric({ ...newMetric, target: parseFloat(e.target.value) || 0 })}
                      placeholder="100"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Current Value</label>
                    <input
                      type="number"
                      value={newMetric.current}
                      onChange={(e) => setNewMetric({ ...newMetric, current: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddMetric(project.id)}
                disabled={!newMetric.name.trim() || newMetric.target <= 0}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <BarChart3 size={16} />
                Add Metric
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewMetric({ name: '', target: 0, current: 0, unit: '', trend: 'Stable' });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Implementation Phases Modal */}
      {editor === 'phases' && (() => {
        const phases = project.implementationPlan?.phases || [];
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <Layers className="text-indigo-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Implementation Phases</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Define and track the phases of your project implementation plan</p>
            
            {/* Existing Phases */}
            {phases.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-3">Current Phases</h4>
                <div className="space-y-3">
                  {phases.sort((a, b) => a.order - b.order).map((phase) => (
                    <div key={phase.id} className="dark:bg-gray-800/50 bg-gray-100 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          {getPhaseStatusIcon(phase.status)}
                          <span className="font-medium dark:text-white text-gray-900">{phase.order}. {phase.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeletePhase(project.id, phase.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove phase"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {phase.description && (
                        <p className="text-xs text-gray-400 mb-2">{phase.description}</p>
                      )}
                      
                      <div className="flex items-center gap-3 mb-2">
                        <select
                          value={phase.status}
                          onChange={(e) => handleUpdatePhaseStatus(project.id, phase.id, e.target.value as ProjectPhase['status'], e.target.value === 'Completed' ? 100 : e.target.value === 'In Progress' ? 50 : 0)}
                          className="text-xs dark:bg-gray-700 bg-white dark:text-white text-gray-900 px-2 py-1 rounded border dark:border-gray-600 border-gray-300"
                        >
                          <option value="Not Started">Not Started</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                          <option value="Blocked">Blocked</option>
                        </select>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${phase.status === 'Completed' ? 'bg-green-500' : phase.status === 'Blocked' ? 'bg-red-500' : 'bg-indigo-500'}`}
                            style={{ width: `${phase.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-400">{phase.progress}%</span>
                      </div>
                      
                      {phase.deliverables && phase.deliverables.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {phase.deliverables.map((d, i) => (
                            <span key={i} className="text-[10px] dark:bg-gray-700 bg-gray-200 dark:text-gray-300 text-gray-600 px-2 py-0.5 rounded">
                              {d}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add New Phase */}
            <div className="border-t dark:border-gray-700 border-gray-200 pt-6">
              <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-4">Add New Phase</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Phase Name *</label>
                    <input
                      type="text"
                      value={newPhase.name}
                      onChange={(e) => setNewPhase({ ...newPhase, name: e.target.value })}
                      placeholder="e.g., Discovery & Planning"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Deliverables (comma-separated)</label>
                    <input
                      type="text"
                      value={newPhase.deliverables.join(', ')}
                      onChange={(e) => setNewPhase({ ...newPhase, deliverables: e.target.value.split(',').map(d => d.trim()).filter(d => d) })}
                      placeholder="e.g., Requirements Doc, Mockups"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={newPhase.description || ''}
                    onChange={(e) => setNewPhase({ ...newPhase, description: e.target.value })}
                    placeholder="Brief description of this phase"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddPhase(project.id)}
                disabled={!newPhase.name.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Layers size={16} />
                Add Phase
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewPhase({ name: '', description: '', order: 1, deliverables: [], startDate: '', endDate: '' });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Risk Management Modal */}
      {editor === 'risks' && (() => {
        const risks = project.risks || [];
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="text-orange-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Risk Management</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Identify, assess, and mitigate project risks</p>
            
            {/* Existing Risks */}
            {risks.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-3">Identified Risks</h4>
                <div className="space-y-3">
                  {risks.map((risk) => (
                    <div key={risk.id} className={`rounded-lg p-4 border-l-4 ${
                      risk.status === 'Closed' ? 'dark:bg-gray-800/30 bg-gray-50 border-gray-400' :
                      risk.severity === 'Critical' ? 'dark:bg-red-900/20 bg-red-50 border-red-500' :
                      risk.severity === 'High' ? 'dark:bg-orange-900/20 bg-orange-50 border-orange-500' :
                      risk.severity === 'Medium' ? 'dark:bg-yellow-900/20 bg-yellow-50 border-yellow-500' :
                      'dark:bg-green-900/20 bg-green-50 border-green-500'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium dark:text-white text-gray-900">{risk.title}</span>
                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${getRiskSeverityColor(risk.severity)}`}>
                            {risk.severity}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDeleteRisk(project.id, risk.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove risk"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {risk.description && (
                        <p className="text-xs text-gray-500 mb-2">{risk.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-gray-400">Likelihood: <span className="font-medium">{risk.likelihood}</span></span>
                        <select
                          value={risk.status}
                          onChange={(e) => handleUpdateRiskStatus(project.id, risk.id, e.target.value as ProjectRisk['status'])}
                          className="dark:bg-gray-700 bg-white dark:text-white text-gray-900 px-2 py-1 rounded border dark:border-gray-600 border-gray-300"
                        >
                          <option value="Open">Open</option>
                          <option value="Mitigated">Mitigated</option>
                          <option value="Closed">Closed</option>
                        </select>
                      </div>
                      {risk.mitigation && (
                        <div className="mt-2 text-xs text-gray-400">
                          <span className="font-medium">Mitigation:</span> {risk.mitigation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add New Risk */}
            <div className="border-t dark:border-gray-700 border-gray-200 pt-6">
              <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-4">Add New Risk</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Risk Title *</label>
                  <input
                    type="text"
                    value={newRisk.title}
                    onChange={(e) => setNewRisk({ ...newRisk, title: e.target.value })}
                    placeholder="e.g., Scope Creep"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Severity</label>
                    <select
                      value={newRisk.severity}
                      onChange={(e) => setNewRisk({ ...newRisk, severity: e.target.value as ProjectRisk['severity'] })}
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Likelihood</label>
                    <select
                      value={newRisk.likelihood}
                      onChange={(e) => setNewRisk({ ...newRisk, likelihood: e.target.value as ProjectRisk['likelihood'] })}
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Description</label>
                  <input
                    type="text"
                    value={newRisk.description || ''}
                    onChange={(e) => setNewRisk({ ...newRisk, description: e.target.value })}
                    placeholder="Describe the risk"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Mitigation Strategy</label>
                  <input
                    type="text"
                    value={newRisk.mitigation || ''}
                    onChange={(e) => setNewRisk({ ...newRisk, mitigation: e.target.value })}
                    placeholder="How will you mitigate this risk?"
                    className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddRisk(project.id)}
                disabled={!newRisk.title.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle size={16} />
                Add Risk
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewRisk({ title: '', description: '', severity: 'Medium', likelihood: 'Medium', mitigation: '' });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Resources & Budget Modal */}
      {editor === 'resources' && (() => {
        const resources = project.resources || [];
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <Wallet className="text-emerald-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Resources & Budget</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Track project resources, budget allocation, and usage</p>
            
            {/* Budget Summary */}
            {project.totalBudget && project.totalBudget > 0 && (
              <div className="mb-6 dark:bg-gray-800/50 bg-gray-100 rounded-lg p-4">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-2">Budget Overview</h4>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Used: ${(project.budgetUsed || 0).toLocaleString()}</span>
                      <span>Total: ${project.totalBudget.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full ${
                          ((project.budgetUsed || 0) / project.totalBudget) > 0.9 ? 'bg-red-500' :
                          ((project.budgetUsed || 0) / project.totalBudget) > 0.7 ? 'bg-yellow-500' :
                          'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(((project.budgetUsed || 0) / project.totalBudget) * 100, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                  <span className={`text-lg font-bold ${
                    ((project.budgetUsed || 0) / project.totalBudget) > 0.9 ? 'text-red-400' :
                    ((project.budgetUsed || 0) / project.totalBudget) > 0.7 ? 'text-yellow-400' :
                    'text-emerald-400'
                  }`}>
                    {Math.round(((project.budgetUsed || 0) / project.totalBudget) * 100)}%
                  </span>
                </div>
              </div>
            )}
            
            {/* Existing Resources */}
            {resources.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-3">Resources</h4>
                <div className="space-y-3">
                  {resources.map((resource) => (
                    <div key={resource.id} className="dark:bg-gray-800/50 bg-gray-100 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${
                            resource.type === 'Budget' ? 'bg-emerald-500/20 text-emerald-400' :
                            resource.type === 'Personnel' ? 'bg-blue-500/20 text-blue-400' :
                            resource.type === 'Equipment' ? 'bg-orange-500/20 text-orange-400' :
                            resource.type === 'Software' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {resource.type}
                          </span>
                          <span className="font-medium dark:text-white text-gray-900">{resource.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteResource(project.id, resource.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          title="Remove resource"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${resource.used > resource.allocated ? 'bg-red-500' : 'bg-emerald-500'}`}
                            style={{ width: `${Math.min((resource.used / resource.allocated) * 100, 100)}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {resource.used}{resource.unit} / {resource.allocated}{resource.unit}
                        </span>
                      </div>
                      <div className="mt-2">
                        <label className="block text-xs text-gray-500 mb-1">Update usage:</label>
                        <input
                          type="number"
                          value={resource.used}
                          onChange={(e) => handleUpdateResourceUsage(project.id, resource.id, parseFloat(e.target.value) || 0)}
                          className="w-full dark:bg-gray-700 bg-white dark:text-white text-gray-900 px-3 py-2 rounded-lg border dark:border-gray-600 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add New Resource */}
            <div className="border-t dark:border-gray-700 border-gray-200 pt-6">
              <h4 className="text-sm font-medium dark:text-white text-gray-900 mb-4">Add New Resource</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Resource Name *</label>
                    <input
                      type="text"
                      value={newResource.name}
                      onChange={(e) => setNewResource({ ...newResource, name: e.target.value })}
                      placeholder="e.g., Development Budget"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Type</label>
                    <select
                      value={newResource.type}
                      onChange={(e) => setNewResource({ ...newResource, type: e.target.value as ProjectResource['type'] })}
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Budget">Budget</option>
                      <option value="Personnel">Personnel</option>
                      <option value="Equipment">Equipment</option>
                      <option value="Software">Software</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Allocated *</label>
                    <input
                      type="number"
                      value={newResource.allocated}
                      onChange={(e) => setNewResource({ ...newResource, allocated: parseFloat(e.target.value) || 0 })}
                      placeholder="100000"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Used</label>
                    <input
                      type="number"
                      value={newResource.used}
                      onChange={(e) => setNewResource({ ...newResource, used: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Unit</label>
                    <input
                      type="text"
                      value={newResource.unit}
                      onChange={(e) => setNewResource({ ...newResource, unit: e.target.value })}
                      placeholder="$, hours, units"
                      className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => handleAddResource(project.id)}
                disabled={!newResource.name.trim() || newResource.allocated <= 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                Add Resource
              </button>
              <button
                onClick={() => {
                  onClose();
                  setNewResource({ name: '', type: 'Budget', allocated: 0, used: 0, unit: '$' });
                }}
                className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </>
  );
}
