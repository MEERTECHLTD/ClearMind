import React, { useState } from 'react';
import { Application } from '../../types';
import { dbService, STORES } from '../../services/db';
import { reviewApplication, isApiConfigured, ApplicationReview } from '../../services/geminiService';
import {
  ScanSearch, Link2, Sparkles, Loader2, ExternalLink, Building2, GraduationCap, Briefcase,
  Award, FileText, CircleDollarSign, Hash, Calendar, ListChecks, ClipboardList, Tag as TagIcon,
  Check, CircleCheck, CircleAlert, CircleX, HelpCircle, Plus, ChevronDown, ChevronRight, X,
} from 'lucide-react';

const BG_KEY = 'reviewer-applicant-background';

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const TYPE_ICON: Record<ApplicationReview['type'], React.FC<{ size?: number; className?: string }>> = {
  job: Briefcase, grant: GraduationCap, scholarship: Award, other: FileText,
};

const VERDICT: Record<ApplicationReview['eligibilityVerdict'], { label: string; color: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  eligible: { label: 'Likely eligible', color: '#34d399', Icon: CircleCheck },
  maybe: { label: 'Possibly eligible', color: '#fbbf24', Icon: CircleAlert },
  ineligible: { label: 'Likely not eligible', color: '#f87171', Icon: CircleX },
  unknown: { label: 'Eligibility unclear', color: '#9ca3af', Icon: HelpCircle },
};

const fmtDate = (s?: string): string | null => {
  if (!s) return null;
  try { return new Date(s + (s.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return s; }
};

const ApplicationReviewerView: React.FC = () => {
  const [url, setUrl] = useState('');
  const [background, setBackground] = useState(() => localStorage.getItem(BG_KEY) || '');
  const [showBg, setShowBg] = useState(() => !!localStorage.getItem(BG_KEY));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ApplicationReview | null>(null);
  const [added, setAdded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const configured = isApiConfigured();

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };

  const normalizeUrl = (u: string) => {
    const t = u.trim();
    if (!t) return '';
    return /^https?:\/\//i.test(t) ? t : `https://${t}`;
  };

  const run = async () => {
    const target = normalizeUrl(url);
    if (!target) return;
    setLoading(true);
    setError(null);
    setReview(null);
    setAdded(false);
    if (background.trim()) localStorage.setItem(BG_KEY, background.trim());
    try {
      const result = await reviewApplication(target, background.trim() || undefined);
      setReview(result);
    } catch (e: any) {
      setError(e?.message || 'Could not review that link.');
    } finally {
      setLoading(false);
    }
  };

  const addToApplications = async () => {
    if (!review) return;
    const notesParts: string[] = [review.summary];
    if (review.eligibility.length) notesParts.push('\nEligibility:\n' + review.eligibility.map((e) => `• ${e}`).join('\n'));
    if (review.requirements.length) notesParts.push('\nRequirements:\n' + review.requirements.map((r) => `• ${r}`).join('\n'));
    if (review.eligibilityReasoning) notesParts.push(`\nEligibility read: ${review.eligibilityReasoning}`);
    notesParts.push(`\nSource: ${review.sourceUrl}`);

    const app: Application = {
      id: newId(),
      name: review.name,
      organization: review.organization,
      funder: review.funder,
      type: review.type,
      status: 'open',
      priority: 'Medium',
      link: review.submissionLink || review.sourceUrl,
      openingDate: review.openingDate,
      closingDate: review.closingDate,
      submissionDeadline: review.submissionDeadline,
      awardAmount: review.awardAmount,
      referenceNumber: review.referenceNumber,
      tags: review.tags && review.tags.length ? review.tags : undefined,
      notes: notesParts.join('\n'),
      reminderLeadDays: [7, 3, 1],
      createdAt: new Date().toISOString(),
    };
    try {
      await dbService.put(STORES.APPLICATIONS, app);
      setAdded(true);
      showToast('Added to your Applications · reminder armed');
    } catch {
      showToast('Could not save — check your connection');
    }
  };

  const inputClass = 'w-full dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-3 rounded-lg border dark:border-gray-700 border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-8 h-full overflow-y-auto animate-fade-in">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center">
            <ScanSearch size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold dark:text-white text-gray-900">AI Application Reviewer</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Paste a grant, scholarship, or job link — get a full brief, eligibility read, and the real submission link.</p>
          </div>
        </div>

        {!configured && (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-400 text-sm flex items-center gap-2">
            <CircleAlert size={16} /> The AI reviewer needs a Gemini API key configured for this deployment.
          </div>
        )}

        {/* Input */}
        <div className="mt-6 space-y-3">
          <div className="relative">
            <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !loading) run(); }}
              placeholder="https://example.org/grants/climate-fellowship-2026"
              className={`${inputClass} pl-9`}
              disabled={loading}
            />
          </div>

          <button type="button" onClick={() => setShowBg((v) => !v)} className="flex items-center gap-1 text-sm text-blue-500 hover:text-blue-400">
            {showBg ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Your background (for an eligibility check)
          </button>
          {showBg && (
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="e.g. 2nd-year PhD in renewable energy, Nigerian citizen, based in the UK, focus on solar microgrids…"
              rows={3}
              className={`${inputClass} resize-none`}
            />
          )}

          <button
            type="button"
            onClick={run}
            disabled={loading || !url.trim() || !configured}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {loading ? 'Reviewing the opportunity…' : 'Review application'}
          </button>
          {loading && <p className="text-xs text-gray-500 text-center">Reading the page, finding the submission link, and checking eligibility — this can take ~15s.</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* Result */}
        {review && renderReview(review)}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-xl animate-fade-in">{toast}</div>
      )}
    </div>
  );

  function renderReview(r: ApplicationReview) {
    const TypeIcon = TYPE_ICON[r.type] ?? FileText;
    const v = VERDICT[r.eligibilityVerdict];
    return (
      <div className="mt-8 dark:bg-midnight-light bg-white border dark:border-gray-800 border-gray-200 rounded-2xl p-6 shadow-sm animate-fade-in">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 text-gray-500">
            <TypeIcon size={18} />
            <span className="text-xs uppercase tracking-wider">{r.type}</span>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border" style={{ color: v.color, backgroundColor: `${v.color}22`, borderColor: `${v.color}55` }}>
            <v.Icon size={13} /> {v.label}
          </span>
        </div>

        <h3 className="text-xl font-bold dark:text-white text-gray-900">{r.name}</h3>
        {r.organization && <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1"><Building2 size={13} /> {r.organization}{r.funder && r.funder !== r.organization ? ` · funded by ${r.funder}` : ''}</p>}

        {r.eligibilityReasoning && (
          <div className="mt-3 rounded-lg p-3 text-sm" style={{ backgroundColor: `${v.color}14`, color: v.color }}>
            {r.eligibilityReasoning}
          </div>
        )}

        <p className="text-sm dark:text-gray-300 text-gray-700 mt-4 leading-relaxed whitespace-pre-line">{r.summary}</p>

        {/* Key facts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          {r.submissionDeadline && <Fact icon={<Calendar size={14} />} label="Deadline" value={fmtDate(r.submissionDeadline)!} highlight />}
          {r.closingDate && !r.submissionDeadline && <Fact icon={<Calendar size={14} />} label="Closes" value={fmtDate(r.closingDate)!} highlight />}
          {r.openingDate && <Fact icon={<Calendar size={14} />} label="Opens" value={fmtDate(r.openingDate)!} />}
          {r.awardAmount && <Fact icon={<CircleDollarSign size={14} />} label="Award" value={r.awardAmount} />}
          {r.referenceNumber && <Fact icon={<Hash size={14} />} label="Reference" value={r.referenceNumber} />}
        </div>

        {r.eligibility.length > 0 && <Section title="Eligibility" icon={<ListChecks size={15} />} items={r.eligibility} />}
        {r.requirements.length > 0 && <Section title="What you need to submit" icon={<ClipboardList size={15} />} items={r.requirements} />}

        {r.tags && r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {r.tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-gray-500/15 text-gray-400 flex items-center gap-1"><TagIcon size={10} />{t}</span>)}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mt-6">
          <a href={r.submissionLink || r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium">
            <ExternalLink size={15} /> Open submission page
          </a>
          <button
            type="button"
            onClick={addToApplications}
            disabled={added}
            className="inline-flex items-center gap-2 dark:bg-gray-800 bg-gray-100 dark:text-white text-gray-900 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-60"
          >
            {added ? <><Check size={15} className="text-emerald-500" /> Added to Applications</> : <><Plus size={15} /> Add to my Applications</>}
          </button>
          {added && (
            <button type="button" onClick={() => { window.location.hash = 'applications'; }} className="text-sm text-blue-500 hover:text-blue-400">
              View in Applications →
            </button>
          )}
        </div>
        {r.sourceUrl !== (r.submissionLink || r.sourceUrl) && (
          <p className="text-xs text-gray-500 mt-3">Reviewed from: <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-400">{r.sourceUrl}</a></p>
        )}
      </div>
    );
  }
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className={`rounded-lg p-3 border ${highlight ? 'border-orange-500/30 bg-orange-500/5' : 'dark:border-gray-800 border-gray-200'}`}>
    <div className={`flex items-center gap-1 text-xs mb-1 ${highlight ? 'text-orange-400' : 'text-gray-500'}`}>{icon} {label}</div>
    <div className="text-sm font-medium dark:text-white text-gray-900">{value}</div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; items: string[] }> = ({ title, icon, items }) => (
  <div className="mt-5">
    <h4 className="text-sm font-semibold dark:text-white text-gray-900 flex items-center gap-2 mb-2">{icon} {title}</h4>
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm dark:text-gray-300 text-gray-700">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default ApplicationReviewerView;
