import React, { useState } from 'react';
import { Application } from '../../types';
import { dbService, STORES } from '../../services/db';
import { reviewApplication, isApiConfigured, ApplicationReview } from '../../services/geminiService';
import {
  ScanSearch, Link2, Sparkles, Loader2, ExternalLink, Building2, GraduationCap, Briefcase,
  Award, FileText, CircleDollarSign, Hash, Calendar, ListChecks, ClipboardList, Tag as TagIcon,
  Check, CircleCheck, CircleAlert, CircleX, HelpCircle, Plus, ChevronDown, ChevronRight, ArrowRight,
} from 'lucide-react';
import { PageShell, Card, Empty, Badge, inputCls, cx, useTaskToast } from '../ui-kit';

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
  const showToast = useTaskToast();

  const configured = isApiConfigured();

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

  return (
    <PageShell
      title="AI Application Reviewer"
      subtitle="Paste a grant, scholarship, or job link — get a full brief, eligibility read, and the real submission link."
    >
      {!configured && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-amber-700 dark:text-amber-400 text-sm flex items-center gap-2" role="status">
          <CircleAlert size={16} className="shrink-0" /> The AI reviewer needs a Gemini API key configured for this deployment.
        </div>
      )}

      {/* Input */}
      <Card>
        <div className="space-y-3">
          <label className="block">
            <span className="sr-only">Opportunity link</span>
            <span className="relative block">
              <Link2 size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${cx.faint}`} aria-hidden />
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !loading) run(); }}
                placeholder="https://example.org/grants/climate-fellowship-2026"
                className={`${inputCls} pl-9`}
                disabled={loading}
                aria-label="Opportunity link"
              />
            </span>
          </label>

          <button type="button" onClick={() => setShowBg((v) => !v)} aria-expanded={showBg} className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
            {showBg ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Your background (for an eligibility check)
          </button>
          {showBg && (
            <textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              placeholder="e.g. 2nd-year PhD in renewable energy, Nigerian citizen, based in the UK, focus on solar microgrids…"
              rows={3}
              aria-label="Your background"
              className={`${inputCls} resize-none`}
            />
          )}

          <div className="flex items-center justify-end gap-3">
            {loading && <p className={`text-xs flex-1 ${cx.muted}`}>Reading the page, finding the submission link, and checking eligibility — this can take ~15s.</p>}
            <button
              type="button"
              onClick={run}
              disabled={loading || !url.trim() || !configured}
              className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {loading ? 'Reviewing…' : 'Review application'}
            </button>
          </div>
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </div>
      </Card>

      {/* Result */}
      {review ? renderReview(review) : !loading && !error ? (
        <Empty
          icon={<ScanSearch size={30} className={cx.muted} />}
          title="Review an opportunity"
          subtitle="Paste a link above. You can add the result straight to your Applications with a deadline reminder."
        />
      ) : null}
    </PageShell>
  );

  function renderReview(r: ApplicationReview) {
    const TypeIcon = TYPE_ICON[r.type] ?? FileText;
    const v = VERDICT[r.eligibilityVerdict];
    return (
      <Card className="mt-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className={`flex items-center gap-1.5 ${cx.muted}`}>
            <TypeIcon size={16} />
            <span className="text-xs font-medium capitalize">{r.type}</span>
          </div>
          <Badge color={v.color}><v.Icon size={12} /> {v.label}</Badge>
        </div>

        <h2 className={`text-lg font-semibold ${cx.text}`}>{r.name}</h2>
        {r.organization && <p className={`text-sm mt-0.5 flex items-center gap-1 ${cx.muted}`}><Building2 size={14} /> {r.organization}{r.funder && r.funder !== r.organization ? ` · funded by ${r.funder}` : ''}</p>}

        {r.eligibilityReasoning && (
          <div className="mt-3 rounded-lg p-3 text-sm" style={{ backgroundColor: `${v.color}14`, color: v.color }}>
            {r.eligibilityReasoning}
          </div>
        )}

        <p className="text-sm text-gray-700 dark:text-gray-300 mt-4 leading-relaxed whitespace-pre-line">{r.summary}</p>

        {/* Key facts */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-5">
          {r.submissionDeadline && <Fact icon={<Calendar size={14} />} label="Deadline" value={fmtDate(r.submissionDeadline)!} highlight />}
          {r.closingDate && !r.submissionDeadline && <Fact icon={<Calendar size={14} />} label="Closes" value={fmtDate(r.closingDate)!} highlight />}
          {r.openingDate && <Fact icon={<Calendar size={14} />} label="Opens" value={fmtDate(r.openingDate)!} />}
          {r.awardAmount && <Fact icon={<CircleDollarSign size={14} />} label="Award" value={r.awardAmount} />}
          {r.referenceNumber && <Fact icon={<Hash size={14} />} label="Reference" value={r.referenceNumber} />}
        </div>

        {r.eligibility.length > 0 && <Section title="Eligibility" icon={<ListChecks size={16} />} items={r.eligibility} />}
        {r.requirements.length > 0 && <Section title="What you need to submit" icon={<ClipboardList size={16} />} items={r.requirements} />}

        {r.tags && r.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {r.tags.map((t) => <Badge key={t}><TagIcon size={11} />{t}</Badge>)}
          </div>
        )}

        <div className={`flex flex-wrap items-center gap-2 mt-5 pt-4 border-t ${cx.border}`}>
          <a href={r.submissionLink || r.sourceUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 ${cx.btnPrimary}`}>
            <ExternalLink size={16} /> Open submission page
          </a>
          <button
            type="button"
            onClick={addToApplications}
            disabled={added}
            className={`inline-flex items-center gap-1.5 ${cx.btnGhost} disabled:opacity-60`}
          >
            {added ? <><Check size={16} className="text-green-600" /> Added to Applications</> : <><Plus size={16} /> Add to my Applications</>}
          </button>
          {added && (
            <button type="button" onClick={() => { window.location.hash = 'applications'; }} className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline">
              View in Applications <ArrowRight size={14} />
            </button>
          )}
        </div>
        {r.sourceUrl !== (r.submissionLink || r.sourceUrl) && (
          <p className={`text-xs mt-3 ${cx.muted}`}>Reviewed from: <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-300">{r.sourceUrl}</a></p>
        )}
      </Card>
    );
  }
};

const Fact: React.FC<{ icon: React.ReactNode; label: string; value: string; highlight?: boolean }> = ({ icon, label, value, highlight }) => (
  <div className={`rounded-lg p-3 border ${highlight ? 'border-orange-500/30 bg-orange-50 dark:bg-orange-500/5' : `${cx.border}`}`}>
    <div className={`flex items-center gap-1 text-xs mb-1 ${highlight ? 'text-orange-600 dark:text-orange-400' : cx.muted}`}>{icon} {label}</div>
    <div className={`text-sm font-medium ${cx.text}`}>{value}</div>
  </div>
);

const Section: React.FC<{ title: string; icon: React.ReactNode; items: string[] }> = ({ title, icon, items }) => (
  <div className="mt-5">
    <h3 className={`text-sm font-semibold flex items-center gap-2 mb-2 ${cx.text}`}><span className={cx.muted}>{icon}</span> {title}</h3>
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  </div>
);

export default ApplicationReviewerView;
