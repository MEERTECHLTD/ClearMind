import React, { useState, useEffect, useMemo } from 'react';
import { Goal } from '../../types';
import { dbService, STORES } from '../../services/db';
import { Target, Trophy, Clock, Pencil, Trash2, Check, Plus, FolderKanban } from 'lucide-react';
import { useTaskData } from '../tasks/TaskContext';
import { projectColor } from '../tasks/actions';
import { PageShell, Card, Modal, ModalBody, ModalFooter, Field, IconBtn, ProgressBar, Badge, Empty, inputCls, cx } from '../ui-kit';

const GOAL_MET = '#16A34A';
const ACCENT = '#3B82F6';
const norm = (s: string | undefined | null) => (s ?? '').trim().toLowerCase();

const GoalsView: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Goal | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newGoal, setNewGoal] = useState({
    title: '',
    targetDate: '',
    category: 'Personal' as Goal['category'],
    progress: 0
  });

  useEffect(() => {
    const loadGoals = async () => {
      const data = await dbService.getAll<Goal>(STORES.GOALS);
      setGoals(data);
    };
    loadGoals();

    // Listen for sync events to reload data
    const handleSync = (e: CustomEvent) => {
      if (e.detail?.store === 'goals') {
        loadGoals();
      }
    };
    window.addEventListener('clearmind-sync', handleSync as EventListener);
    return () => window.removeEventListener('clearmind-sync', handleSync as EventListener);
  }, []);

  const handleAddGoal = async () => {
    if (!newGoal.title.trim()) return;

    const goal: Goal = {
      id: Date.now().toString(),
      title: newGoal.title,
      targetDate: newGoal.targetDate || 'No deadline',
      progress: newGoal.progress,
      category: newGoal.category
    };

    await dbService.put(STORES.GOALS, goal);
    setGoals([...goals, goal]);
    setNewGoal({ title: '', targetDate: '', category: 'Personal', progress: 0 });
    setShowAddModal(false);
  };

  const handleEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setEditForm({ ...goal });
  };

  const handleSaveEdit = async () => {
    if (!editForm) return;
    await dbService.put(STORES.GOALS, editForm);
    setGoals(goals.map(g => g.id === editForm.id ? editForm : g));
    setEditingId(null);
    setEditForm(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    await dbService.delete(STORES.GOALS, id);
    setGoals(goals.filter(g => g.id !== id));
  };

  const categories: Goal['category'][] = ['Career', 'Personal', 'Health', 'Skill'];

  // Projects whose strategic alignment names this goal (case-insensitive).
  const { projects } = useTaskData();
  const alignedByGoal = useMemo(() => {
    const m = new Map<string, typeof projects>();
    for (const g of goals) {
      const key = norm(g.title);
      if (!key) continue;
      m.set(g.id, projects.filter((p) => !p.deleted && !p.archived && (p.alignments ?? []).some((a) => norm(a.strategicGoal) === key)));
    }
    return m;
  }, [goals, projects]);

  const closeAdd = () => {
    setShowAddModal(false);
    setNewGoal({ title: '', targetDate: '', category: 'Personal', progress: 0 });
  };

  return (
    <PageShell
      title="Goals"
      subtitle="Long term vision determines short term actions."
      wide
      actions={
        <button onClick={() => setShowAddModal(true)} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
          <Plus size={16} />New goal
        </button>
      }
    >
      {goals.length === 0 ? (
        <Empty
          icon={<Target size={30} className="text-blue-500" />}
          title="No goals yet"
          subtitle="Set a long-term goal, then align projects to it from the project planner."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {goals.map((goal) => {
            const aligned = alignedByGoal.get(goal.id) ?? [];
            const done = goal.progress === 100;
            return (
              <Card key={goal.id} className="flex flex-col">
                {editingId === goal.id && editForm ? (
                  <div className="space-y-4">
                    <Field label="Title">
                      <input type="text" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} className={inputCls} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Category">
                        <select value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Goal['category'] })} className={inputCls}>
                          {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                        </select>
                      </Field>
                      <Field label="Target date">
                        <input type="date" value={editForm.targetDate} onChange={(e) => setEditForm({ ...editForm, targetDate: e.target.value })} className={inputCls} />
                      </Field>
                    </div>
                    <Field label={`Progress: ${editForm.progress}%`}>
                      <input type="range" min="0" max="100" value={editForm.progress} onChange={(e) => setEditForm({ ...editForm, progress: parseInt(e.target.value) })} className="w-full accent-blue-600 cursor-pointer" />
                    </Field>
                    <div className="flex justify-end gap-2">
                      <button onClick={handleCancelEdit} className={cx.btnGhost}>Cancel</button>
                      <button onClick={handleSaveEdit} className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}><Check size={16} />Save</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-500/10">
                        <Target size={18} className="text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold truncate ${cx.text}`}>{goal.title}</h3>
                        <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-xs ${cx.muted}`}>
                          <Badge>{goal.category}</Badge>
                          <span className="inline-flex items-center gap-1"><Clock size={12} />{goal.targetDate}</span>
                          {done ? <span className="inline-flex items-center gap-1 text-amber-500"><Trophy size={12} />Achieved</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <IconBtn label="Edit goal" onClick={() => handleEdit(goal)}><Pencil size={16} /></IconBtn>
                        <IconBtn label="Delete goal" danger onClick={() => handleDelete(goal.id)}><Trash2 size={16} /></IconBtn>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className={cx.muted}>Progress</span>
                        <span className={`font-medium tabular-nums ${cx.text}`}>{goal.progress}%</span>
                      </div>
                      <ProgressBar value={goal.progress} color={done ? GOAL_MET : ACCENT} label={`${goal.title} progress`} />
                    </div>

                    <div className={`mt-4 pt-3 border-t ${cx.border}`}>
                      <p className={`text-xs font-medium mb-1.5 ${cx.muted}`}>Aligned projects</p>
                      {aligned.length ? (
                        <ul className="space-y-0.5">
                          {aligned.map((p) => (
                            <li key={p.id}>
                              <a href={`#project/${p.id}?tab=plan`} className={`flex items-center gap-2 px-1.5 py-1 -mx-1.5 rounded-md text-sm ${cx.hover} ${cx.text}`}>
                                <FolderKanban size={16} style={{ color: projectColor(p) }} />
                                <span className="flex-1 truncate">{p.title}</span>
                                <span className={`text-xs tabular-nums ${cx.muted}`}>{p.progress ?? 0}%</span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={`text-xs ${cx.faint}`}>No projects aligned yet — add “{goal.title}” as a strategic goal in a project’s plan.</p>
                      )}
                    </div>
                  </>
                )}
              </Card>
            );
          })}

          <button
            onClick={() => setShowAddModal(true)}
            className={`rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 min-h-[160px] flex flex-col items-center justify-center gap-2 text-sm ${cx.muted} hover:text-blue-600 dark:hover:text-blue-400 ${cx.hover} transition-colors`}
          >
            <span className="w-10 h-10 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center"><Plus size={20} /></span>
            Set a new goal
          </button>
        </div>
      )}

      <Modal open={showAddModal} onClose={closeAdd} title="Create new goal">
        <ModalBody>
          <Field label="Goal title">
            <input
              type="text"
              autoFocus
              value={newGoal.title}
              onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddGoal(); }}
              placeholder="What do you want to achieve?"
              className={inputCls}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={newGoal.category} onChange={(e) => setNewGoal({ ...newGoal, category: e.target.value as Goal['category'] })} className={inputCls}>
                {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </Field>
            <Field label="Target date">
              <input type="date" value={newGoal.targetDate} onChange={(e) => setNewGoal({ ...newGoal, targetDate: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label={`Initial progress: ${newGoal.progress}%`}>
            <input type="range" min="0" max="100" value={newGoal.progress} onChange={(e) => setNewGoal({ ...newGoal, progress: parseInt(e.target.value) })} className="w-full accent-blue-600 cursor-pointer" />
          </Field>
        </ModalBody>
        <ModalFooter>
          <button onClick={closeAdd} className={cx.btnGhost}>Cancel</button>
          <button onClick={handleAddGoal} disabled={!newGoal.title.trim()} className={cx.btnPrimary}>Create goal</button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
};

export default GoalsView;
