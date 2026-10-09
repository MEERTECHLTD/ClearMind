/**
 * Projects & plans (#projects) — the portfolio. Every project with its plan
 * (status, health, progress, category) and live task counts. These are the SAME
 * records as the sidebar's My Projects: a card opens the one project page
 * (#project/<id>, Tasks | Plan). Shared workspaces, templates and Excel
 * import / export / template live here.
 *
 * Writes: personal projects go through the task layer (components/tasks/actions:
 * createProject / updateProject / deleteProject — delete cascades to tasks and
 * sections); shared-workspace projects through workspaceService. Edits always
 * spread the existing record.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Download, Upload, Copy, AlertCircle, CheckCircle2, X, MoreHorizontal, Pencil, Trash2, FolderKanban, FileSpreadsheet, Layers, AlertTriangle, BarChart3, ClipboardList, ListChecks } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Project, ProjectCategory, Workspace } from '../../types';
import { dbService, STORES } from '../../services/db';
import { workspaceService } from '../../services/workspaceService';
import { firebaseService, isFirebaseConfigured } from '../../services/firebase';
import { WorkspaceBar, WorkspaceBanner, NewWorkspaceModal, MembersModal } from '../WorkspaceShareUI';
import { PROJECT_TEMPLATES, type ProjectTemplate, generatePhasesFromTemplate, generateRisksFromTemplate, generateMetricsFromTemplate } from '../../utils/projectTemplates';
import { useTaskData } from '../tasks/TaskContext';
import { createProject, updateProject, deleteProject, projectSubtree } from '../tasks/actions';
import { cx, Modal, Popover, MenuItem, useTaskToast } from '../tasks/ui';
import { go } from '../tasks/TaskViews';
import { PageShell, Card, PageLoading } from './PageShell';
import { PortfolioCard, PlanSummary, PlanFormModal } from '../projects/PlanView';
import { PlanEditors, PROJECT_CATEGORIES, type PlanEditor } from '../projects/PlanEditors';
import { applyPlanForm, emptyForm, formFromProject, planPatch, hasPlan, taskProgressByProject, listToCsv, type PlanForm } from '../../utils/planModel';

type WsProject = Project & { __wsId?: string };
const wsOf = (p: Project): string | null => (p as WsProject).__wsId ?? null;
const stripWs = (p: Project): Project => { const { __wsId: _w, ...rest } = p as WsProject; return rest as Project; };
const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Create a personal project through the domain layer, then attach its plan. */
function createPersonal(p: Project): Project {
  const created = createProject({ title: p.title.trim().slice(0, 120) || 'Untitled project' });
  updateProject(created, { ...planPatch(p), title: created.title });
  return created;
}

const ProjectsView: React.FC = () => {
  const { projects: storeProjects, tasks, loading: tasksLoading } = useTaskData();
  const toast = useTaskToast();

  // Collaboration: shared workspaces (null active = personal local-first list).
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<string | null>(null);
  const [wsItems, setWsItems] = useState<WsProject[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [showNewWorkspace, setShowNewWorkspace] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const activeWorkspace = activeWsId ? workspaces.find((w) => w.id === activeWsId) ?? null : null;

  const [selectedCategory, setSelectedCategory] = useState<ProjectCategory | 'All'>('All');
  const [form, setForm] = useState<null | { editing: Project | null; initial: PlanForm; template?: ProjectTemplate }>(null);
  const [editorFor, setEditorFor] = useState<{ id: string; editor: PlanEditor } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ project: Project; el: HTMLElement } | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Excel import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const personal = useMemo(() => storeProjects.filter((p) => !p.deleted && !p.archived), [storeProjects]);
  const projects: Project[] = activeWsId ? wsItems : personal;
  const loading = activeWsId ? wsLoading : tasksLoading;
  const progress = useMemo(() => taskProgressByProject(tasks), [tasks]);
  const byId = (id: string | null | undefined) => (id ? projects.find((p) => p.id === id) ?? null : null);

  // Subscribe to the user's workspaces (owned + shared) once auth resolves.
  useEffect(() => {
    if (!isFirebaseConfigured()) return;
    let unsubWs: (() => void) | null = null;
    const unsubAuth = firebaseService.onAuthChange((user) => {
      unsubWs?.();
      unsubWs = null;
      if (user?.email) unsubWs = workspaceService.subscribe(setWorkspaces);
      else { setWorkspaces([]); setActiveWsId(null); }
    });
    return () => { unsubAuth(); unsubWs?.(); };
  }, []);

  // Live subscription to the active shared workspace; items are origin-tagged
  // (__wsId) so every write routes to THAT workspace even if the selection changes.
  useEffect(() => {
    if (!activeWsId) return;
    const wsId = activeWsId;
    setWsLoading(true);
    return workspaceService.subscribeProjects(
      wsId,
      (list) => { setWsItems(list.map((p) => ({ ...p, __wsId: wsId }))); setWsLoading(false); },
      () => { setActiveWsId(null); toast('That shared workspace is no longer available'); },
    );
  }, [activeWsId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Persist a full project record to where it came from. */
  const persistExisting = async (base: Project, next: Project) => {
    const wsId = wsOf(base);
    if (wsId) await workspaceService.putProject(wsId, stripWs(next));
    else updateProject(base, planPatch(next));
  };
  /** Save a brand-new project into the active workspace or the personal list. */
  const saveNew = async (p: Project): Promise<Project> => {
    if (activeWsId) { await workspaceService.putProject(activeWsId, p); return p; }
    return createPersonal(p);
  };

  const openProject = (p: Project) => {
    if (wsOf(p)) { setDetailId(p.id); return; } // shared-workspace projects have no task list
    go(`project/${p.id}${hasPlan(p) ? '?tab=plan' : ''}`);
  };

  const handleDelete = async (p: Project) => {
    const wsId = wsOf(p);
    if (wsId) {
      if (!confirm(`Delete “${p.title}” from this shared workspace for everyone?`)) return;
      try { await workspaceService.deleteProject(wsId, p.id); setDetailId(null); toast('Project deleted'); }
      catch (e) { console.error('Delete project failed', e); toast('Could not delete — check your connection'); }
      return;
    }
    const ids = new Set(projectSubtree(storeProjects, p.id));
    const n = tasks.filter((t) => t.projectId && ids.has(t.projectId) && !t.deleted).length;
    if (!confirm(`Delete “${p.title}” and its ${n} task${n === 1 ? '' : 's'}${ids.size > 1 ? ' (including sub-projects)' : ''}? This can’t be undone.`)) return;
    deleteProject(p.id);
    toast('Project deleted');
  };

  const handleSaveForm = async (f: PlanForm) => {
    if (!form) return;
    try {
      if (form.editing) {
        await persistExisting(form.editing, applyPlanForm(stripWs(form.editing), f, form.editing.id));
        toast('Plan saved');
      } else {
        const fresh = applyPlanForm(null, f, newId());
        if (form.template) {
          // "Customize" a template: keep its phases, risks and metrics.
          fresh.implementationPlan = { phases: generatePhasesFromTemplate(form.template), objectives: [], scope: '', outOfScope: [], assumptions: [], constraints: [] };
          fresh.risks = generateRisksFromTemplate(form.template);
          fresh.performanceMetrics = generateMetricsFromTemplate(form.template);
        }
        const created = await saveNew(fresh);
        toast(`Project “${created.title}” created`);
      }
      setForm(null);
    } catch (e) {
      console.error('Save project failed', e);
      toast('Could not save — check your connection');
    }
  };

  // Templates: Quick create (all defaults) or Customize (prefilled form).
  const handleCreateFromTemplate = async (template: ProjectTemplate) => {
    const project: Project = {
      id: newId(),
      title: `New ${template.name}`,
      description: template.description,
      status: 'Planning',
      progress: 0,
      tags: template.suggestedTags,
      category: template.category,
      priority: 'Medium',
      implementationPlan: { phases: generatePhasesFromTemplate(template), objectives: [], scope: '', outOfScope: [], assumptions: [], constraints: [] },
      risks: generateRisksFromTemplate(template),
      performanceMetrics: generateMetricsFromTemplate(template),
      teamCheckIns: [],
      healthStatus: 'On Track',
      createdAt: new Date().toISOString(),
    };
    try { const created = await saveNew(project); toast(`Project “${created.title}” created`); } catch { toast('Could not create the project'); }
    setShowTemplateModal(false);
  };
  const handleApplyTemplate = (template: ProjectTemplate) => {
    setShowTemplateModal(false);
    setForm({ editing: null, template, initial: { ...emptyForm(), description: template.description, category: template.category, tags: template.suggestedTags.join(', ') } });
  };

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

        await saveNew(project);
        importedCount++;
      }

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

  // Export the current list in the same columns as the import template.
  const exportExcel = () => {
    const rows = projects.map((p) => ({
      'Title*': p.title,
      'Description': p.description || '',
      'Status': p.status || '',
      'Priority': p.priority || '',
      'Category': p.category || '',
      'Start Date': p.startDate || '',
      'Deadline': p.deadline || '',
      'Project Manager': p.projectManager || '',
      'Team Members': listToCsv(p.team),
      'Stakeholders': listToCsv(p.stakeholders),
      'Tags': listToCsv(p.tags),
      'Notes': p.notes || '',
      'Reporting Structure': p.reportingStructure || '',
      'Total Budget': p.totalBudget ?? '',
      'Health Status': p.healthStatus || '',
      'Progress': p.progress ?? 0,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Projects');
    XLSX.writeFile(wb, `ClearMind_Projects_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // ---- Workspace (collaboration) actions ----
  const handleCreateWorkspace = async (name: string, emails: string[], seed: boolean) => {
    const ws = await workspaceService.create(name, emails, []);
    if (seed) {
      const mine = (await dbService.getAll<Project>(STORES.PROJECTS)).filter((p) => !p.deleted);
      // Fresh ids so the shared copies are fully independent of the personal list.
      await workspaceService.seedProjects(ws.id, mine.map((p) => ({ ...p, id: newId() })));
    }
    setShowNewWorkspace(false);
    setActiveWsId(ws.id);
    toast(`Workspace “${ws.name}” created${emails.length ? ` · invited ${emails.length}` : ''}`);
  };
  const handleSetMembers = async (emails: string[]) => {
    if (!activeWorkspace) return;
    await workspaceService.setMembers(activeWorkspace, emails);
    toast('Members updated');
  };
  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (!confirm(`Delete the shared workspace “${activeWorkspace.name}” for everyone? This cannot be undone.`)) return;
    const id = activeWorkspace.id;
    setActiveWsId(null);
    setShowMembers(false);
    await workspaceService.remove(id);
    toast('Workspace deleted');
  };
  const copyWorkspaceLink = async () => {
    if (!activeWorkspace) return;
    const link = workspaceService.inviteLink(activeWorkspace.id);
    try { await navigator.clipboard.writeText(link); toast('Invite link copied — anyone you send it to can join'); }
    catch { toast(link); }
  };

  const filtered = selectedCategory === 'All' ? projects : projects.filter((p) => p.category === selectedCategory);
  const stats = useMemo(() => {
    const total = projects.length;
    return {
      total,
      active: projects.filter((p) => p.status === 'In Progress').length,
      completed: projects.filter((p) => p.status === 'Completed').length,
      avg: total ? Math.round(projects.reduce((s, p) => s + (p.progress || 0), 0) / total) : 0,
    };
  }, [projects]);

  if (loading) return <PageLoading />;

  const detail = byId(detailId);
  const editorProject = byId(editorFor?.id);
  const btn = `inline-flex items-center gap-1.5 ${cx.btnGhost}`;

  return (
    <PageShell
      title="Projects & plans"
      subtitle="Every project with its plan and live task progress — the same projects as My Projects."
      wide
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button onClick={downloadExcelTemplate} className={btn} title="Download the Excel template for bulk import"><FileSpreadsheet size={15} /><span className="hidden lg:inline">Template</span></button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isImporting} className={`${btn} disabled:opacity-50`} title="Import projects from Excel">
            {isImporting ? <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /> : <Upload size={15} />}<span className="hidden lg:inline">{isImporting ? 'Importing…' : 'Import'}</span>
          </button>
          <button onClick={exportExcel} disabled={!projects.length} className={`${btn} disabled:opacity-50`} title="Export these projects to Excel"><Download size={15} /><span className="hidden lg:inline">Export</span></button>
          <button onClick={() => setShowTemplateModal(true)} className={btn}><Copy size={15} /><span className="hidden sm:inline">Use template</span></button>
          <button onClick={() => setForm({ editing: null, initial: emptyForm() })} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}><Plus size={15} />New project</button>
        </div>
      }
    >
      <input type="file" ref={fileInputRef} onChange={handleExcelUpload} accept=".xlsx,.xls" className="hidden" aria-label="Excel file to import" />

      {isFirebaseConfigured() && (workspaces.length > 0 || workspaceService.supported()) && (
        <WorkspaceBar workspaces={workspaces} activeWsId={activeWsId} personalLabel="My Projects" onSelect={setActiveWsId} onShareNew={() => setShowNewWorkspace(true)} />
      )}
      {activeWorkspace && (
        <WorkspaceBanner workspace={activeWorkspace} isOwner={workspaceService.isOwner(activeWorkspace)} onCopyLink={copyWorkspaceLink} onMembers={() => setShowMembers(true)} onDelete={handleDeleteWorkspace} />
      )}
      {showNewWorkspace && (
        <NewWorkspaceModal supported={workspaceService.supported()} seedCount={personal.length} seedNoun="project" onCancel={() => setShowNewWorkspace(false)} onCreate={handleCreateWorkspace} />
      )}
      {showMembers && activeWorkspace && (
        <MembersModal workspace={activeWorkspace} isOwner={workspaceService.isOwner(activeWorkspace)} currentEmail={workspaceService.currentEmail()} onCancel={() => setShowMembers(false)} onSave={handleSetMembers} />
      )}

      {importError && (
        <div role="alert" className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} className="shrink-0" /><span className="flex-1">{importError}</span>
          <button onClick={() => setImportError(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}
      {importSuccess && (
        <div role="status" className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle2 size={16} className="shrink-0" /><span className="flex-1">{importSuccess}</span>
          <button onClick={() => setImportSuccess(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { k: 'Projects', v: stats.total, c: '#3B82F6' },
          { k: 'In progress', v: stats.active, c: '#8B5CF6' },
          { k: 'Completed', v: stats.completed, c: '#16A34A' },
          { k: 'Avg plan progress', v: `${stats.avg}%`, c: '#F59E0B' },
        ].map((x) => (
          <Card key={x.k} className="text-center">
            <p className="text-2xl font-bold tabular-nums" style={{ color: x.c }}>{x.v}</p>
            <p className={`text-xs ${cx.muted}`}>{x.k}</p>
          </Card>
        ))}
      </div>

      {projects.length ? (
        <div role="radiogroup" aria-label="Category" className="mb-4 flex flex-wrap gap-1.5">
          {[{ value: 'All' as const, label: 'All', icon: null, count: projects.length }, ...PROJECT_CATEGORIES.map((c) => ({ ...c, count: projects.filter((p) => p.category === c.value).length })).filter((c) => c.count)].map((c) => (
            <button key={c.value} role="radio" aria-checked={selectedCategory === c.value} onClick={() => setSelectedCategory(c.value)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${selectedCategory === c.value ? 'bg-blue-600 text-white' : `bg-gray-100 dark:bg-white/5 ${cx.muted} hover:bg-gray-200 dark:hover:bg-white/10`}`}>
              {c.icon}{c.label} ({c.count})
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <PortfolioCard
              key={p.id}
              project={p}
              tasks={wsOf(p) ? null : progress.get(p.id) ?? { open: 0, done: 0 }}
              onOpen={() => openProject(p)}
              actions={
                <button onClick={(e) => setMenu({ project: p, el: e.currentTarget })} className={`p-1.5 rounded-md ${cx.hover} ${cx.muted}`} aria-label={`Options for ${p.title}`}><MoreHorizontal size={16} /></button>
              }
            />
          ))}
        </div>
      ) : (
        <div className={`text-center py-16 ${cx.muted}`}>
          <FolderKanban size={34} className="mx-auto mb-3 opacity-60" />
          <p className={`font-semibold ${cx.text}`}>{projects.length ? 'No projects in this category' : 'No projects yet'}</p>
          <p className="text-sm mt-1">{projects.length ? 'Pick another category above.' : 'Create one, start from a template, or import from Excel.'}</p>
        </div>
      )}

      <Popover anchor={menu?.el ?? null} open={!!menu} onClose={() => setMenu(null)} width={230}>
        {menu ? (() => {
          const p = menu.project;
          const close = () => setMenu(null);
          return (
            <>
              {!wsOf(p) ? <MenuItem icon={<ListChecks size={15} />} label="Open tasks" onClick={() => { close(); go(`project/${p.id}`); }} /> : null}
              <MenuItem icon={<ClipboardList size={15} />} label="Open plan" onClick={() => { close(); if (wsOf(p)) setDetailId(p.id); else go(`project/${p.id}?tab=plan`); }} />
              <MenuItem icon={<Pencil size={15} />} label="Edit plan" onClick={() => { close(); setForm({ editing: p, initial: formFromProject(p) }); }} />
              <MenuItem icon={<Layers size={15} />} label="Phases" onClick={() => { close(); setEditorFor({ id: p.id, editor: 'phases' }); }} />
              <MenuItem icon={<AlertTriangle size={15} />} label="Risks" onClick={() => { close(); setEditorFor({ id: p.id, editor: 'risks' }); }} />
              <MenuItem icon={<BarChart3 size={15} />} label="Metrics" onClick={() => { close(); setEditorFor({ id: p.id, editor: 'metrics' }); }} />
              <MenuItem icon={<Trash2 size={15} />} label="Delete" danger onClick={() => { close(); void handleDelete(p); }} />
            </>
          );
        })() : null}
      </Popover>

      {/* Shared-workspace project: the plan in a dialog (it has no task list). */}
      <Modal open={!!detail} onClose={() => setDetailId(null)} title={detail?.title} wide>
        {detail ? (
          <div className="p-5 overflow-y-auto">
            <PlanSummary
              project={detail}
              onEdit={() => setForm({ editing: detail, initial: formFromProject(detail) })}
              onOpenEditor={(editor) => setEditorFor({ id: detail.id, editor })}
            />
            <div className={`flex justify-end mt-4 pt-3 border-t ${cx.border}`}>
              <button onClick={() => void handleDelete(detail)} className="inline-flex items-center gap-1.5 text-sm text-red-500 hover:underline"><Trash2 size={14} />Delete project</button>
            </div>
          </div>
        ) : null}
      </Modal>

      <PlanFormModal open={!!form} editing={!!form?.editing} initial={form?.initial ?? null} onCancel={() => setForm(null)} onSave={handleSaveForm} />
      <PlanEditors project={editorProject} editor={editorFor?.editor ?? null} onClose={() => setEditorFor(null)} persist={(next) => (editorProject ? persistExisting(editorProject, next) : undefined)} />

      {/* Template picker */}
      <Modal open={showTemplateModal} onClose={() => setShowTemplateModal(false)} title="Project templates" wide>
        <div className="p-5 overflow-y-auto">
          <p className={`text-sm mb-4 ${cx.muted}`}>Start with a pre-built template — phases, risks and metrics included.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {PROJECT_TEMPLATES.map((template) => {
              const cat = PROJECT_CATEGORIES.find((c) => c.value === template.category);
              return (
                <div key={template.id} className={`rounded-lg border ${cx.border} p-4`}>
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded mb-2 ${cat?.color ?? 'bg-gray-500/10 text-gray-400'}`}>{cat?.icon}{template.category}</span>
                  <h4 className={`font-medium mb-1 ${cx.text}`}>{template.name}</h4>
                  <p className={`text-xs mb-2 line-clamp-2 ${cx.muted}`}>{template.description}</p>
                  <p className={`flex flex-wrap gap-3 text-[11px] mb-3 ${cx.faint}`}>
                    <span className="inline-flex items-center gap-1"><Layers size={11} />{template.phases.length} phases</span>
                    <span className="inline-flex items-center gap-1"><AlertTriangle size={11} />{template.defaultRisks.length} risks</span>
                    <span className="inline-flex items-center gap-1"><BarChart3 size={11} />{template.defaultMetrics.length} metrics</span>
                    <span>{template.estimatedDuration}</span>
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => void handleCreateFromTemplate(template)} className={`flex-1 ${cx.btnPrimary}`}>Quick create</button>
                    <button onClick={() => handleApplyTemplate(template)} className={cx.btnGhost}>Customize</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </PageShell>
  );
};

export default ProjectsView;
