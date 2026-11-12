/**
 * Project notes panel: every project has a notes space in the vault
 * (Projects/<title>). Shows the project's notes and creates new ones there;
 * opening a note goes to the full vault editor. Iris and MCP agents use the
 * same folder (notes_create with project=…).
 */
import React, { useMemo, useState } from 'react';
import { FileText, Plus, ArrowUpRight } from 'lucide-react';
import type { Note, Project } from '../../types';
import { STORES } from '../../services/db';
import { useStore } from '../tasks/store';
import { cx, useTaskToast } from '../tasks/ui';
import { projectNotesFolder, isProjectNote } from '../../shared/projects/notes';
import { excerpt } from '../../shared/notes';
import { createNote } from '../vault/useVault';
import { AppIcon } from '../ui-kit/AppIcon';

const ago = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function ProjectNotes({ project }: { project: Project }) {
  const { items } = useStore<Note>(STORES.NOTES);
  const toast = useTaskToast();
  const [busy, setBusy] = useState(false);
  const notes = useMemo(() => items.filter((n) => isProjectNote(n, project)).sort((a, b) => (b.lastEdited ?? '').localeCompare(a.lastEdited ?? '')), [items, project]);

  const add = async () => {
    setBusy(true);
    try {
      const n = await createNote({ folder: projectNotesFolder(project), content: `---\nproject: ${project.title}\n---\n\n` });
      window.location.hash = `#notes/${encodeURIComponent(n.id)}`;
    } catch (e: any) {
      toast(e?.message ?? 'Couldn’t create the note');
    } finally { setBusy(false); }
  };

  return (
    <section className="mt-6 rounded-2xl border border-gray-200/70 dark:border-white/10 bg-white dark:bg-white/[0.02] p-4" aria-label="Project notes">
      <div className="flex items-center gap-2.5">
        <AppIcon icon={FileText} tint="amber" size={24} />
        <h2 className={`flex-1 text-sm font-semibold ${cx.text}`}>Project notes <span className={`font-normal ${cx.muted}`}>{notes.length ? `· ${notes.length}` : ''}</span></h2>
        <button type="button" onClick={add} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 disabled:opacity-50">
          <Plus size={14} />New note
        </button>
      </div>
      {notes.length ? (
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-white/5">
          {notes.slice(0, 8).map((n) => (
            <li key={n.id}>
              <a href={`#notes/${encodeURIComponent(n.id)}`} className="group flex items-start gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${cx.text}`}>{n.title}</p>
                  <p className={`text-xs truncate ${cx.muted}`}>{excerpt(n, 120) || 'Empty note'}</p>
                </div>
                <span className={`text-[11px] shrink-0 mt-0.5 ${cx.faint}`}>{ago(n.lastEdited)}</span>
                <ArrowUpRight size={14} className={`shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 ${cx.muted}`} />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={`mt-3 text-xs ${cx.muted}`}>Meeting notes, decisions and research for {project.title} live here. Iris can write them for you too: “add a note to {project.title} about…”.</p>
      )}
      {notes.length > 8 ? <a href="#notes" className="block mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline">All {notes.length} notes in {projectNotesFolder(project)}</a> : null}
    </section>
  );
}
