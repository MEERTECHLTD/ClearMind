/** Vault modals: quick switcher, command palette, template & folder pickers, settings, confirm. */
import React, { useMemo } from 'react';
import { FilePlus2, CornerDownLeft, Folder, FolderPlus, LayoutTemplate } from 'lucide-react';
import type { Note } from '../../types';
import { quickSwitch, formatDate, notePath } from '../../shared/notes';
import { Modal } from '../tasks/ui';
import { setVaultSettings, templates, type VaultSettings } from './useVault';
import { fuzzyScore, readPref, writePref } from './workspace';
import { SuggestModal, FuzzyText, Kbd, vx, useVaultApi } from './shell';

const Hints = ({ items }: { items: [string, string][] }) => <>{items.map(([k, l]) => <span key={l} className="flex items-center gap-1"><Kbd k={k} />{l}</span>)}</>;

// ------------------------------------------------------------------ quick switcher

type QSItem = { kind: 'note'; note: Note; via?: string } | { kind: 'create'; title: string };

export function QuickSwitcher({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (title: string, newTab: boolean) => void }) {
  const api = useVaultApi();
  const index = api.vault.index;
  const items = (q: string): QSItem[] => {
    const res: QSItem[] = quickSwitch(index, q, 50).map((r) => ({ kind: 'note' as const, note: r.note, via: r.via }));
    const t = q.trim();
    if (t && !index.resolve(t)) res.push({ kind: 'create', title: t });
    return res;
  };
  return (
    <SuggestModal<QSItem>
      open={open}
      onClose={onClose}
      placeholder="Find or create a note…"
      items={items}
      itemKey={(it) => (it.kind === 'note' ? it.note.id : `create:${it.title}`)}
      render={(it, q) => it.kind === 'create' ? (
        <div className={`flex items-center gap-2 text-sm ${vx.text}`}>
          <FilePlus2 size={14} className={vx.accentText} />
          <span className="truncate">Create <b>{it.title}</b></span>
          <span className={`ml-auto text-[11px] ${vx.faint}`}><Kbd k="Shift+↵" /></span>
        </div>
      ) : (
        <div className="min-w-0">
          <div className={`text-sm truncate ${vx.text}`}><FuzzyText text={it.note.title} q={q} /></div>
          {it.via ? <div className={`text-[11px] truncate ${vx.muted}`}>↳ alias: <FuzzyText text={it.via} q={q} /></div> : null}
          {it.note.folder ? <div className={`text-[11px] truncate ${vx.faint}`}>{it.note.folder}/</div> : null}
        </div>
      )}
      onChoose={(it, how) => {
        if (it.kind === 'create') onCreate(it.title, how.mod);
        else api.openNote(it.note.id, { newTab: how.mod });
      }}
      onShiftEnter={(q, how) => { if (q.trim()) onCreate(q.trim(), how.mod); }}
      empty={(q) => (q.trim() ? 'No notes found' : 'Your vault is empty')}
      footer={<Hints items={[['↑↓', 'navigate'], ['↵', 'open'], ['Mod+↵', 'open in new tab'], ['Shift+↵', 'create'], ['Esc', 'dismiss']]} />}
    />
  );
}

// ------------------------------------------------------------------ command palette

export interface Command { id: string; name: string; icon?: React.ReactNode; hotkey?: string; run: () => void; when?: () => boolean }
const RECENT_KEY = 'cm.vault.recentCommands';

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const recent = useMemo(() => (open ? readPref<{ ids: string[] }>(RECENT_KEY, { ids: [] }).ids : []), [open]);
  const items = (q: string) => {
    const avail = commands.filter((c) => !c.when || c.when());
    if (!q.trim()) {
      const r = recent.map((id) => avail.find((c) => c.id === id)).filter(Boolean) as Command[];
      return [...r, ...avail.filter((c) => !recent.includes(c.id)).sort((a, b) => a.name.localeCompare(b.name))];
    }
    return avail.map((c) => ({ c, s: fuzzyScore(c.name, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
  };
  return (
    <SuggestModal<Command>
      open={open}
      onClose={onClose}
      placeholder="Select a command…"
      items={items}
      itemKey={(c) => c.id}
      render={(c, q) => (
        <div className="flex items-center gap-2.5">
          <span className={`w-4 flex justify-center ${vx.muted}`}>{c.icon}</span>
          <span className={`flex-1 truncate text-sm ${vx.text}`}><FuzzyText text={c.name} q={q} /></span>
          {recent.includes(c.id) && !q ? <span className={`text-[10px] ${vx.faint}`}>recent</span> : null}
          {c.hotkey ? <Kbd k={c.hotkey} /> : null}
        </div>
      )}
      onChoose={(c) => {
        writePref(RECENT_KEY, { ids: [c.id, ...recent.filter((x) => x !== c.id)].slice(0, 5) });
        window.setTimeout(c.run, 0);
      }}
      empty={() => 'No matching commands'}
      footer={<Hints items={[['↑↓', 'navigate'], ['↵', 'run'], ['Esc', 'dismiss']]} />}
    />
  );
}

// ------------------------------------------------------------------ template picker

export function TemplatePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: Note) => void }) {
  const api = useVaultApi();
  const list = useMemo(() => (open ? templates() : []), [open, api.vault.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SuggestModal<Note>
      open={open}
      onClose={onClose}
      placeholder="Insert template…"
      items={(q) => list.map((t) => ({ t, s: fuzzyScore(t.title, q) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.t)}
      itemKey={(t) => t.id}
      render={(t, q) => (
        <div className="flex items-center gap-2">
          <LayoutTemplate size={14} className={vx.muted} />
          <span className={`truncate text-sm ${vx.text}`}><FuzzyText text={t.title} q={q} /></span>
          <span className={`ml-auto text-[11px] truncate ${vx.faint}`}>{t.folder}</span>
        </div>
      )}
      onChoose={(t) => onPick(t)}
      empty={() => <>No templates. Put notes in the <b>{api.settings.templatesFolder || 'Templates'}</b> folder.</>}
      footer={<Hints items={[['↑↓', 'navigate'], ['↵', 'insert'], ['Esc', 'dismiss']]} />}
    />
  );
}

// ------------------------------------------------------------------ folder picker (move to…)

type FolderItem = { path: string; create?: boolean };
export function FolderPicker({ open, onClose, onPick, title }: { open: boolean; onClose: () => void; onPick: (folder: string) => void; title?: string }) {
  const api = useVaultApi();
  const items = (q: string): FolderItem[] => {
    const all: FolderItem[] = [{ path: '' }, ...api.vault.folders.map((p) => ({ path: p }))];
    const res = all.map((f) => ({ f, s: f.path ? fuzzyScore(f.path, q) : (q.trim() ? fuzzyScore('/', q) : 1) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.f);
    const t = q.trim().replace(/^\/+|\/+$/g, '');
    if (t && !api.vault.folders.some((f) => f.toLowerCase() === t.toLowerCase())) res.push({ path: t, create: true });
    return res;
  };
  return (
    <SuggestModal<FolderItem>
      open={open}
      onClose={onClose}
      placeholder={title ?? 'Move to folder…'}
      items={items}
      itemKey={(f) => `${f.create ? '+' : ''}${f.path}`}
      render={(f, q) => (
        <div className={`flex items-center gap-2 text-sm ${vx.text}`}>
          {f.create ? <FolderPlus size={14} className={vx.accentText} /> : <Folder size={14} className={vx.muted} />}
          {f.create ? <span>Create & move to <b>{f.path}</b></span> : <span className="truncate">{f.path ? <FuzzyText text={f.path} q={q} /> : '/ (vault root)'}</span>}
        </div>
      )}
      onChoose={(f) => onPick(f.path)}
      footer={<Hints items={[['↑↓', 'navigate'], ['↵', 'move'], ['Esc', 'dismiss']]} />}
    />
  );
}

// ------------------------------------------------------------------ settings

const Row = ({ label, desc, children }: { label: string; desc?: React.ReactNode; children: React.ReactNode }) => (
  <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 py-3 border-b last:border-0 ${vx.border}`}>
    <div className="flex-1 min-w-0">
      <div className={`text-sm font-medium ${vx.text}`}>{label}</div>
      {desc ? <div className={`text-[12px] mt-0.5 ${vx.muted}`}>{desc}</div> : null}
    </div>
    <div className="sm:w-56 shrink-0">{children}</div>
  </div>
);
const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative w-10 h-6 rounded-full transition-colors ${on ? 'bg-blue-600 dark:bg-violet-500' : 'bg-gray-300 dark:bg-white/15'}`}>
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : ''}`} />
  </button>
);
const H = ({ children }: { children: React.ReactNode }) => <h3 className={`text-[11px] font-semibold uppercase tracking-wide mt-5 mb-1 ${vx.muted}`}>{children}</h3>;

export function VaultSettingsModal({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: VaultSettings }) {
  const api = useVaultApi();
  const tpls = useMemo(() => (open ? templates() : []), [open, api.vault.notes]); // eslint-disable-line react-hooks/exhaustive-deps
  const preview = useMemo(() => { try { return formatDate(new Date(), settings.daily.format || 'YYYY-MM-DD'); } catch { return '—'; } }, [settings.daily.format]);
  const setDaily = (p: Partial<VaultSettings['daily']>) => setVaultSettings({ daily: { ...settings.daily, ...p } });
  const folderList = <datalist id="vault-folders">{api.vault.folders.map((f) => <option key={f} value={f} />)}</datalist>;
  return (
    <Modal open={open} onClose={onClose} title="Vault settings">
      <div className="overflow-y-auto px-5 pb-5">
        {folderList}
        <H>Editor</H>
        <Row label="Default view for new tabs" desc="Cmd/Ctrl+E switches between editing and reading.">
          <select className={vx.input} value={settings.defaultMode} onChange={(e) => setVaultSettings({ defaultMode: e.target.value as VaultSettings['defaultMode'] })} aria-label="Default view">
            <option value="live">Live preview</option>
            <option value="source">Source mode</option>
            <option value="reading">Reading view</option>
          </select>
        </Row>
        <Row label="Readable line length" desc="Limit the maximum line length."><Toggle label="Readable line length" on={settings.readableLineLength} onChange={(v) => setVaultSettings({ readableLineLength: v })} /></Row>
        <Row label="Show properties" desc="Edit frontmatter in a properties table above the note."><Toggle label="Show properties" on={settings.showFrontmatter} onChange={(v) => setVaultSettings({ showFrontmatter: v })} /></Row>
        <Row label="Spellcheck"><Toggle label="Spellcheck" on={settings.spellcheck} onChange={(v) => setVaultSettings({ spellcheck: v })} /></Row>
        <H>Files</H>
        <Row label="Default location for new notes">
          <select className={vx.input} value={settings.newNoteLocation} onChange={(e) => setVaultSettings({ newNoteLocation: e.target.value as VaultSettings['newNoteLocation'] })} aria-label="New note location">
            <option value="root">Vault folder</option>
            <option value="current">Same folder as current file</option>
            <option value="folder">In the folder specified below</option>
          </select>
        </Row>
        {settings.newNoteLocation === 'folder' ? (
          <Row label="Folder to create new notes in">
            <input className={vx.input} list="vault-folders" value={settings.newNoteFolder} onChange={(e) => setVaultSettings({ newNoteFolder: e.target.value })} placeholder="e.g. Inbox" aria-label="New note folder" />
          </Row>
        ) : null}
        <H>Daily notes</H>
        <Row label="Date format" desc={<>Your current syntax looks like this: <b className={vx.text}>{preview}</b></>}>
          <input className={vx.input} value={settings.daily.format ?? ''} onChange={(e) => setDaily({ format: e.target.value })} placeholder="YYYY-MM-DD" aria-label="Daily note date format" />
        </Row>
        <Row label="New file location" desc="New daily notes are placed here.">
          <input className={vx.input} list="vault-folders" value={settings.daily.folder ?? ''} onChange={(e) => setDaily({ folder: e.target.value })} placeholder="Vault root" aria-label="Daily notes folder" />
        </Row>
        <Row label="Template file location" desc="Applied when a daily note is created.">
          <select className={vx.input} value={settings.daily.templateId ?? ''} onChange={(e) => setDaily({ templateId: e.target.value || null })} aria-label="Daily note template">
            <option value="">None</option>
            {tpls.map((t) => <option key={t.id} value={t.id}>{notePath(t)}</option>)}
          </select>
        </Row>
        <H>Templates</H>
        <Row label="Template folder location" desc={<>Notes here appear in “Insert template”. Variables: <code>{'{{title}}'}</code> <code>{'{{date}}'}</code> <code>{'{{time}}'}</code> <code>{'{{date:YYYY-MM-DD}}'}</code></>}>
          <input className={vx.input} list="vault-folders" value={settings.templatesFolder} onChange={(e) => setVaultSettings({ templatesFolder: e.target.value })} placeholder="Templates" aria-label="Templates folder" />
        </Row>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ confirm

export function ConfirmModal({ state, onDone }: { state: { title: string; message: string; confirm: string; danger?: boolean } | null; onDone: (ok: boolean) => void }) {
  return (
    <Modal open={!!state} onClose={() => onDone(false)} title={state?.title}>
      <div className="p-5">
        <p className={`text-sm ${vx.text}`}>{state?.message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button className="px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10" onClick={() => onDone(false)}>Cancel</button>
          <button autoFocus className={`px-3 py-1.5 rounded-lg text-sm font-semibold text-white flex items-center gap-1.5 ${state?.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`} onClick={() => onDone(true)}>
            {state?.confirm}<CornerDownLeft size={13} className="opacity-70" />
          </button>
        </div>
      </div>
    </Modal>
  );
}
