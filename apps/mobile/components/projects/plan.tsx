/**
 * Project plan — the planning side of a project (status, health, priority,
 * category, dates, team, budget, phases, risks…). It lives on the SAME Project
 * record as the task workspace (sections, board, tasks), so there is one
 * project everywhere: Browse → project screen shows tasks + this plan, and the
 * Projects portfolio lists the same records.
 */
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import {
  Zap, Leaf, DollarSign, Heart, Monitor, GraduationCap, Building, Factory, ShoppingBag, Megaphone, FlaskConical,
  Landmark, HandHeart, Rocket, User, FolderOpen, Calendar, Users, FileText, MessageSquare, Layers, TriangleAlert,
  Wallet, Compass, ChartColumn, Flag, CircleCheck, Circle, ListChecks,
} from 'lucide-react-native';
import type { Project, ProjectCategory } from '@clearmind/shared';
import { Card, Input, TextArea, Select, DateField, SliderField, ProgressBar, Badge, FormSheet } from '../ui';
import { T } from '../../lib/theme';
import {
  STATUSES, PRIORITIES, HEALTHS, STATUS_TONE, PRIORITY_TONE, HEALTH_TONE, formatDate, listToCsv, emptyForm, formFromProject,
  taskPct, type Status, type Priority, type Health, type PlanForm, type TaskProgress,
} from './planModel';

export * from './planModel';

// Category metadata: icon + accent hex (arbitrary colors -> inline style).
export const CATEGORY_META: { value: ProjectCategory; label: string; Icon: typeof Zap; color: string }[] = [
  { value: 'Energy', label: 'Energy', Icon: Zap, color: '#eab308' },
  { value: 'Green Energy', label: 'Green Energy', Icon: Leaf, color: '#22c55e' },
  { value: 'Finance', label: 'Finance', Icon: DollarSign, color: '#10b981' },
  { value: 'Health', label: 'Health', Icon: Heart, color: '#ef4444' },
  { value: 'IT', label: 'IT', Icon: Monitor, color: '#3b82f6' },
  { value: 'Education', label: 'Education', Icon: GraduationCap, color: '#a855f7' },
  { value: 'Construction', label: 'Construction', Icon: Building, color: '#f97316' },
  { value: 'Manufacturing', label: 'Manufacturing', Icon: Factory, color: '#6B7280' },
  { value: 'Retail', label: 'Retail', Icon: ShoppingBag, color: '#ec4899' },
  { value: 'Marketing', label: 'Marketing', Icon: Megaphone, color: '#6366f1' },
  { value: 'Research', label: 'Research', Icon: FlaskConical, color: '#06b6d4' },
  { value: 'Government', label: 'Government', Icon: Landmark, color: '#64748b' },
  { value: 'Non-Profit', label: 'Non-Profit', Icon: HandHeart, color: '#f43f5e' },
  { value: 'Startup', label: 'Startup', Icon: Rocket, color: '#8b5cf6' },
  { value: 'Personal', label: 'Personal', Icon: User, color: '#14b8a6' },
  { value: 'Other', label: 'Other', Icon: FolderOpen, color: '#9CA3AF' },
];
export const getCategoryMeta = (c?: ProjectCategory) =>
  CATEGORY_META.find((m) => m.value === c) || CATEGORY_META[CATEGORY_META.length - 1];

/** Create / edit a project's plan (same fields the web planner uses). */
export function PlanFormSheet({
  visible, initial, onCancel, onSave, title,
}: {
  visible: boolean;
  initial: Project | null;
  onCancel: () => void;
  onSave: (f: PlanForm) => void;
  title?: string;
}) {
  const [form, setForm] = useState<PlanForm>(emptyForm);
  const [lastVisible, setLastVisible] = useState(false);

  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setForm(initial ? formFromProject(initial) : emptyForm());
  }

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const categoryOptions = [{ label: 'No category', value: '' }, ...CATEGORY_META.map((m) => ({ label: m.label, value: m.value }))];

  return (
    <FormSheet
      visible={visible}
      onClose={onCancel}
      title={title ?? (initial ? 'Edit plan' : 'New project')}
      submitLabel={initial ? 'Save' : 'Create'}
      submitDisabled={!form.title.trim()}
      onSubmit={() => { if (form.title.trim()) onSave(form); }}
      fill
    >
      <Input label="Title *" placeholder="Project title" value={form.title} onChangeText={(v) => set('title', v)} className="mb-3" />
      <TextArea label="Description" placeholder="What is this project about?" value={form.description} onChangeText={(v) => set('description', v)} minHeight={70} className="mb-3" />

      <View className="flex-row gap-3 mb-3">
        <Select<Status> label="Status" value={form.status} onChange={(v) => set('status', v)} options={STATUSES.map((s) => ({ label: s, value: s }))} className="flex-1" />
        <Select<Priority> label="Priority" value={form.priority} onChange={(v) => set('priority', v)} options={PRIORITIES.map((p) => ({ label: p, value: p }))} className="flex-1" />
      </View>

      <Select<string> label="Category" value={form.category} onChange={(v) => set('category', v as ProjectCategory | '')} options={categoryOptions} className="mb-3" />
      <Select<Health> label="Health" value={form.healthStatus} onChange={(v) => set('healthStatus', v)} options={HEALTHS.map((h) => ({ label: h, value: h }))} className="mb-3" />

      <View className="mb-3">
        <SliderField label="Progress" value={form.progress} onChange={(v) => set('progress', v)} />
      </View>

      <View className="flex-row gap-3 mb-3">
        <View className="flex-1"><DateField label="Start date" value={form.startDate} onChange={(v) => set('startDate', v)} placeholder="Start" /></View>
        <View className="flex-1"><DateField label="Deadline" value={form.deadline} onChange={(v) => set('deadline', v)} placeholder="Deadline" /></View>
      </View>

      <Input label="Project manager" placeholder="e.g. John Smith" value={form.projectManager} onChangeText={(v) => set('projectManager', v)} className="mb-3" />
      <Input label="Team members (comma-separated)" placeholder="Alice, Bob, Charlie" value={form.team} onChangeText={(v) => set('team', v)} className="mb-3" />
      <Input label="Stakeholders (comma-separated)" placeholder="CEO, CTO" value={form.stakeholders} onChangeText={(v) => set('stakeholders', v)} className="mb-3" />
      <Input label="Tags (comma-separated)" placeholder="react, api, mobile" value={form.tags} onChangeText={(v) => set('tags', v)} className="mb-3" />
      <Input label="Reporting structure" placeholder="Reports to: …" value={form.reportingStructure} onChangeText={(v) => set('reportingStructure', v)} className="mb-3" />
      <TextArea label="Notes" placeholder="Additional notes…" value={form.notes} onChangeText={(v) => set('notes', v)} minHeight={60} />
    </FormSheet>
  );
}

// ---------------------------------------------------------------- display

function MetaRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <View className="flex-row items-center">
      {icon}
      <Text className="text-ink-muted text-xs ml-1">{text}</Text>
    </View>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View className="flex-row items-start mb-2.5">
      <View className="mt-0.5 mr-2">{icon}</View>
      <Text className="text-ink-muted text-xs w-24">{label}</Text>
      <Text className="text-ink text-sm flex-1">{value}</Text>
    </View>
  );
}

function PlanBadges({ project }: { project: Project }) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {project.status ? <Badge label={project.status} tone={STATUS_TONE[project.status] ?? 'muted'} /> : null}
      {project.healthStatus ? <Badge label={project.healthStatus} tone={HEALTH_TONE[project.healthStatus]} /> : null}
      {project.priority ? <Badge label={project.priority} tone={PRIORITY_TONE[project.priority]} /> : null}
    </View>
  );
}


/** Portfolio card: plan status + live task counts. Tap opens the project. */
export function PortfolioCard({ project, tasks, onPress, onLongPress }: {
  project: Project; tasks?: TaskProgress; onPress: () => void; onLongPress?: () => void;
}) {
  const meta = getCategoryMeta(project.category);
  const phaseCount = project.implementationPlan?.phases?.length ?? 0;
  const donePhases = project.implementationPlan?.phases?.filter((p) => p.status === 'Completed').length ?? 0;
  const openRisks = project.risks?.filter((r) => r.status === 'Open').length ?? 0;
  const pct = project.progress ?? 0;
  return (
    <Card>
      <Pressable onLongPress={onLongPress} delayLongPress={350} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${project.title}, ${project.status ?? ''}, ${pct}%`} accessibilityHint={onLongPress ? 'Long-press for options' : undefined}>
        <View className="flex-row items-start">
          <View className="w-10 h-10 rounded-xl items-center justify-center mr-3" style={{ backgroundColor: (project.color ?? meta.color) + '22' }}>
            <meta.Icon size={20} color={project.color ?? meta.color} />
          </View>
          <View className="flex-1">
            {project.category ? (
              <Text className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: meta.color }}>{project.category}</Text>
            ) : null}
            <Text className="text-ink text-base font-semibold" numberOfLines={1}>{project.title}</Text>
          </View>
        </View>
        {project.description ? <Text className="text-ink-muted text-sm mt-2" numberOfLines={2}>{project.description}</Text> : null}
        <View className="mt-3"><PlanBadges project={project} /></View>
        <View className="flex-row flex-wrap gap-x-4 gap-y-1 mt-3">
          {tasks ? <MetaRow icon={<ListChecks size={12} color={T.accent} />} text={`${tasks.open} open · ${tasks.done} done`} /> : null}
          {project.deadline ? <MetaRow icon={<Calendar size={12} color={T.muted} />} text={formatDate(project.deadline) ?? ''} /> : null}
          {project.team?.length ? <MetaRow icon={<Users size={12} color={T.muted} />} text={`${project.team.length} member${project.team.length > 1 ? 's' : ''}`} /> : null}
          {phaseCount ? <MetaRow icon={<Layers size={12} color="#818cf8" />} text={`${donePhases}/${phaseCount} phases`} /> : null}
          {openRisks ? <MetaRow icon={<TriangleAlert size={12} color="#fb923c" />} text={`${openRisks} open risk${openRisks !== 1 ? 's' : ''}`} /> : null}
        </View>
        <View className="mt-3">
          <View className="flex-row justify-between mb-1">
            <Text className="text-ink-muted text-xs">Progress</Text>
            <Text className="text-ink-muted text-xs">{pct}%</Text>
          </View>
          <ProgressBar value={pct} tone={pct >= 100 ? 'green' : 'accent'} />
        </View>
      </Pressable>
    </Card>
  );
}

/**
 * The plan, inline (project screen "Plan" view and shared-workspace detail):
 * badges, progress (plan % next to live task %), dates, people, budget,
 * phases, milestones, risks and check-ins.
 */
export function PlanSummary({ project, tasks, onEdit, onUseTaskProgress }: {
  project: Project; tasks?: TaskProgress; onEdit?: () => void; onUseTaskProgress?: (pct: number) => void;
}) {
  const budgetPct = project.totalBudget && project.totalBudget > 0 ? Math.round(((project.budgetUsed || 0) / project.totalBudget) * 100) : null;
  const pct = project.progress ?? 0;
  const live = taskPct(tasks);
  const phases = [...(project.implementationPlan?.phases ?? [])].sort((a, b) => a.order - b.order);
  const milestones = project.projectMilestones ?? [];
  const openRisks = (project.risks ?? []).filter((r) => r.status !== 'Closed' && r.status !== 'Mitigated');
  const lastCheckIn = project.teamCheckIns?.[project.teamCheckIns.length - 1];

  return (
    <View>
      <View className="flex-row items-center mb-3">
        <View className="flex-1"><PlanBadges project={project} /></View>
        {onEdit ? (
          <Pressable onPress={onEdit} hitSlop={8} className="px-3 py-1.5 rounded-full bg-midnight-lighter active:opacity-70" accessibilityRole="button" accessibilityLabel="Edit plan">
            <Text className="text-accent text-xs font-semibold">Edit plan</Text>
          </Pressable>
        ) : null}
      </View>

      {project.description ? <Text className="text-ink text-sm mb-3 leading-5">{project.description}</Text> : null}

      <Card className="mb-3">
        <View className="flex-row justify-between mb-1">
          <Text className="text-ink-muted text-xs">Plan progress</Text>
          <Text className="text-ink text-xs font-semibold">{pct}%</Text>
        </View>
        <ProgressBar value={pct} tone={pct >= 100 ? 'green' : 'accent'} />
        {live !== null ? (
          <View className="flex-row items-center mt-2.5">
            <ListChecks size={13} color={T.muted} />
            <Text className="text-ink-muted text-xs ml-1.5 flex-1">Tasks: {tasks!.done}/{tasks!.open + tasks!.done} done ({live}%)</Text>
            {onUseTaskProgress && live !== pct ? (
              <Pressable onPress={() => onUseTaskProgress(live)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Set plan progress to ${live} percent`}>
                <Text className="text-accent text-xs font-semibold">Use {live}%</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Card>

      <DetailRow icon={<Calendar size={14} color={T.muted} />} label="Start" value={formatDate(project.startDate)} />
      <DetailRow icon={<Calendar size={14} color={T.muted} />} label="Deadline" value={formatDate(project.deadline)} />
      <DetailRow icon={<User size={14} color={T.muted} />} label="Manager" value={project.projectManager} />
      <DetailRow icon={<Users size={14} color={T.muted} />} label="Team" value={listToCsv(project.team) || null} />
      <DetailRow icon={<Compass size={14} color={T.muted} />} label="Stakeholders" value={listToCsv(project.stakeholders) || null} />
      <DetailRow icon={<FileText size={14} color={T.muted} />} label="Reporting" value={project.reportingStructure} />
      {budgetPct !== null ? <DetailRow icon={<Wallet size={14} color={T.muted} />} label="Budget used" value={`${budgetPct}% of ${project.totalBudget}`} /> : null}
      {lastCheckIn ? <DetailRow icon={<MessageSquare size={14} color={T.muted} />} label="Last check-in" value={formatDate(lastCheckIn.date)} /> : null}

      {phases.length ? (
        <View className="mt-2 mb-3">
          <Text className="text-ink-muted text-xs font-semibold mb-2">PHASES</Text>
          {phases.map((ph) => (
            <View key={ph.id} className="flex-row items-center py-1.5">
              <Layers size={13} color={ph.status === 'Completed' ? T.success : ph.status === 'Blocked' ? T.danger : '#818cf8'} />
              <Text className="text-ink text-sm ml-2 flex-1" numberOfLines={1}>{ph.name}</Text>
              <Text className="text-ink-muted text-xs">{ph.status} · {ph.progress ?? 0}%</Text>
            </View>
          ))}
        </View>
      ) : null}

      {milestones.length ? (
        <View className="mt-2 mb-3">
          <Text className="text-ink-muted text-xs font-semibold mb-2">MILESTONES</Text>
          {milestones.map((m) => (
            <View key={m.id} className="flex-row items-center py-1.5">
              {m.completed ? <CircleCheck size={14} color={T.success} /> : <Circle size={14} color={T.muted} />}
              <Text className={`text-sm ml-2 flex-1 ${m.completed ? 'text-ink-muted line-through' : 'text-ink'}`} numberOfLines={1}>{m.title}</Text>
              {m.dueDate ? <Text className="text-ink-muted text-xs">{formatDate(m.dueDate)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {openRisks.length ? (
        <View className="mt-2 mb-3">
          <Text className="text-ink-muted text-xs font-semibold mb-2">OPEN RISKS</Text>
          {openRisks.map((r) => (
            <View key={r.id} className="flex-row items-center py-1.5">
              <TriangleAlert size={13} color="#fb923c" />
              <Text className="text-ink text-sm ml-2 flex-1" numberOfLines={2}>{r.title}</Text>
              {r.severity ? <Text className="text-ink-muted text-xs">{r.severity}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {project.tags && project.tags.length > 0 ? (
        <View className="mt-1 mb-3">
          <Text className="text-ink-muted text-xs font-semibold mb-1.5">TAGS</Text>
          <View className="flex-row flex-wrap gap-1.5">
            {project.tags.map((t) => (
              <View key={t} className="px-2 py-1 rounded bg-midnight-lighter">
                <Text className="text-ink-muted text-[10px] uppercase tracking-wider">{t}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {project.notes ? (
        <View className="mb-3">
          <Text className="text-ink-muted text-xs font-semibold mb-1">NOTES</Text>
          <Text className="text-ink text-sm leading-5">{project.notes}</Text>
        </View>
      ) : null}

      {(project.resources?.length || project.performanceMetrics?.length || project.alignments?.length) ? (
        <View className="flex-row flex-wrap gap-x-4 gap-y-1 mb-2">
          {project.resources?.length ? <MetaRow icon={<Wallet size={12} color="#34d399" />} text={`${project.resources.length} resources`} /> : null}
          {project.performanceMetrics?.length ? <MetaRow icon={<ChartColumn size={12} color="#22d3ee" />} text={`${project.performanceMetrics.length} KPIs`} /> : null}
          {project.alignments?.length ? <MetaRow icon={<Flag size={12} color="#c084fc" />} text={`${project.alignments.length} goal alignments`} /> : null}
        </View>
      ) : null}
    </View>
  );
}
