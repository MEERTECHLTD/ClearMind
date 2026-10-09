/**
 * Project plan UI — the planning side of a project (status, health, priority,
 * category, dates, people, budget, phases, risks, check-ins…). It lives on the
 * SAME Project record as the task workspace, so there is one project
 * everywhere: #project/<id> shows Tasks | Plan, and the #projects portfolio
 * lists the same records. Mirrors apps/mobile/components/projects/plan.tsx.
 */
import React, { useState } from 'react';
import {
  Calendar, Users, User, FileText, MessageSquare, Layers, AlertTriangle, Wallet, Compass, BarChart3, ListChecks,
  CircleCheck, Circle, UserCheck, Pencil, Code,
} from 'lucide-react';
import type { Project, ProjectCategory } from '../../types';
import { cx, Modal, useTaskToast } from '../tasks/ui';
import { useTaskData } from '../tasks/TaskContext';
import { updateProject } from '../tasks/actions';
import {
  STATUSES, PRIORITIES, HEALTHS, STATUS_TONE, PRIORITY_TONE, HEALTH_TONE, formatDate, listToCsv, emptyForm, applyPlanForm, planPatch,
  taskPct, taskProgressByProject, formFromProject, hasPlan, type BadgeTone, type PlanForm, type TaskProgress, type Status, type Priority, type Health,
} from '../../utils/planModel';
import { PlanEditors, PROJECT_CATEGORIES, getCategoryInfo, type PlanEditor } from './PlanEditors';

const TONE: Record<BadgeTone, string> = {
  accent: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  green: 'bg-green-500/15 text-green-700 dark:text-green-400',
  amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  red: 'bg-red-500/15 text-red-700 dark:text-red-400',
  muted: 'bg-gray-500/15 text-gray-600 dark:text-gray-400',
};

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  return <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${TONE[tone]}`}>{label}</span>;
}

export function PlanBadges({ project }: { project: Project }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {project.status ? <Badge label={project.status} tone={STATUS_TONE[project.status] ?? 'muted'} /> : null}
      {project.healthStatus ? <Badge label={project.healthStatus} tone={HEALTH_TONE[project.healthStatus]} /> : null}
      {project.priority ? <Badge label={project.priority} tone={PRIORITY_TONE[project.priority]} /> : null}
    </div>
  );
}

function Bar({ value, color }: { value: number; color?: string }) {
  return (
    <div className="h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color ?? (value >= 100 ? '#16A34A' : '#3B82F6') }} />
    </div>
  );
}

// ---------------------------------------------------------------- form

/** Create / edit a project's plan (all fields the planner had, plus health and budget). */
export function PlanFormModal({ open, initial, editing, onCancel, onSave }: {
  open: boolean; initial: PlanForm | null; editing: boolean; onCancel: () => void; onSave: (f: PlanForm) => void;
}) {
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [was, setWas] = useState(false);
  if (open !== was) { setWas(open); if (open) setForm(initial ?? emptyForm()); }
  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const field = (label: string, el: React.ReactNode, wide = false) => (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}><span className={`text-xs font-semibold ${cx.muted}`}>{label}</span><div className="mt-1">{el}</div></label>
  );
  const input = `${cx.input} w-full`;
  const save = () => { if (form.title.trim()) onSave(form); };
  return (
    <Modal open={open} onClose={onCancel} title={editing ? 'Edit plan' : 'New project'} wide>
      <div className="p-5 overflow-y-auto grid gap-4 sm:grid-cols-2">
        {field('Title *', <input autoFocus value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={120} className={input} placeholder="Project title" />, true)}
        {field('Description', <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={2} className={`${input} resize-y`} placeholder="What is this project about?" />, true)}
        {field('Status', <select value={form.status} onChange={(e) => set('status', e.target.value as Status)} className={input}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>)}
        {field('Priority', <select value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)} className={input}>{PRIORITIES.map((s) => <option key={s}>{s}</option>)}</select>)}
        {field('Category', <select value={form.category} onChange={(e) => set('category', e.target.value as ProjectCategory | '')} className={input}><option value="">No category</option>{PROJECT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>)}
        {field('Health', <select value={form.healthStatus} onChange={(e) => set('healthStatus', e.target.value as Health)} className={input}>{HEALTHS.map((s) => <option key={s}>{s}</option>)}</select>)}
        {field(`Plan progress: ${form.progress}%`, <input type="range" min={0} max={100} value={form.progress} onChange={(e) => set('progress', Number(e.target.value))} className="w-full accent-blue-600" aria-label="Plan progress" />, true)}
        {field('Start date', <input type="date" value={form.startDate ?? ''} onChange={(e) => set('startDate', e.target.value || undefined)} className={input} />)}
        {field('Deadline', <input type="date" value={form.deadline ?? ''} onChange={(e) => set('deadline', e.target.value || undefined)} className={input} />)}
        {field('Project manager', <input value={form.projectManager} onChange={(e) => set('projectManager', e.target.value)} className={input} placeholder="e.g. John Smith" />)}
        {field('Total budget', <input type="number" min={0} value={form.totalBudget} onChange={(e) => set('totalBudget', e.target.value)} className={input} placeholder="e.g. 50000" />)}
        {field('Team members (comma-separated)', <input value={form.team} onChange={(e) => set('team', e.target.value)} className={input} placeholder="Alice, Bob, Charlie" />)}
        {field('Stakeholders (comma-separated)', <input value={form.stakeholders} onChange={(e) => set('stakeholders', e.target.value)} className={input} placeholder="CEO, CTO" />)}
        {field('Tags (comma-separated)', <input value={form.tags} onChange={(e) => set('tags', e.target.value)} className={input} placeholder="web, api" />)}
        {field('Reporting structure', <input value={form.reportingStructure} onChange={(e) => set('reportingStructure', e.target.value)} className={input} placeholder="Reports to: …" />)}
        {field('Notes', <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${input} resize-y`} placeholder="Additional notes…" />, true)}
      </div>
      <div className={`flex justify-end gap-2 px-5 py-3 border-t ${cx.border}`}>
        <button onClick={onCancel} className={cx.btnGhost}>Cancel</button>
        <button onClick={save} disabled={!form.title.trim()} className={cx.btnPrimary}>{editing ? 'Save plan' : 'Create project'}</button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- display

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <span className={`mt-0.5 ${cx.muted}`}>{icon}</span>
      <span className={`w-28 shrink-0 text-xs mt-0.5 ${cx.muted}`}>{label}</span>
      <span className={`flex-1 min-w-0 ${cx.text}`}>{value}</span>
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h3 className={`text-[11px] font-semibold uppercase tracking-wide mt-5 mb-1.5 ${cx.muted}`}>{children}</h3>;
}

const EDITORS: { id: PlanEditor; label: string; icon: React.ReactNode; count: (p: Project) => number }[] = [
  { id: 'checkin', label: 'Check-ins', icon: <UserCheck size={15} className="text-green-500" />, count: (p) => p.teamCheckIns?.length ?? 0 },
  { id: 'phases', label: 'Phases', icon: <Layers size={15} className="text-indigo-500" />, count: (p) => p.implementationPlan?.phases?.length ?? 0 },
  { id: 'risks', label: 'Risks', icon: <AlertTriangle size={15} className="text-orange-500" />, count: (p) => p.risks?.length ?? 0 },
  { id: 'resources', label: 'Resources & budget', icon: <Wallet size={15} className="text-emerald-500" />, count: (p) => p.resources?.length ?? 0 },
  { id: 'alignment', label: 'Strategic alignment', icon: <Compass size={15} className="text-purple-500" />, count: (p) => p.alignments?.length ?? 0 },
  { id: 'metrics', label: 'Metrics', icon: <BarChart3 size={15} className="text-cyan-500" />, count: (p) => p.performanceMetrics?.length ?? 0 },
];

/**
 * The plan, inline: badges, plan progress next to live task progress
 * ("Use N%"), dates, people, budget, phases, milestones, open risks, recent
 * check-ins, tags and notes, plus buttons for every plan editor.
 */
export function PlanSummary({ project, tasks, onEdit, onUseTaskProgress, onOpenEditor }: {
  project: Project; tasks?: TaskProgress | null; onEdit?: () => void; onUseTaskProgress?: (pct: number) => void; onOpenEditor?: (e: PlanEditor) => void;
}) {
  const pct = project.progress ?? 0;
  const live = taskPct(tasks);
  const budgetPct = project.totalBudget && project.totalBudget > 0 ? Math.round(((project.budgetUsed || 0) / project.totalBudget) * 100) : null;
  const phases = [...(project.implementationPlan?.phases ?? [])].sort((a, b) => a.order - b.order);
  const milestones = project.projectMilestones ?? [];
  const openRisks = (project.risks ?? []).filter((r) => r.status === 'Open');
  const checkIns = [...(project.teamCheckIns ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const cat = project.category ? getCategoryInfo(project.category) : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {cat ? <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${cat.color}`}>{cat.icon}{project.category}</span> : null}
        <div className="flex-1 min-w-0"><PlanBadges project={project} /></div>
        {onEdit ? <button onClick={onEdit} className={`inline-flex items-center gap-1.5 ${cx.btnGhost}`}><Pencil size={14} />Edit plan</button> : null}
      </div>

      {project.description ? <p className={`text-sm mb-3 whitespace-pre-wrap ${cx.text}`}>{project.description}</p> : null}

      <div className={`rounded-xl border ${cx.border} ${cx.card} p-3 mb-3`}>
        <div className="flex justify-between text-xs mb-1.5"><span className={cx.muted}>Plan progress</span><span className={`font-semibold ${cx.text}`}>{pct}%</span></div>
        <Bar value={pct} />
        {live !== null && tasks ? (
          <div className="flex items-center gap-1.5 mt-2.5 text-xs">
            <ListChecks size={13} className={cx.muted} />
            <span className={`flex-1 ${cx.muted}`}>Tasks: {tasks.done}/{tasks.open + tasks.done} done ({live}%)</span>
            {onUseTaskProgress && live !== pct ? (
              <button onClick={() => onUseTaskProgress(live)} className="font-semibold text-blue-600 dark:text-blue-400 hover:underline" aria-label={`Set plan progress to ${live} percent`}>Use {live}%</button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div>
        <DetailRow icon={<Calendar size={14} />} label="Start" value={formatDate(project.startDate)} />
        <DetailRow icon={<Calendar size={14} />} label="Deadline" value={formatDate(project.deadline)} />
        <DetailRow icon={<User size={14} />} label="Manager" value={project.projectManager} />
        <DetailRow icon={<Users size={14} />} label="Team" value={listToCsv(project.team) || null} />
        <DetailRow icon={<Compass size={14} />} label="Stakeholders" value={listToCsv(project.stakeholders) || null} />
        <DetailRow icon={<FileText size={14} />} label="Reporting" value={project.reportingStructure} />
        {budgetPct !== null ? <DetailRow icon={<Wallet size={14} />} label="Budget used" value={`${budgetPct}% of ${project.totalBudget!.toLocaleString()}`} /> : null}
      </div>

      {onOpenEditor ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {EDITORS.map((e) => (
            <button key={e.id} onClick={() => onOpenEditor(e.id)} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${cx.border} ${cx.hover} text-sm text-left ${cx.text}`}>
              {e.icon}<span className="flex-1 truncate">{e.label}</span><span className={`text-xs tabular-nums ${cx.muted}`}>{e.count(project) || ''}</span>
            </button>
          ))}
        </div>
      ) : null}

      {phases.length ? (
        <>
          <Heading>Phases</Heading>
          {phases.map((ph) => (
            <div key={ph.id} className="flex items-center gap-2 py-1.5 text-sm">
              <Layers size={13} color={ph.status === 'Completed' ? '#16A34A' : ph.status === 'Blocked' ? '#EF4444' : '#818CF8'} />
              <span className={`flex-1 min-w-0 truncate ${cx.text}`}>{ph.name}</span>
              <span className="w-20"><Bar value={ph.progress ?? 0} color={ph.status === 'Blocked' ? '#EF4444' : undefined} /></span>
              <span className={`text-xs w-28 text-right ${cx.muted}`}>{ph.status} · {ph.progress ?? 0}%</span>
            </div>
          ))}
        </>
      ) : null}

      {milestones.length ? (
        <>
          <Heading>Milestones</Heading>
          {milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 py-1.5 text-sm">
              {m.completed ? <CircleCheck size={14} className="text-green-500" /> : <Circle size={14} className={cx.muted} />}
              <span className={`flex-1 min-w-0 truncate ${m.completed ? `line-through ${cx.muted}` : cx.text}`}>{m.title}</span>
              {m.dueDate ? <span className={`text-xs ${cx.muted}`}>{formatDate(m.dueDate)}</span> : null}
            </div>
          ))}
        </>
      ) : null}

      {openRisks.length ? (
        <>
          <Heading>Open risks</Heading>
          {openRisks.map((r) => (
            <div key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
              <AlertTriangle size={13} className={r.severity === 'Critical' ? 'text-red-500' : 'text-orange-400'} />
              <span className={`flex-1 min-w-0 ${cx.text}`}>{r.title}</span>
              <span className={`text-xs ${cx.muted}`}>{r.severity} · {r.likelihood} likelihood</span>
            </div>
          ))}
        </>
      ) : null}

      {checkIns.length ? (
        <>
          <Heading>Recent check-ins</Heading>
          {checkIns.map((c) => (
            <div key={c.id} className="py-1.5 text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare size={13} className={cx.muted} />
                <span className={`text-xs ${cx.muted}`}>{formatDate(c.date)}</span>
                {c.mood ? <Badge label={c.mood} tone={c.mood === 'Positive' ? 'green' : c.mood === 'Concerned' ? 'red' : 'muted'} /> : null}
              </div>
              <p className={`mt-0.5 pl-5 line-clamp-2 ${cx.text}`}>{c.notes}</p>
            </div>
          ))}
        </>
      ) : null}

      {project.tags?.length ? (
        <>
          <Heading>Tags</Heading>
          <div className="flex flex-wrap gap-1.5">{project.tags.map((t) => <span key={t} className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-gray-100 dark:bg-white/5 ${cx.muted}`}>{t}</span>)}</div>
        </>
      ) : null}

      {project.notes ? (
        <>
          <Heading>Notes</Heading>
          <p className={`text-sm whitespace-pre-wrap ${cx.text}`}>{project.notes}</p>
        </>
      ) : null}
    </div>
  );
}

/** Portfolio card: plan status + live task counts. Click opens the project. */
export function PortfolioCard({ project, tasks, onOpen, actions }: {
  project: Project; tasks?: TaskProgress | null; onOpen: () => void; actions?: React.ReactNode;
}) {
  const cat = getCategoryInfo(project.category);
  const phaseCount = project.implementationPlan?.phases?.length ?? 0;
  const donePhases = project.implementationPlan?.phases?.filter((p) => p.status === 'Completed').length ?? 0;
  const openRisks = project.risks?.filter((r) => r.status === 'Open').length ?? 0;
  const pct = project.progress ?? 0;
  const meta = (icon: React.ReactNode, text: string) => <span className={`inline-flex items-center gap-1 text-xs ${cx.muted}`}>{icon}{text}</span>;
  return (
    <article className={`group relative rounded-xl border ${cx.border} ${cx.card} p-4 hover:border-gray-300 dark:hover:border-gray-700 transition-colors`}>
      <button onClick={onOpen} className="absolute inset-0 rounded-xl" aria-label={`Open ${project.title}`} />
      <div className="flex items-start gap-3">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cat.color}`}>{project.category ? cat.icon : <Code size={18} />}</span>
        <div className="flex-1 min-w-0">
          {project.category ? <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">{project.category}</p> : null}
          <h3 className={`font-semibold truncate ${cx.text}`}>{project.title}</h3>
        </div>
        {actions ? <div className="relative z-10 flex items-center">{actions}</div> : null}
      </div>
      {project.description ? <p className={`text-sm mt-2 line-clamp-2 ${cx.muted}`}>{project.description}</p> : null}
      <div className="mt-3"><PlanBadges project={project} /></div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
        {tasks ? meta(<ListChecks size={12} className="text-blue-500" />, `${tasks.open} open · ${tasks.done} done`) : null}
        {project.deadline ? meta(<Calendar size={12} />, formatDate(project.deadline) ?? '') : null}
        {project.team?.length ? meta(<Users size={12} />, `${project.team.length} member${project.team.length > 1 ? 's' : ''}`) : null}
        {phaseCount ? meta(<Layers size={12} className="text-indigo-400" />, `${donePhases}/${phaseCount} phases`) : null}
        {openRisks ? meta(<AlertTriangle size={12} className="text-orange-400" />, `${openRisks} open risk${openRisks !== 1 ? 's' : ''}`) : null}
      </div>
      <div className="mt-3">
        <div className={`flex justify-between text-xs mb-1 ${cx.muted}`}><span>Plan progress</span><span>{pct}%</span></div>
        <Bar value={pct} />
      </div>
    </article>
  );
}

/** Plan tab of a personal project (#project/<id>?tab=plan). Writes go through the task layer. */
export function ProjectPlanPanel({ project }: { project: Project }) {
  const { tasks } = useTaskData();
  const toast = useTaskToast();
  const [editor, setEditor] = useState<PlanEditor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const progress = taskProgressByProject(tasks).get(project.id) ?? { open: 0, done: 0 };
  const persist = (p: Project) => updateProject(project, planPatch(p));

  return (
    <div>
      {!hasPlan(project) ? <p className={`text-sm mb-3 ${cx.muted}`}>Add a plan — status, health, dates, team, phases and risks — to track this project beyond its tasks.</p> : null}
      <PlanSummary
        project={project}
        tasks={progress}
        onEdit={() => setFormOpen(true)}
        onUseTaskProgress={(pct) => { updateProject(project, { progress: pct }); toast(`Plan progress set to ${pct}%`); }}
        onOpenEditor={setEditor}
      />
      <PlanFormModal
        open={formOpen}
        editing
        initial={formOpen ? formFromProject(project) : null}
        onCancel={() => setFormOpen(false)}
        onSave={(f) => { updateProject(project, planPatch(applyPlanForm(project, f, project.id))); setFormOpen(false); toast('Plan saved'); }}
      />
      <PlanEditors project={project} editor={editor} onClose={() => setEditor(null)} persist={persist} />
    </div>
  );
}
