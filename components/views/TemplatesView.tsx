import React, { useState } from 'react';
import { ChevronDown, ChevronRight, LayoutGrid, List, Flag } from 'lucide-react';
import { TEMPLATES, type ProjectTemplate } from '../../shared/domain';
import { cx, Modal, PRIORITY_COLOR, useTaskToast } from '../tasks/ui';
import { applyTemplate } from '../tasks/actions';
import { go } from '../tasks/TaskViews';
import { PageShell } from './PageShell';

function UseTemplate({ tpl, onClose }: { tpl: ProjectTemplate | null; onClose: () => void }) {
  const toast = useTaskToast();
  const [name, setName] = useState('');
  const [was, setWas] = useState<string | null>(null);
  if ((tpl?.id ?? null) !== was) { setWas(tpl?.id ?? null); setName(tpl?.name ?? ''); }
  const create = () => {
    if (!tpl) return;
    try {
      const p = applyTemplate(tpl.id, name.trim() || tpl.name);
      toast(`Created “${p.title}”`);
      onClose();
      go(`project/${p.id}`);
    } catch (e: any) {
      toast(e?.message ?? 'Couldn’t create the project');
    }
  };
  return (
    <Modal open={!!tpl} onClose={onClose} title={tpl ? `Use “${tpl.name}”` : undefined}>
      {tpl ? (
        <div className="p-5 space-y-4">
          <label className="block">
            <span className={`text-xs font-semibold ${cx.muted}`}>Project name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} className={`${cx.input} w-full mt-1`} />
          </label>
          <p className={`text-sm ${cx.muted}`}>Creates a {tpl.view} project with {tpl.sections.length} sections and {tpl.sections.reduce((n, s) => n + s.tasks.length, 0)} starter tasks.</p>
          <div className="flex justify-end gap-2"><button onClick={onClose} className={cx.btnGhost}>Cancel</button><button onClick={create} className={cx.btnPrimary}>Create project</button></div>
        </div>
      ) : null}
    </Modal>
  );
}

export default function TemplatesView() {
  const [open, setOpen] = useState<string | null>(null);
  const [use, setUse] = useState<ProjectTemplate | null>(null);
  return (
    <PageShell title="Templates" subtitle="Start a project with ready-made sections and tasks">
      <div className="grid gap-3 sm:grid-cols-2">
        {TEMPLATES.map((t) => {
          const expanded = open === t.id;
          const taskCount = t.sections.reduce((n, s) => n + s.tasks.length, 0);
          return (
            <article key={t.id} className={`rounded-xl border ${cx.border} ${cx.card} p-4 flex flex-col ${expanded ? 'sm:col-span-2' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${t.color}22` }} aria-hidden>{t.icon}</span>
                <div className="flex-1 min-w-0">
                  <h2 className={`font-semibold ${cx.text}`}>{t.name}</h2>
                  <p className={`text-sm mt-0.5 ${cx.muted}`}>{t.description}</p>
                  <p className={`text-xs mt-1 inline-flex items-center gap-1 ${cx.faint}`}>
                    {t.view === 'board' ? <LayoutGrid size={12} /> : <List size={12} />}{t.view === 'board' ? 'Board' : 'List'} · {t.sections.length} sections · {taskCount} tasks
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {t.sections.map((s) => (
                  <span key={s.name} className={`text-xs px-2 py-0.5 rounded-md border ${cx.border} ${cx.muted}`}>{s.name}{s.tasks.length ? ` · ${s.tasks.length}` : ''}</span>
                ))}
              </div>
              {expanded ? (
                <div className={`mt-3 grid gap-3 ${t.view === 'board' ? 'sm:grid-cols-2 lg:grid-cols-4' : ''}`}>
                  {t.sections.map((s) => (
                    <div key={s.name} className={`rounded-lg border ${cx.border} p-2.5 min-w-0`}>
                      <h3 className={`text-xs font-bold mb-1.5 ${cx.text}`}>{s.name}</h3>
                      {s.tasks.length ? s.tasks.map((x) => (
                        <div key={x.title} className={`flex items-center gap-2 text-sm py-1 ${cx.text}`}>
                          <span className="w-3.5 h-3.5 rounded-full border-2 shrink-0" style={{ borderColor: PRIORITY_COLOR[x.priority ?? 'None'] }} />
                          <span className="flex-1 min-w-0 truncate">{x.title}</span>
                          {x.priority && x.priority !== 'None' ? <Flag size={12} color={PRIORITY_COLOR[x.priority]} fill={PRIORITY_COLOR[x.priority]} /> : null}
                        </div>
                      )) : <p className={`text-xs ${cx.faint}`}>Empty section</p>}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex items-center gap-2 pt-4 mt-auto">
                <button onClick={() => setOpen(expanded ? null : t.id)} className={`inline-flex items-center gap-1 ${cx.btnGhost}`} aria-expanded={expanded}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}Preview
                </button>
                <div className="flex-1" />
                <button onClick={() => setUse(t)} className={cx.btnPrimary}>Use template</button>
              </div>
            </article>
          );
        })}
      </div>
      <UseTemplate tpl={use} onClose={() => setUse(null)} />
    </PageShell>
  );
}
