import React, { useState } from 'react';
import { Workspace } from '../types';
import { Share2, Crown, UserPlus, Globe, Lock, Mail, Link2, Users, X, Trash2 } from 'lucide-react';

// Reusable collaboration UI shared by the Applications and Projects views. The
// parent owns the data (workspaces, active id, create/seed/members/delete) and the
// item noun ("project" / "application"); these are presentational.

const inputClass =
  'w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500';
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const chip = (active: boolean) =>
  `inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-blue-600 text-white border-blue-600' : 'dark:border-gray-700 border-gray-300 text-gray-400 hover:text-gray-200'}`;

export const WorkspaceBar: React.FC<{
  workspaces: Workspace[];
  activeWsId: string | null;
  personalLabel: string;
  onSelect: (id: string | null) => void;
  onShareNew: () => void;
}> = ({ workspaces, activeWsId, personalLabel, onSelect, onShareNew }) => (
  <div className="flex items-center gap-2 mb-4 flex-wrap">
    <span className="text-xs text-gray-500 mr-1">Workspace</span>
    <button type="button" onClick={() => onSelect(null)} className={chip(!activeWsId)}>
      <Lock size={12} /> {personalLabel}
    </button>
    {workspaces.map((ws) => (
      <button type="button" key={ws.id} onClick={() => onSelect(ws.id)} className={chip(activeWsId === ws.id)} title={ws.name}>
        <Users size={12} /> <span className="max-w-[140px] truncate">{ws.name}</span>
      </button>
    ))}
    <button
      type="button"
      onClick={onShareNew}
      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-full border border-dashed dark:border-gray-700 border-gray-300 text-gray-400 hover:text-blue-400 hover:border-blue-400 transition-colors"
    >
      <Share2 size={12} /> Share / New
    </button>
  </div>
);

export const WorkspaceBanner: React.FC<{
  workspace: Workspace;
  isOwner: boolean;
  onCopyLink: () => void;
  onMembers: () => void;
  onDelete: () => void;
}> = ({ workspace, isOwner, onCopyLink, onMembers, onDelete }) => (
  <div className="mb-5 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
        <Share2 size={16} className="text-blue-400" />
      </div>
      <div>
        <p className="text-sm font-semibold dark:text-white text-gray-900 flex items-center gap-2">
          {workspace.name}
          {isOwner && <span className="text-[11px] text-amber-400 inline-flex items-center gap-1"><Crown size={11} /> owner</span>}
          <span className="text-[11px] text-emerald-400 inline-flex items-center gap-1"><Globe size={11} /> live</span>
        </p>
        <p className="text-xs text-gray-500">
          {workspace.memberEmails.length} member{workspace.memberEmails.length !== 1 ? 's' : ''} · everyone can edit
        </p>
      </div>
    </div>
    <div className="flex items-center gap-2">
      <button type="button" onClick={onCopyLink} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">
        <Link2 size={13} /> Copy link
      </button>
      <button type="button" onClick={onMembers} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700">
        <Users size={13} /> Members
      </button>
      {isOwner && (
        <button type="button" onClick={onDelete} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-red-400 hover:bg-red-500/10">
          <Trash2 size={13} /> Delete
        </button>
      )}
    </div>
  </div>
);

export const NewWorkspaceModal: React.FC<{
  supported: boolean;
  seedCount: number;
  seedNoun: string; // "project" / "application"
  onCancel: () => void;
  onCreate: (name: string, emails: string[], seed: boolean) => Promise<void>;
}> = ({ supported, seedCount, seedNoun, onCancel, onCreate }) => {
  const [name, setName] = useState('');
  const [emails, setEmails] = useState<string[]>([]);
  const [seed, setSeed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && !emails.includes(e)) setEmails([...emails, e]);
  };
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim(), emails, seed);
    } catch (e: any) {
      setError(e?.message || 'Could not create workspace');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-xl font-bold dark:text-white text-gray-900 flex items-center gap-2"><Share2 size={18} className="text-blue-400" /> Share a workspace</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white" aria-label="Close"><X size={22} /></button>
        </div>

        {!supported ? (
          <div className="text-sm text-gray-400 space-y-4">
            <p>Sign in with an email or Google account to create a shared workspace others can join and collaborate in.</p>
            <button type="button" onClick={onCancel} className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg font-medium">Got it</button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Workspace name</label>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q3 Initiatives" autoFocus />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Invite by email (optional)</label>
              {emails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {emails.map((e) => (
                    <span key={e} className="text-xs px-2 py-1 rounded-full bg-blue-500/15 text-blue-400 flex items-center gap-1">
                      <Mail size={10} /> {e}
                      <button type="button" onClick={() => setEmails(emails.filter((x) => x !== e))} className="hover:text-white" aria-label="Remove"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              <input
                className={inputClass}
                placeholder="name@example.com — press Enter"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
              <p className="text-xs text-gray-500 mt-1">They'll see this workspace next time they open ClearMind signed in with that email — or share the invite link after creating.</p>
            </div>
            <label className="flex items-center gap-2 text-sm dark:text-gray-300 text-gray-700 cursor-pointer">
              <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} className="accent-blue-600" />
              Copy my {seedCount} current {seedNoun}{seedCount !== 1 ? 's' : ''} into it
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={submit} disabled={!name.trim() || busy} className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2">
                <Share2 size={16} /> {busy ? 'Creating…' : 'Create & share'}
              </button>
              <button type="button" onClick={onCancel} className="px-4 py-3 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MembersModal: React.FC<{
  workspace: Workspace;
  isOwner: boolean;
  currentEmail: string | null;
  onCancel: () => void;
  onSave: (emails: string[]) => Promise<void>;
}> = ({ workspace, isOwner, currentEmail, onCancel, onSave }) => {
  const [invitees, setInvitees] = useState<string[]>(workspace.memberEmails.filter((e) => e !== workspace.ownerEmail));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase();
    if (e && EMAIL_RE.test(e) && e !== workspace.ownerEmail && !invitees.includes(e)) setInvitees([...invitees, e]);
  };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(invitees);
      onCancel();
    } catch (e: any) {
      setError(e?.message || 'Could not update members');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-xl p-6 w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold dark:text-white text-gray-900 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Members</h3>
          <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 dark:hover:text-white" aria-label="Close"><X size={22} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">{workspace.name} · everyone listed can view and edit everything in it.</p>

        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm dark:text-white text-gray-900 px-3 py-2 rounded-lg dark:bg-gray-800/60 bg-gray-100">
            <span className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {workspace.ownerEmail}</span>
            <span className="text-[11px] text-amber-400 inline-flex items-center gap-1"><Crown size={11} /> owner{currentEmail === workspace.ownerEmail ? ' · you' : ''}</span>
          </div>
          {invitees.map((e) => (
            <div key={e} className="flex items-center justify-between text-sm dark:text-white text-gray-900 px-3 py-2 rounded-lg dark:bg-gray-800/40 bg-gray-50">
              <span className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {e}{currentEmail === e ? ' · you' : ''}</span>
              {isOwner && (
                <button type="button" onClick={() => setInvitees(invitees.filter((x) => x !== e))} className="text-gray-400 hover:text-red-500" aria-label="Remove"><X size={14} /></button>
              )}
            </div>
          ))}
        </div>

        {isOwner ? (
          <>
            <div className="flex items-center gap-2 mb-4">
              <UserPlus size={15} className="text-gray-400" />
              <input
                className={`${inputClass} py-2`}
                placeholder="Invite by email — press Enter"
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ',') {
                    ev.preventDefault();
                    addEmail((ev.target as HTMLInputElement).value);
                    (ev.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={save} disabled={busy} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium">{busy ? 'Saving…' : 'Save members'}</button>
              <button type="button" onClick={onCancel} className="px-4 py-2.5 dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Cancel</button>
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Only the owner can change who's in this workspace.</p>
            <button type="button" onClick={onCancel} className="w-full dark:bg-gray-800 bg-gray-200 dark:text-white text-gray-900 px-4 py-2.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700">Close</button>
          </div>
        )}
      </div>
    </div>
  );
};
