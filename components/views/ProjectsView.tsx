import React, { useState, useEffect, useRef } from 'react';
import { Project, ProjectMilestone, ProjectCategory, TeamCheckIn, ProjectAlignment, PerformanceMetric, ProjectPhase, ProjectRisk, ProjectResource } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Plus, Calendar, Code, ExternalLink, Edit3, Trash2, Check, X, Clock, Users, Flag, ChevronDown, ChevronUp, Zap, DollarSign, Leaf, Heart, Monitor, GraduationCap, Building, Factory, ShoppingBag, Megaphone, FlaskConical, Landmark, HandHeart, Rocket, User, FolderOpen, MessageSquare, UserCheck, AlertCircle, Target, TrendingUp, TrendingDown, Minus, BarChart3, Compass, Layers, FileText, AlertTriangle, Wallet, PlayCircle, PauseCircle, CheckCircle2, XCircle, CircleDot, ChevronRight, Copy, Download, Upload } from 'lucide-react';
import { PROJECT_TEMPLATES, ProjectTemplate, generatePhasesFromTemplate, generateRisksFromTemplate, generateMetricsFromTemplate } from '../../utils/projectTemplates';
import * as XLSX from 'xlsx';

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

const ProjectsView: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Project | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ProjectCategory | 'All'>('All');
  const [showCheckInModal, setShowCheckInModal] = useState<string | null>(null);
  const [showAlignmentModal, setShowAlignmentModal] = useState<string | null>(null);
  const [showMetricsModal, setShowMetricsModal] = useState<string | null>(null);
  const [showPhasesModal, setShowPhasesModal] = useState<string | null>(null);
  const [showRisksModal, setShowRisksModal] = useState<string | null>(null);
  const [showResourcesModal, setShowResourcesModal] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
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
  const [newProject, setNewProject] = useState({
    title: '',
    description: '',
    status: 'Planning' as Project['status'],
    tags: '',
    deadline: '',
    startDate: '',
    reportingStructure: '',
    team: '',
    priority: 'Medium' as Project['priority'],
    category: '' as ProjectCategory | '',
    notes: '',
    projectManager: '',
    stakeholders: ''
  });

  // Excel import/export state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Download Excel Template
  const downloadExcelTemplate = () => {
    // Create template data with headers and example row
    const templateData = [
      {
        'Title*': 'Example Project',
        'Description': 'Project description here',
        'Status': 'Planning',
        'Priority': 'Medium',
        'Category': 'IT',
        'Start Date': '2026-01-15',
        'Deadline': '2026-06-30',
        'Project Manager': 'John Doe',
        'Team Members': 'Alice, Bob, Charlie',
        'Stakeholders': 'CEO, CTO',
        'Tags': 'web, development, priority',
        'Notes': 'Additional notes here',
        'Reporting Structure': 'Reports to: CTO',
        'Total Budget': '50000',
        'Health Status': 'On Track'
      }
    ];

    // Create instructions sheet
    const instructions = [
      { 'Instructions': 'ClearMind Project Import Template' },
      { 'Instructions': '' },
      { 'Instructions': 'Required Fields:' },
      { 'Instructions': '- Title* (required): The name of your project' },
      { 'Instructions': '' },
      { 'Instructions': 'Optional Fields:' },
      { 'Instructions': '- Description: Brief description of the project' },
      { 'Instructions': '- Status: Not Started, Planning, In Progress, On Hold, Completed, Cancelled' },
      { 'Instructions': '- Priority: Critical, High, Medium, Low' },
      { 'Instructions': '- Category: Energy, Green Energy, Finance, Health, IT, Education, Construction, Manufacturing, Retail, Marketing, Research, Government, Non-Profit, Startup, Personal, Other' },
      { 'Instructions': '- Start Date: Format YYYY-MM-DD' },
      { 'Instructions': '- Deadline: Format YYYY-MM-DD' },
      { 'Instructions': '- Project Manager: Name of the project manager' },
      { 'Instructions': '- Team Members: Comma-separated list of team members' },
      { 'Instructions': '- Stakeholders: Comma-separated list of stakeholders' },
      { 'Instructions': '- Tags: Comma-separated tags' },
      { 'Instructions': '- Notes: Additional notes' },
      { 'Instructions': '- Reporting Structure: e.g., "Reports to: Manager Name"' },
      { 'Instructions': '- Total Budget: Numeric value' },
      { 'Instructions': '- Health Status: On Track, At Risk, Off Track' },
      { 'Instructions': '' },
      { 'Instructions': 'Tips:' },
      { 'Instructions': '- Delete the example row before adding your data' },
      { 'Instructions': '- You can add multiple projects (one per row)' },
      { 'Instructions': '- Save the file as .xlsx before uploading' },
    ];

    // Create workbook with two sheets
    const wb = XLSX.utils.book_new();
    
    // Projects sheet
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 25 }, // Title
      { wch: 40 }, // Description
      { wch: 15 }, // Status
      { wch: 12 }, // Priority
      { wch: 15 }, // Category
      { wch: 12 }, // Start Date
      { wch: 12 }, // Deadline
      { wch: 20 }, // Project Manager
      { wch: 30 }, // Team Members
      { wch: 25 }, // Stakeholders
      { wch: 25 }, // Tags
      { wch: 30 }, // Notes
      { wch: 25 }, // Reporting Structure
      { wch: 12 }, // Total Budget
      { wch: 12 }, // Health Status
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Projects');
    
    // Instructions sheet
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // Download the file
    XLSX.writeFile(wb, 'ClearMind_Project_Template.xlsx');
  };

  // Parse and import Excel file
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      
      // Get the first sheet (Projects)
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];
      
      if (jsonData.length === 0) {
        setImportError('No data found in the Excel file');
        setIsImporting(false);
        return;
      }

      const validStatuses = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
      const validPriorities = ['Critical', 'High', 'Medium', 'Low'];
      const validCategories = ['Energy', 'Green Energy', 'Finance', 'Health', 'IT', 'Education', 'Construction', 'Manufacturing', 'Retail', 'Marketing', 'Research', 'Government', 'Non-Profit', 'Startup', 'Personal', 'Other'];
      const validHealthStatuses = ['On Track', 'At Risk', 'Off Track'];

      let importedCount = 0;
      const errors: string[] = [];

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNum = i + 2; // Excel rows start at 1, plus header row

        // Get title (required)
        const title = row['Title*'] || row['Title'];
        if (!title || typeof title !== 'string' || !title.trim()) {
          errors.push(`Row ${rowNum}: Missing required field "Title"`);
          continue;
        }

        // Parse status
        let status: Project['status'] = 'Planning';
        if (row['Status'] && validStatuses.includes(row['Status'])) {
          status = row['Status'] as Project['status'];
        }

        // Parse priority
        let priority: Project['priority'] = 'Medium';
        if (row['Priority'] && validPriorities.includes(row['Priority'])) {
          priority = row['Priority'] as Project['priority'];
        }

        // Parse category
        let category: ProjectCategory | undefined = undefined;
        if (row['Category'] && validCategories.includes(row['Category'])) {
          category = row['Category'] as ProjectCategory;
        }

        // Parse health status
        let healthStatus: Project['healthStatus'] = 'On Track';
        if (row['Health Status'] && validHealthStatuses.includes(row['Health Status'])) {
          healthStatus = row['Health Status'] as Project['healthStatus'];
        }

        // Parse dates
        const parseDate = (dateValue: any): string | undefined => {
          if (!dateValue) return undefined;
          if (typeof dateValue === 'number') {
            // Excel serial date
            const date = XLSX.SSF.parse_date_code(dateValue);
            return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
          }
          if (typeof dateValue === 'string') {
            // Try to parse as ISO date
            const match = dateValue.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (match) return dateValue;
          }
          return undefined;
        };

        // Parse comma-separated values
        const parseList = (value: any): string[] => {
          if (!value) return [];
          return String(value).split(',').map(s => s.trim()).filter(s => s);
        };

        // Create project
        const project: Project = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          title: title.trim(),
          description: row['Description'] ? String(row['Description']).trim() : '',
          status,
          progress: 0,
          tags: parseList(row['Tags']),
          deadline: parseDate(row['Deadline']),
          startDate: parseDate(row['Start Date']),
          projectManager: row['Project Manager'] ? String(row['Project Manager']).trim() : undefined,
          team: parseList(row['Team Members']),
          stakeholders: parseList(row['Stakeholders']),
          priority,
          category,
          notes: row['Notes'] ? String(row['Notes']).trim() : undefined,
          reportingStructure: row['Reporting Structure'] ? String(row['Reporting Structure']).trim() : undefined,
          totalBudget: row['Total Budget'] ? Number(row['Total Budget']) : undefined,
          healthStatus,
          projectMilestones: [],
          teamCheckIns: [],
          createdAt: new Date().toISOString()
        };

        await dbService.put(STORES.PROJECTS, project);
        importedCount++;
      }

      // Reload projects
      const updatedProjects = await dbService.getAll<Project>(STORES.PROJECTS);
      setProjects(updatedProjects);

      if (errors.length > 0) {
        setImportError(`Imported ${importedCount} projects. Errors: ${errors.join('; ')}`);
      } else {
        setImportSuccess(`Successfully imported ${importedCount} project${importedCount !== 1 ? 's' : ''}!`);
      }

      // Clear success message after 5 seconds
      setTimeout(() => setImportSuccess(null), 5000);
    } catch (error) {
      console.error('Excel import error:', error);
      setImportError('Failed to parse Excel file. Please ensure it matches the template format.');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'projects') {
        loadProjects();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
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
      category: (newProject.category as ProjectCategory) || undefined,
      notes: newProject.notes || undefined,
      projectMilestones: [],
      projectManager: newProject.projectManager || undefined,
      stakeholders: newProject.stakeholders ? newProject.stakeholders.split(',').map(s => s.trim()).filter(s => s) : undefined,
      teamCheckIns: [],
      healthStatus: 'On Track',
      createdAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, project);
    setProjects(prev => [...prev, project]);
    setNewProject({ 
      title: '', 
      description: '', 
      status: 'Planning', 
      tags: '', 
      deadline: '',
      startDate: '',
      reportingStructure: '',
      team: '',
      priority: 'Medium',
      category: '',
      notes: '',
      projectManager: '',
      stakeholders: ''
    });
    setShowAddModal(false);
  };

  // Add Team Check-in
  const handleAddCheckIn = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setShowCheckInModal(null);
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
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setShowAlignmentModal(null);
    setNewAlignment({
      strategicGoal: '',
      alignmentScore: 50,
      notes: ''
    });
  };

  // Delete Alignment
  const handleDeleteAlignment = async (projectId: string, goalName: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      alignments: project.alignments?.filter(a => a.strategicGoal !== goalName) || [],
      updatedAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Add Performance Metric
  const handleAddMetric = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setShowMetricsModal(null);
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
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      performanceMetrics: project.performanceMetrics?.filter(m => m.id !== metricId) || [],
      updatedAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Update Metric Value
  const handleUpdateMetricValue = async (projectId: string, metricId: string, newValue: number) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Calculate average alignment score
  const getAverageAlignmentScore = (alignments?: ProjectAlignment[]) => {
    if (!alignments || alignments.length === 0) return null;
    const sum = alignments.reduce((acc, a) => acc + a.alignmentScore, 0);
    return Math.round(sum / alignments.length);
  };

  // Add Phase
  const handleAddPhase = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setNewPhase({ name: '', description: '', order: 1, deliverables: [], startDate: '', endDate: '' });
  };

  // Update Phase Status
  const handleUpdatePhaseStatus = async (projectId: string, phaseId: string, status: ProjectPhase['status'], progress: number) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Delete Phase
  const handleDeletePhase = async (projectId: string, phaseId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      implementationPlan: {
        ...project.implementationPlan,
        phases: project.implementationPlan?.phases?.filter(p => p.id !== phaseId) || []
      },
      updatedAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Add Risk
  const handleAddRisk = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setNewRisk({ title: '', description: '', severity: 'Medium', likelihood: 'Medium', mitigation: '' });
  };

  // Update Risk Status
  const handleUpdateRiskStatus = async (projectId: string, riskId: string, status: ProjectRisk['status']) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      risks: project.risks?.map(r => r.id === riskId ? { ...r, status } : r) || [],
      updatedAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Delete Risk
  const handleDeleteRisk = async (projectId: string, riskId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const updatedProject: Project = {
      ...project,
      risks: project.risks?.filter(r => r.id !== riskId) || [],
      updatedAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Add Resource
  const handleAddResource = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
    setNewResource({ name: '', type: 'Budget', allocated: 0, used: 0, unit: '$' });
  };

  // Update Resource Usage
  const handleUpdateResourceUsage = async (projectId: string, resourceId: string, used: number) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Delete Resource
  const handleDeleteResource = async (projectId: string, resourceId: string) => {
    const project = projects.find(p => p.id === projectId);
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

    await dbService.put(STORES.PROJECTS, updatedProject);
    setProjects(projects.map(p => p.id === projectId ? updatedProject : p));
  };

  // Apply Template to New Project
  const handleApplyTemplate = (template: ProjectTemplate) => {
    setSelectedTemplate(template);
    setNewProject({
      ...newProject,
      title: '',
      description: template.description,
      category: template.category,
      tags: template.suggestedTags.join(', ')
    });
    setShowTemplateModal(false);
    setShowAddModal(true);
  };

  // Create project from template with all defaults
  const handleCreateFromTemplate = async (template: ProjectTemplate) => {
    const phases = generatePhasesFromTemplate(template);
    const risks = generateRisksFromTemplate(template);
    const metrics = generateMetricsFromTemplate(template);

    const project: Project = {
      id: Date.now().toString(),
      title: `New ${template.name}`,
      description: template.description,
      status: 'Planning',
      progress: 0,
      tags: template.suggestedTags,
      category: template.category,
      priority: 'Medium',
      implementationPlan: {
        phases,
        objectives: [],
        scope: '',
        outOfScope: [],
        assumptions: [],
        constraints: []
      },
      risks,
      performanceMetrics: metrics,
      teamCheckIns: [],
      healthStatus: 'On Track',
      createdAt: new Date().toISOString()
    };

    await dbService.put(STORES.PROJECTS, project);
    setProjects(prev => [...prev, project]);
    setShowTemplateModal(false);
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

  // Filter projects by category
  const filteredProjects = selectedCategory === 'All' 
    ? projects 
    : projects.filter(p => p.category === selectedCategory);

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

  const statuses: Project['status'][] = ['Not Started', 'Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
  const priorities: Project['priority'][] = ['Critical', 'High', 'Medium', 'Low'];

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
    <div className="p-8 animate-fade-in overflow-y-auto h-full">
      {/* Hidden file input for Excel upload */}
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleExcelUpload}
        accept=".xlsx,.xls"
        className="hidden"
      />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold dark:text-white text-gray-900 mb-1">Projects</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Manage your projects with implementation plans, team check-ins, and more.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Excel Template Download */}
          <button 
            onClick={downloadExcelTemplate}
            className="dark:bg-green-900/30 bg-green-100 hover:bg-green-200 dark:hover:bg-green-900/50 dark:text-green-400 text-green-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border dark:border-green-800 border-green-300"
            title="Download Excel template to bulk import projects"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Template</span>
          </button>
          {/* Excel Upload */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="dark:bg-purple-900/30 bg-purple-100 hover:bg-purple-200 dark:hover:bg-purple-900/50 dark:text-purple-400 text-purple-700 px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors border dark:border-purple-800 border-purple-300 disabled:opacity-50"
            title="Upload Excel file to import projects"
          >
            {isImporting ? (
              <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            <span className="hidden sm:inline">{isImporting ? 'Importing...' : 'Import'}</span>
          </button>
          <button 
            onClick={() => setShowTemplateModal(true)}
            className="dark:bg-gray-800 bg-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-white text-gray-900 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Copy size={16} />
            Use Template
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            New Project
          </button>
        </div>
      </div>

      {/* Import Status Messages */}
      {importError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle size={16} />
          {importError}
          <button onClick={() => setImportError(null)} className="ml-auto hover:text-red-300">
            <X size={14} />
          </button>
        </div>
      )}
      {importSuccess && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-400 text-sm">
          <CheckCircle2 size={16} />
          {importSuccess}
          <button onClick={() => setImportSuccess(null)} className="ml-auto hover:text-green-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Category Filter */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory('All')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            selectedCategory === 'All' 
              ? 'bg-blue-600 text-white' 
              : 'dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          All ({projects.length})
        </button>
        {PROJECT_CATEGORIES.map(cat => {
          const count = projects.filter(p => p.category === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                selectedCategory === cat.value 
                  ? 'bg-blue-600 text-white' 
                  : `dark:bg-gray-800 bg-gray-100 dark:text-gray-300 text-gray-600 hover:bg-gray-200 dark:hover:bg-gray-700`
              }`}
            >
              {cat.icon}
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredProjects.map((project) => {
          const categoryInfo = getCategoryInfo(project.category);
          const lastCheckIn = project.teamCheckIns?.[project.teamCheckIns.length - 1];
          return (
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
                  <div className={`p-2 rounded-lg ${categoryInfo.color}`}>
                    {categoryInfo.icon || <Code size={20} />}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowCheckInModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-green-500 transition-colors"
                      title="Add team check-in"
                    >
                      <UserCheck size={14} />
                    </button>
                    <button
                      onClick={() => setShowPhasesModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-indigo-500 transition-colors"
                      title="Manage implementation phases"
                    >
                      <Layers size={14} />
                    </button>
                    <button
                      onClick={() => setShowRisksModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-500 transition-colors"
                      title="Manage risks"
                    >
                      <AlertTriangle size={14} />
                    </button>
                    <button
                      onClick={() => setShowResourcesModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-emerald-500 transition-colors"
                      title="Manage resources & budget"
                    >
                      <Wallet size={14} />
                    </button>
                    <button
                      onClick={() => setShowAlignmentModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-purple-500 transition-colors"
                      title="Manage strategic alignment"
                    >
                      <Compass size={14} />
                    </button>
                    <button
                      onClick={() => setShowMetricsModal(project.id)}
                      className="p-2 dark:hover:bg-gray-800 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-cyan-500 transition-colors"
                      title="Manage performance metrics"
                    >
                      <BarChart3 size={14} />
                    </button>
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

                {/* Category Badge */}
                {project.category && (
                  <div className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded mb-2 ${categoryInfo.color}`}>
                    {categoryInfo.icon}
                    {project.category}
                  </div>
                )}
                
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                    project.status === 'Completed' ? 'bg-green-500/20 text-green-400' :
                    project.status === 'On Hold' ? 'bg-yellow-500/20 text-yellow-400' :
                    project.status === 'Cancelled' ? 'bg-red-500/20 text-red-400' :
                    project.status === 'Not Started' ? 'bg-gray-500/20 text-gray-400' :
                    project.status === 'Planning' ? 'bg-purple-500/20 text-purple-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {project.status}
                  </span>
                  {project.healthStatus && (
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded flex items-center gap-1 ${
                      project.healthStatus === 'On Track' ? 'bg-green-500/20 text-green-400' :
                      project.healthStatus === 'At Risk' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      <AlertCircle size={10} />
                      {project.healthStatus}
                    </span>
                  )}
                  {project.priority && (
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded ${
                      project.priority === 'Critical' ? 'bg-red-500/20 text-red-400' :
                      project.priority === 'High' ? 'bg-orange-500/20 text-orange-400' :
                      project.priority === 'Medium' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {project.priority}
                    </span>
                  )}
                </div>

                {/* Team & Check-in Info */}
                {(project.team?.length || lastCheckIn) && (
                  <div className="mb-4 space-y-2">
                    {project.team && project.team.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Users size={12} />
                        <span>{project.team.length} team member{project.team.length > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {lastCheckIn && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <MessageSquare size={12} />
                        <span>Last check-in: {formatDate(lastCheckIn.date)}</span>
                        {lastCheckIn.mood && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            lastCheckIn.mood === 'Positive' ? 'bg-green-500/20 text-green-400' :
                            lastCheckIn.mood === 'Concerned' ? 'bg-red-500/20 text-red-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {lastCheckIn.mood}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Alignment & Metrics Summary */}
                {(project.alignments?.length || project.performanceMetrics?.length) && (
                  <div className="mb-4 space-y-2">
                    {project.alignments && project.alignments.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Compass size={12} className="text-purple-400" />
                        <span>Alignment: </span>
                        <span className={`font-medium ${
                          (getAverageAlignmentScore(project.alignments) || 0) >= 70 ? 'text-green-400' :
                          (getAverageAlignmentScore(project.alignments) || 0) >= 40 ? 'text-yellow-400' :
                          'text-red-400'
                        }`}>
                          {getAverageAlignmentScore(project.alignments)}%
                        </span>
                        <span className="text-gray-500">({project.alignments.length} goal{project.alignments.length > 1 ? 's' : ''})</span>
                      </div>
                    )}
                    {project.performanceMetrics && project.performanceMetrics.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <BarChart3 size={12} className="text-cyan-400" />
                        <span>{project.performanceMetrics.length} metric{project.performanceMetrics.length > 1 ? 's' : ''}</span>
                        {project.performanceMetrics.some(m => m.current >= m.target) && (
                          <span className="text-green-400 flex items-center gap-1">
                            <TrendingUp size={10} />
                            {project.performanceMetrics.filter(m => m.current >= m.target).length} on target
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Phases, Risks & Resources Summary */}
                {(project.implementationPlan?.phases?.length || project.risks?.length || project.resources?.length) && (
                  <div className="mb-4 space-y-2">
                    {project.implementationPlan?.phases && project.implementationPlan.phases.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Layers size={12} className="text-indigo-400" />
                        <span>{project.implementationPlan.phases.filter(p => p.status === 'Completed').length}/{project.implementationPlan.phases.length} phases</span>
                        {project.implementationPlan.phases.some(p => p.status === 'In Progress') && (
                          <span className="text-blue-400 flex items-center gap-1">
                            <PlayCircle size={10} />
                            {project.implementationPlan.phases.find(p => p.status === 'In Progress')?.name}
                          </span>
                        )}
                      </div>
                    )}
                    {project.risks && project.risks.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <AlertTriangle size={12} className="text-orange-400" />
                        <span>{project.risks.filter(r => r.status === 'Open').length} open risk{project.risks.filter(r => r.status === 'Open').length !== 1 ? 's' : ''}</span>
                        {project.risks.some(r => r.severity === 'Critical' && r.status === 'Open') && (
                          <span className="text-red-400 font-medium">⚠ Critical</span>
                        )}
                      </div>
                    )}
                    {project.totalBudget && project.totalBudget > 0 && (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Wallet size={12} className="text-emerald-400" />
                        <span>Budget: </span>
                        <span className={`font-medium ${
                          ((project.budgetUsed || 0) / project.totalBudget) > 0.9 ? 'text-red-400' :
                          ((project.budgetUsed || 0) / project.totalBudget) > 0.7 ? 'text-yellow-400' :
                          'text-green-400'
                        }`}>
                          {Math.round(((project.budgetUsed || 0) / project.totalBudget) * 100)}% used
                        </span>
                      </div>
                    )}
                  </div>
                )}
                
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
        );
        })}
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
                    {priorities.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
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
                <select
                  value={newProject.category}
                  onChange={(e) => setNewProject({ ...newProject, category: e.target.value as ProjectCategory })}
                  title="Project category"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a category...</option>
                  {PROJECT_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Project Manager</label>
                <input
                  type="text"
                  value={newProject.projectManager}
                  onChange={(e) => setNewProject({ ...newProject, projectManager: e.target.value })}
                  placeholder="e.g., John Smith"
                  className="w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Stakeholders (comma-separated)</label>
                <input
                  type="text"
                  value={newProject.stakeholders}
                  onChange={(e) => setNewProject({ ...newProject, stakeholders: e.target.value })}
                  placeholder="e.g., CEO, CTO, Product Lead"
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
                    status: 'Planning', 
                    tags: '', 
                    deadline: '',
                    startDate: '',
                    reportingStructure: '',
                    team: '',
                    priority: 'Medium',
                    category: '',
                    notes: '',
                    projectManager: '',
                    stakeholders: ''
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

      {/* Team Check-in Modal */}
      {showCheckInModal && (
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
                onClick={() => handleAddCheckIn(showCheckInModal)}
                disabled={!newCheckIn.notes.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <UserCheck size={16} />
                Save Check-in
              </button>
              <button
                onClick={() => {
                  setShowCheckInModal(null);
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
      {showAlignmentModal && (() => {
        const project = projects.find(p => p.id === showAlignmentModal);
        if (!project) return null;
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
                onClick={() => handleAddAlignment(showAlignmentModal)}
                disabled={!newAlignment.strategicGoal.trim()}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Target size={16} />
                Add Alignment
              </button>
              <button
                onClick={() => {
                  setShowAlignmentModal(null);
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
      {showMetricsModal && (() => {
        const project = projects.find(p => p.id === showMetricsModal);
        if (!project) return null;
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
                onClick={() => handleAddMetric(showMetricsModal)}
                disabled={!newMetric.name.trim() || newMetric.target <= 0}
                className="flex-1 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <BarChart3 size={16} />
                Add Metric
              </button>
              <button
                onClick={() => {
                  setShowMetricsModal(null);
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

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <Copy className="text-blue-500" size={24} />
              <h3 className="text-xl font-bold dark:text-white text-gray-900">Project Templates</h3>
            </div>
            <p className="text-gray-500 text-sm mb-6">Start with a pre-built template to quickly set up your project with phases, risks, and metrics</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PROJECT_TEMPLATES.map(template => (
                <div 
                  key={template.id}
                  className="dark:bg-gray-800/50 bg-gray-50 border dark:border-gray-700 border-gray-200 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-colors cursor-pointer group"
                >
                  <div className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded mb-3 ${
                    PROJECT_CATEGORIES.find(c => c.value === template.category)?.color || 'bg-gray-500/10 text-gray-400'
                  }`}>
                    {PROJECT_CATEGORIES.find(c => c.value === template.category)?.icon}
                    {template.category}
                  </div>
                  <h4 className="font-medium dark:text-white text-gray-900 mb-1 group-hover:text-blue-500 transition-colors">{template.name}</h4>
                  <p className="text-xs text-gray-500 mb-3 line-clamp-2">{template.description}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Layers size={10} />
                      {template.phases.length} phases
                    </span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle size={10} />
                      {template.defaultRisks.length} risks
                    </span>
                    <span className="flex items-center gap-1">
                      <BarChart3 size={10} />
                      {template.defaultMetrics.length} metrics
                    </span>
                  </div>
                  
                  <div className="text-[10px] text-gray-500 mb-3">Est. Duration: {template.estimatedDuration}</div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCreateFromTemplate(template)}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                    >
                      Quick Create
                    </button>
                    <button
                      onClick={() => handleApplyTemplate(template)}
                      className="px-3 py-1.5 dark:bg-gray-700 bg-gray-200 dark:text-white text-gray-700 rounded text-xs font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                      Customize
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Implementation Phases Modal */}
      {showPhasesModal && (() => {
        const project = projects.find(p => p.id === showPhasesModal);
        if (!project) return null;
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
                onClick={() => handleAddPhase(showPhasesModal)}
                disabled={!newPhase.name.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Layers size={16} />
                Add Phase
              </button>
              <button
                onClick={() => {
                  setShowPhasesModal(null);
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
      {showRisksModal && (() => {
        const project = projects.find(p => p.id === showRisksModal);
        if (!project) return null;
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
                onClick={() => handleAddRisk(showRisksModal)}
                disabled={!newRisk.title.trim()}
                className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <AlertTriangle size={16} />
                Add Risk
              </button>
              <button
                onClick={() => {
                  setShowRisksModal(null);
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
      {showResourcesModal && (() => {
        const project = projects.find(p => p.id === showResourcesModal);
        if (!project) return null;
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
                onClick={() => handleAddResource(showResourcesModal)}
                disabled={!newResource.name.trim() || newResource.allocated <= 0}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Wallet size={16} />
                Add Resource
              </button>
              <button
                onClick={() => {
                  setShowResourcesModal(null);
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
    </div>
  );
};

export default ProjectsView;