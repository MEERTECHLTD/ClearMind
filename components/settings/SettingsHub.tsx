/**
 * Web Settings — the same areas and the same synced preferences as mobile:
 * Account · General · Appearance · Productivity · Notifications ·
 * Integrations & AI agents · Security · Data & privacy.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, SlidersHorizontal, Palette, Flame, Bell, Bot, ShieldCheck, Database, LogOut, Camera, Trash2, KeyRound, Copy, Check,
  RefreshCw, Download, CloudOff, Cloud, AlertTriangle, Plus, ShieldAlert, CheckCircle2, XCircle, Monitor, Sun, Moon,
} from 'lucide-react';
import { sendPasswordResetEmail, deleteUser, updateProfile } from 'firebase/auth';
import type { UserProfile, Preferences, AgentScope, AgentToken, AgentAudit, Project } from '../../types';
import { resolvePreferences, NAV_DESTINATIONS } from '../../shared/domain';
import { SCOPES, SCOPE_PRESETS } from '../../shared/agents/tokens';
import { createAgentToken, revokeAgentToken, revokeAllAgentTokens, subscribeAgentTokens, subscribeAgentAudit, connectionSnippets } from '../../shared/data/agentTokens';
import { deleteAccountData, updateProfileDoc } from '../../shared/data/account';
import { deviceTimeZone } from '../../shared/tasks/time';
import { WEEKDAY_SHORT } from '../../shared/tasks';
import { auth, db, isFirebaseConfigured } from '../../services/firebase';
import { dbService, STORES, getSyncableStores, getFirestoreCollectionName } from '../../services/db';
import { syncNow, onSyncStatus, stopSync } from '../../services/syncEngine';
import { applyTheme, type ThemePref } from '../../services/theme';
import { useStore } from '../tasks/store';
import { savePreferences } from '../tasks/actions';
import { cx, Modal, useTaskToast } from '../tasks/ui';
import { Avatar } from '../Avatar';

type Section = 'account' | 'general' | 'appearance' | 'productivity' | 'notifications' | 'integrations' | 'security' | 'data';
const NAV: { id: Section; label: string; icon: React.ReactNode }[] = [
  { id: 'account', label: 'Account', icon: <User size={17} /> },
  { id: 'general', label: 'General', icon: <SlidersHorizontal size={17} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={17} /> },
  { id: 'productivity', label: 'Productivity', icon: <Flame size={17} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={17} /> },
  { id: 'integrations', label: 'Integrations & AI', icon: <Bot size={17} /> },
  { id: 'security', label: 'Security', icon: <ShieldCheck size={17} /> },
  { id: 'data', label: 'Data & privacy', icon: <Database size={17} /> },
];

// ------------------------------------------------------------------ primitives

function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      {title ? <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${cx.muted}`}>{title}</h3> : null}
      <div className={`rounded-xl border ${cx.border} ${cx.card} divide-y divide-gray-200 dark:divide-gray-800`}>{children}</div>
      {footer ? <p className={`text-xs mt-2 ${cx.muted}`}>{footer}</p> : null}
    </section>
  );
}

function Row({ label, detail, children }: { label: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 min-h-[52px]">
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${cx.text}`}>{label}</p>
        {detail ? <p className={`text-xs mt-0.5 ${cx.muted}`}>{detail}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-colors ${value ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function Select<V extends string | number | null>({ value, options, onChange, label }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; label: string }) {
  return (
    <select aria-label={label} value={String(value)} onChange={(e) => onChange(options.find((o) => String(o.value) === e.target.value)!.value)} className={`${cx.input} py-1.5 max-w-[240px]`}>
      {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
    </select>
  );
}

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

const webCrypto = {
  sha256: async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''),
  randomBytes: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
};

/** Square-crop and compress an image file to a small JPEG data URL. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const side = Math.min(img.width, img.height);
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
    return c.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(url); }
}

// ------------------------------------------------------------------ hub

export default function SettingsHub({ user, onUpdateUser, onLogout, onAccountDeleted }: { user: UserProfile | null; onUpdateUser: (u: UserProfile) => void; onLogout: () => void; onAccountDeleted?: () => void }) {
  const [section, setSection] = useState<Section>(() => (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('s') as Section) || 'account');
  const prefsSnap = useStore<Preferences>(STORES.PREFERENCES);
  const projects = useStore<Project>(STORES.PROJECTS).items;
  const prefs = resolvePreferences(prefsSnap.items[0]);
  const set = (patch: Partial<Preferences>) => savePreferences(patch);
  const toast = useTaskToast();
  const cloud = isFirebaseConfigured() && !!auth?.currentUser;
  // Follow #settings?s=<section> links while already on Settings.
  useEffect(() => {
    const onHash = () => { const s = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('s') as Section | null; if (s && NAV.some((n) => n.id === s)) setSection(s); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-white dark:bg-[#05050A]">
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-6 flex flex-col md:flex-row gap-6">
        <nav className="md:w-56 shrink-0" aria-label="Settings sections">
          <h1 className={`text-2xl font-bold mb-4 ${cx.text}`}>Settings</h1>
          <ul className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {NAV.map((n) => (
              <li key={n.id}>
                <button onClick={() => setSection(n.id)} aria-current={section === n.id ? 'page' : undefined}
                  className={`w-full whitespace-nowrap flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm ${section === n.id ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold' : `${cx.muted} ${cx.hover}`}`}>
                  {n.icon}{n.label}
                </button>
              </li>
            ))}
            <li className="md:mt-4">
              <button onClick={onLogout} className={`w-full whitespace-nowrap flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-red-500 ${cx.hover}`}><LogOut size={17} />Sign out</button>
            </li>
          </ul>
        </nav>
        <main className="flex-1 min-w-0 md:pt-12">
          {section === 'account' ? <AccountSection user={user} onUpdateUser={onUpdateUser} toast={toast} cloud={cloud} /> : null}
          {section === 'general' ? (
            <>
              <Group title="Start">
                <Row label="Home view" detail="Where ClearMind opens">
                  <Select label="Home view" value={prefs.homeView} onChange={(v) => set({ homeView: v as any })} options={[
                    ...NAV_DESTINATIONS.filter((d) => d.id !== 'productivity').map((d) => ({ value: d.id as string, label: d.label })),
                    ...projects.filter((p) => !p.archived && !p.deleted).slice(0, 30).map((p) => ({ value: `project:${p.id}`, label: `# ${p.title}` })),
                  ]} />
                </Row>
              </Group>
              <Group title="Dates & time" footer="Smart date recognition turns “tomorrow 4pm” or “every Monday” into due dates as you type.">
                <Row label="Smart date recognition"><Toggle label="Smart date recognition" value={prefs.smartDates} onChange={(v) => set({ smartDates: v })} /></Row>
                <Row label="Start week on"><Select label="Start week on" value={prefs.weekStart} onChange={(v) => set({ weekStart: v as 0 | 1 | 6 })} options={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }, { value: 6, label: 'Saturday' }]} /></Row>
                <Row label="“Next week” means"><Select label="Next week" value={prefs.nextWeek} onChange={(v) => set({ nextWeek: v })} options={[{ value: 'monday', label: 'Next Monday' }, { value: 'plus7', label: '7 days from today' }]} /></Row>
                <Row label="“Weekend” means"><Select label="Weekend" value={prefs.weekend} onChange={(v) => set({ weekend: v })} options={[{ value: 'saturday', label: 'Saturday' }, { value: 'sunday', label: 'Sunday' }]} /></Row>
                <Row label="Time zone" detail={`Device: ${deviceTimeZone()}`}>
                  <Select label="Time zone" value={prefs.timezone ?? null} onChange={(v) => set({ timezone: v })} options={[{ value: null, label: 'Automatic' }, ...['Africa/Lagos', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney', 'UTC'].map((z) => ({ value: z, label: z }))]} />
                </Row>
              </Group>
              <Group title="Quick Add">
                <Row label="Parse natural language" detail="Dates, repeats, p1–p4, #project, @label, !30m reminders"><Toggle label="Parse natural language" value={prefs.quickAddParse} onChange={(v) => set({ quickAddParse: v })} /></Row>
                <Row label="Default project"><Select label="Default project" value={prefs.quickAddProjectId ?? null} onChange={(v) => set({ quickAddProjectId: v })} options={[{ value: null, label: 'Inbox' }, ...projects.filter((p) => !p.archived && !p.deleted).map((p) => ({ value: p.id, label: p.title }))]} /></Row>
                <Row label="Default priority"><Select label="Default priority" value={prefs.quickAddPriority} onChange={(v) => set({ quickAddPriority: v })} options={[{ value: 'None', label: 'P4' }, { value: 'Low', label: 'P3' }, { value: 'Medium', label: 'P2' }, { value: 'High', label: 'P1' }]} /></Row>
              </Group>
            </>
          ) : null}
          {section === 'appearance' ? (
            <Group title="Theme" footer="Follows every device where you’re signed in.">
              <div className="grid grid-cols-3 gap-3 p-4">
                {([['system', 'System', <Monitor key="m" size={20} />], ['light', 'Light', <Sun key="s" size={20} />], ['dark', 'Dark', <Moon key="d" size={20} />]] as [ThemePref, string, React.ReactNode][]).map(([v, label, icon]) => (
                  <button key={v} role="radio" aria-checked={prefs.theme === v} onClick={() => { applyTheme(v); set({ theme: v }); }}
                    className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 ${prefs.theme === v ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10' : `${cx.border} ${cx.hover}`} ${cx.text}`}>
                    {icon}<span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            </Group>
          ) : null}
          {section === 'productivity' ? (
            <>
              <Group title="Goals" footer="Meeting your daily goal builds your streak and Momentum score.">
                <Row label="Daily goal"><Select label="Daily goal" value={prefs.dailyGoal} onChange={(v) => set({ dailyGoal: v })} options={[1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => ({ value: n, label: String(n) }))} /></Row>
                <Row label="Weekly goal"><Select label="Weekly goal" value={prefs.weeklyGoal} onChange={(v) => set({ weeklyGoal: v })} options={[5, 10, 15, 20, 25, 30, 40, 50, 75, 100].map((n) => ({ value: n, label: String(n) }))} /></Row>
                <Row label="Vacation mode" detail="Pauses streaks"><Toggle label="Vacation mode" value={prefs.vacation} onChange={(v) => set({ vacation: v })} /></Row>
              </Group>
              <Group title="Days off" footer="Days off never break your streak.">
                <div className="flex gap-2 p-4 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                    const off = prefs.daysOff.includes(d);
                    return <button key={d} role="checkbox" aria-checked={off} onClick={() => set({ daysOff: off ? prefs.daysOff.filter((x) => x !== d) : [...prefs.daysOff, d] })}
                      className={`w-12 h-10 rounded-lg text-sm font-medium border ${off ? 'bg-blue-600 text-white border-blue-600' : `${cx.border} ${cx.text} ${cx.hover}`}`}>{WEEKDAY_SHORT[d]}</button>;
                  })}
                </div>
              </Group>
            </>
          ) : null}
          {section === 'notifications' ? <NotificationsSection prefs={prefs} set={set} /> : null}
          {section === 'integrations' ? <IntegrationsSection cloud={cloud} toast={toast} /> : null}
          {section === 'security' ? <SecuritySection cloud={cloud} toast={toast} /> : null}
          {section === 'data' ? <DataSection cloud={cloud} toast={toast} onDeleted={onAccountDeleted ?? onLogout} /> : null}
        </main>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ account

function AccountSection({ user, onUpdateUser, toast, cloud }: { user: UserProfile | null; onUpdateUser: (u: UserProfile) => void; toast: ReturnType<typeof useTaskToast>; cloud: boolean }) {
  const [name, setName] = useState(user?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const fb = auth?.currentUser;
  const saveProfile = async (patch: Partial<UserProfile>) => {
    if (!user) return;
    const next = { ...user, ...patch };
    await dbService.put(STORES.PROFILE, next);
    onUpdateUser(next);
    if (cloud && fb) await updateProfileDoc(db, fb.uid, { nickname: next.nickname, photoURL: next.photoURL ?? null });
  };
  return (
    <>
      <Group title="Profile">
        <div className="flex items-center gap-4 p-4">
          <Avatar nickname={user?.nickname ?? ''} photoURL={user?.photoURL} email={user?.email} size={64} />
          <div className="flex gap-2 flex-wrap">
            <button className={cx.btnGhost} onClick={() => file.current?.click()} disabled={busy}><span className="inline-flex items-center gap-1.5"><Camera size={15} />{user?.photoURL ? 'Change photo' : 'Upload photo'}</span></button>
            {user?.photoURL ? <button className={cx.btnGhost} onClick={async () => { await saveProfile({ photoURL: undefined }); toast('Photo removed'); }}><span className="inline-flex items-center gap-1.5"><Trash2 size={15} />Remove</span></button> : null}
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              setBusy(true);
              try { await saveProfile({ photoURL: await toAvatarDataUrl(f) }); toast('Photo updated'); } catch { toast('Couldn’t use that image'); } finally { setBusy(false); }
            }} />
          </div>
        </div>
        <Row label="Name">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className={`${cx.input} w-48`} aria-label="Name" />
            <button className={cx.btnPrimary} disabled={!name.trim() || name === user?.nickname} onClick={async () => { await saveProfile({ nickname: name.trim() }); if (fb) await updateProfile(fb, { displayName: name.trim() }).catch(() => {}); toast('Name updated'); }}>Save</button>
          </div>
        </Row>
        <Row label="Email" detail={user?.email ?? (cloud ? 'Guest account' : 'Local workspace (not synced)')} />
      </Group>
      {fb?.providerData.some((p) => p.providerId === 'password') && fb.email ? (
        <Group title="Password">
          <Row label="Change password" detail="We’ll email you a secure link">
            <button className={cx.btnGhost} onClick={async () => { try { await sendPasswordResetEmail(auth, fb.email!); toast('Reset link sent'); } catch (e: any) { toast(e?.message ?? 'Couldn’t send'); } }}><span className="inline-flex items-center gap-1.5"><KeyRound size={15} />Send link</span></button>
          </Row>
        </Group>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ notifications (browser)

function NotificationsSection({ prefs, set }: { prefs: ReturnType<typeof resolvePreferences>; set: (p: Partial<Preferences>) => void }) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const times = ['06:00', '07:00', '08:00', '09:00', '10:00', '18:00', '20:00', '21:00', '22:00'];
  return (
    <>
      {perm !== 'granted' ? (
        <div className={`rounded-xl border ${cx.border} ${cx.card} p-4 mb-6`}>
          <p className={`font-semibold ${cx.text}`}>{perm === 'denied' ? 'Notifications are blocked in this browser' : 'Get reminders in this browser'}</p>
          <p className={`text-sm mt-1 ${cx.muted}`}>{perm === 'denied' ? 'Allow notifications for this site in your browser settings to receive reminders here. Mobile reminders work independently.' : 'Task reminders and your daily plan appear while ClearMind is open in a tab.'}</p>
          {perm !== 'denied' ? <button className={`${cx.btnPrimary} mt-3`} onClick={async () => setPerm(await Notification.requestPermission())}>Turn on notifications</button> : null}
        </div>
      ) : null}
      <Group title="Task reminders" footer="These settings also control reminders on your phone.">
        <Row label="Task reminders"><Toggle label="Task reminders" value={prefs.notifyReminders} onChange={(v) => set({ notifyReminders: v })} /></Row>
        <Row label="Default reminder">
          <Select label="Default reminder" value={prefs.defaultReminder ?? null} onChange={(v) => set({ defaultReminder: v })} options={[{ value: null, label: 'None' }, { value: 0, label: 'At due time' }, { value: 10, label: '10 min before' }, { value: 30, label: '30 min before' }, { value: 60, label: '1 hour before' }, { value: 1440, label: '1 day before' }]} />
        </Row>
      </Group>
      <Group title="Planning & summaries">
        <Row label="Daily plan"><Toggle label="Daily plan" value={prefs.notifyOverdue} onChange={(v) => set({ notifyOverdue: v })} /></Row>
        <Row label="Daily plan time"><Select label="Daily plan time" value={prefs.dailyPlanAt ?? null} onChange={(v) => set({ dailyPlanAt: v })} options={[{ value: null, label: 'Off' }, ...times.map((t) => ({ value: t, label: t }))]} /></Row>
        <Row label="Weekly summary"><Toggle label="Weekly summary" value={prefs.weeklySummary} onChange={(v) => set({ weeklySummary: v })} /></Row>
      </Group>
      <Group title="Quiet hours">
        <Row label="Start"><Select label="Quiet start" value={prefs.quietStart ?? null} onChange={(v) => set({ quietStart: v })} options={[{ value: null, label: 'Off' }, ...['20:00', '21:00', '22:00', '23:00'].map((t) => ({ value: t, label: t }))]} /></Row>
        <Row label="End"><Select label="Quiet end" value={prefs.quietEnd ?? null} onChange={(v) => set({ quietEnd: v })} options={[{ value: null, label: 'Off' }, ...['06:00', '07:00', '08:00', '09:00'].map((t) => ({ value: t, label: t }))]} /></Row>
      </Group>
    </>
  );
}

// ------------------------------------------------------------------ integrations

function Snippet({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-semibold ${cx.text}`}>{title}</span>
        <button className="text-blue-600 dark:text-blue-400 text-xs inline-flex items-center gap-1" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="text-xs whitespace-pre-wrap break-all p-2.5 rounded-lg bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300">{text}</pre>
    </div>
  );
}

function IntegrationsSection({ cloud, toast }: { cloud: boolean; toast: ReturnType<typeof useTaskToast> }) {
  const uid = auth?.currentUser?.uid;
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  const [audit, setAudit] = useState<AgentAudit[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('Claude Code');
  const [scopes, setScopes] = useState<AgentScope[]>(SCOPE_PRESETS[1].scopes);
  const [issued, setIssued] = useState<string | null>(null);
  useEffect(() => {
    if (!uid) return;
    const a = subscribeAgentTokens(db, uid, setTokens);
    const b = subscribeAgentAudit(db, uid, setAudit, 30);
    return () => { a(); b(); };
  }, [uid]);
  const snippets = useMemo(() => (issued ? connectionSnippets(issued) : null), [issued]);
  if (!cloud || !uid) return <Group title="Integrations"><Row label="Sign in with a cloud account to connect AI agents." /></Group>;
  const active = tokens.filter((t) => !t.revoked);
  return (
    <>
      <p className={`text-sm mb-5 ${cx.muted}`}>Connect Claude Code, Codex or any MCP-compatible agent (or use the REST API / CLI). Each connection gets its own token with only the permissions you choose; every action is logged and you can revoke access any time.</p>
      <Group title="Connected agents">
        {active.map((t) => (
          <Row key={t.id} label={t.name} detail={`${t.prefix} · ${t.scopes.length} permissions · last used ${ago(t.lastUsedAt)} · ${t.rateLimit ?? 60}/min`}>
            <button className="text-sm text-red-500 hover:underline" onClick={async () => { if (confirm(`Revoke “${t.name}”? It loses access immediately.`)) { await revokeAgentToken(db, uid, t.id); toast('Access revoked'); } }}>Revoke</button>
          </Row>
        ))}
        <Row label={active.length ? 'Connect another agent' : 'No agents connected yet'}>
          <button className={cx.btnPrimary} onClick={() => { setName('Claude Code'); setScopes(SCOPE_PRESETS[1].scopes); setCreating(true); }}><span className="inline-flex items-center gap-1.5"><Plus size={15} />Connect</span></button>
        </Row>
      </Group>
      {audit.length ? (
        <Group title="Recent agent activity">
          {audit.slice(0, 15).map((a) => (
            <Row key={a.id} label={`${a.agent} · ${a.tool.replace(/_/g, ' ')}`} detail={`${a.summary ?? a.error ?? ''} · ${ago(a.at)} · ${a.source}`}>
              {a.ok ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
            </Row>
          ))}
        </Group>
      ) : null}
      <Group title="Endpoints" footer="Tokens and permissions are shared by MCP, REST and the CLI.">
        <Row label="MCP (Streamable HTTP)" detail="https://clearmind.meertech.tech/api/mcp" />
        <Row label="REST API" detail="POST https://clearmind.meertech.tech/api/v1/tools/<tool>" />
        <Row label="CLI" detail="clearmind add “Call Ahmed tomorrow 9am p1”" />
      </Group>

      <Modal open={creating} onClose={() => setCreating(false)} title="Connect an agent">
        <div className="p-5 space-y-4 overflow-y-auto">
          <label className="block"><span className={`text-xs font-semibold ${cx.muted}`}>Name</span><input value={name} onChange={(e) => setName(e.target.value)} className={`${cx.input} w-full mt-1`} /></label>
          <div className="flex flex-wrap gap-2">
            {SCOPE_PRESETS.map((p) => {
              const on = p.scopes.length === scopes.length && p.scopes.every((s) => scopes.includes(s));
              return <button key={p.id} onClick={() => setScopes(p.scopes)} className={`px-3 py-1.5 rounded-full text-sm border ${on ? 'bg-blue-600 text-white border-blue-600' : `${cx.border} ${cx.text}`}`}>{p.label}</button>;
            })}
          </div>
          <div className="space-y-1">
            {SCOPES.map((s) => (
              <label key={s.scope} className={`flex items-start gap-3 py-1.5 ${cx.text}`}>
                <input type="checkbox" className="mt-1" checked={scopes.includes(s.scope)} onChange={(e) => setScopes(e.target.checked ? [...scopes, s.scope] : scopes.filter((x) => x !== s.scope))} />
                <span><span className="text-sm">{s.label}{s.risky ? ' ⚠︎' : ''}</span><span className={`block text-xs ${cx.muted}`}>{s.detail}</span></span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button className={cx.btnGhost} onClick={() => setCreating(false)}>Cancel</button>
            <button className={cx.btnPrimary} disabled={!name.trim() || !scopes.length} onClick={async () => {
              try { const r = await createAgentToken(db, uid, { name, scopes }, webCrypto); setCreating(false); setIssued(r.token); }
              catch (e: any) { toast(e?.message ?? 'Couldn’t create token'); }
            }}>Create token</button>
          </div>
        </div>
      </Modal>
      <Modal open={!!issued} onClose={() => setIssued(null)} title="Your new token" wide>
        <div className="p-5 overflow-y-auto">
          <div className="flex gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300"><ShieldAlert size={18} className="shrink-0" />Copy it now — it won’t be shown again. Anyone with it can act with the permissions you chose.</div>
          {issued ? <Snippet title="Token" text={issued} /> : null}
          {snippets ? <>
            <Snippet title="Claude Code (hosted MCP)" text={snippets.claudeCodeHttp} />
            <Snippet title="Claude Code (local MCP)" text={snippets.claudeCodeLocal} />
            <Snippet title="Codex (~/.codex/config.toml)" text={snippets.codexToml} />
            <Snippet title="CLI" text={snippets.cli} />
            <Snippet title="REST (curl)" text={snippets.curl} />
          </> : null}
        </div>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ security

function SecuritySection({ cloud, toast }: { cloud: boolean; toast: ReturnType<typeof useTaskToast> }) {
  const fb = auth?.currentUser;
  const [tokens, setTokens] = useState<AgentToken[]>([]);
  useEffect(() => (fb ? subscribeAgentTokens(db, fb.uid, setTokens) : undefined), [fb]);
  if (!cloud || !fb) return <Group title="Security"><Row label="Local workspace — data stays in this browser." /></Group>;
  const active = tokens.filter((t) => !t.revoked);
  return (
    <>
      <Group title="Sign-in">
        <Row label="Method" detail={fb.isAnonymous ? 'Guest' : fb.providerData.map((p) => (p.providerId === 'password' ? 'Email & password' : p.providerId === 'google.com' ? 'Google' : p.providerId)).join(', ')} />
        <Row label="Last sign-in" detail={fb.metadata.lastSignInTime ?? '—'} />
        <Row label="Account created" detail={fb.metadata.creationTime ?? '—'} />
      </Group>
      <Group title="AI agent access" footer="Revoking takes effect on the agent’s next request.">
        <Row label="Connected agents" detail={String(active.length)}>
          {active.length ? <button className="text-sm text-red-500 hover:underline" onClick={async () => { if (confirm(`Disconnect all ${active.length} agents?`)) { const n = await revokeAllAgentTokens(db, fb.uid); toast(`Revoked ${n}`); } }}>Revoke all</button> : null}
        </Row>
      </Group>
    </>
  );
}

// ------------------------------------------------------------------ data

function DataSection({ cloud, toast, onDeleted }: { cloud: boolean; toast: ReturnType<typeof useTaskToast>; onDeleted: () => void }) {
  const [status, setStatus] = useState<{ state: string; pending: number; lastSyncedAt: string | null; error: string | null }>({ state: 'idle', pending: 0, lastSyncedAt: null, error: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [progress, setProgress] = useState('');
  useEffect(() => onSyncStatus(setStatus), []);
  return (
    <>
      <Group title="Sync" footer="A full copy lives in this browser and syncs field-by-field in real time; offline changes are queued and sent when you reconnect.">
        <Row label="Status" detail={status.state === 'offline' ? 'Offline — changes saved locally' : status.state === 'error' ? `Problem: ${status.error}` : status.state === 'syncing' ? 'Syncing…' : cloud ? 'Up to date' : 'Local workspace (not synced)'}>
          {status.state === 'offline' ? <CloudOff size={18} className="text-gray-400" /> : <Cloud size={18} className="text-blue-500" />}
        </Row>
        <Row label="Waiting to upload" detail={String(status.pending)} />
        {cloud ? <Row label="Sync now" detail="Full check of every item">
          <button className={cx.btnGhost} disabled={!!busy} onClick={async () => { setBusy('sync'); try { const r = await syncNow(); toast(r.failed.length ? `Synced with ${r.failed.length} problem(s)` : `Checked ${r.pulled} items`); } finally { setBusy(null); } }}><span className="inline-flex items-center gap-1.5"><RefreshCw size={15} className={busy === 'sync' ? 'animate-spin' : ''} />Sync</span></button>
        </Row> : null}
      </Group>
      <Group title="Your data">
        <Row label="Export my data" detail="Every collection as JSON">
          <button className={cx.btnGhost} onClick={async () => {
            const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), format: 'clearmind-export-v1' };
            for (const s of getSyncableStores()) out[s] = await dbService.getAll(s);
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
            a.download = `clearmind-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
          }}><span className="inline-flex items-center gap-1.5"><Download size={15} />Export</span></button>
        </Row>
      </Group>
      {cloud ? (
        <Group title="Danger zone" footer="Deleting your account permanently removes all your data on every device, your profile, agent access and shared workspaces you own. This can’t be undone.">
          <Row label="Delete account"><button className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700" onClick={() => { setConfirmText(''); setDeleting(true); }}>Delete…</button></Row>
        </Group>
      ) : null}
      <Modal open={deleting} onClose={() => !busy && setDeleting(false)} title="Delete account">
        <div className="p-5 space-y-3">
          <p className={`text-sm flex gap-2 ${cx.muted}`}><AlertTriangle size={18} className="text-red-500 shrink-0" />This permanently deletes everything in your ClearMind account on all devices. Type DELETE to confirm.</p>
          <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className={`${cx.input} w-full`} placeholder="DELETE" aria-label="Type DELETE to confirm" />
          {progress ? <p className={`text-xs ${cx.muted}`}>{progress}</p> : null}
          <div className="flex justify-end gap-2">
            <button className={cx.btnGhost} onClick={() => setDeleting(false)} disabled={!!busy}>Cancel</button>
            <button className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-red-600 text-white disabled:opacity-40" disabled={confirmText.trim() !== 'DELETE' || !!busy} onClick={async () => {
              const fb = auth?.currentUser;
              if (!fb) return;
              setBusy('delete');
              try {
                stopSync();
                await deleteAccountData(db, fb.uid, getSyncableStores().map(getFirestoreCollectionName), setProgress);
                try { await deleteUser(fb); } catch (e: any) {
                  if (e?.code === 'auth/requires-recent-login') { alert('Your data was deleted. For security, sign in again and repeat to remove the login itself.'); }
                  else throw e;
                }
                await dbService.wipeAll();
                onDeleted();
              } catch (e: any) { toast(e?.message ?? 'Deletion failed'); } finally { setBusy(null); setProgress(''); }
            }}>Delete my account</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
