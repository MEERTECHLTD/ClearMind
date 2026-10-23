/**
 * Landing page (/welcome/) behaviour. Plain DOM, no framework: the page is
 * static HTML and this only adds the mobile menu, the screenshot tabs, the
 * scroll reveals and the Quick Add demo, which runs the app's real parser
 * from @clearmind/shared, so the demo can't drift from the product.
 */
import { parseQuickAdd, type QuickAddResult } from '@clearmind/shared/tasks/quickAdd';
import { formatDueDate, formatTime } from '@clearmind/shared/tasks/dates';
import { describeRecurrence } from '@clearmind/shared/tasks/recurrence';
import './welcome.css';

// Inter, applied without an inline onload handler (CSP-friendly, same as the app).
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
const font = document.createElement('link');
font.rel = 'stylesheet';
font.href = FONT_CSS;
document.head.appendChild(font);

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T & Element>(sel);
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T & Element>(sel));

// ------------------------------------------------------------------ header + mobile menu

const header = $('[data-header]');
const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

const toggle = $<HTMLButtonElement>('[data-menu-toggle]');
const menu = $('#lp-mobile-menu');
function setMenu(open: boolean) {
  if (!toggle || !menu) return;
  toggle.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  header?.classList.toggle('is-open', open);
  if (open) $<HTMLAnchorElement>('a', menu)?.focus();
}
toggle?.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
menu?.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) setMenu(false); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && toggle?.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
});
window.matchMedia('(min-width: 900px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

// ------------------------------------------------------------------ screenshot tabs (WAI-ARIA tabs pattern)

const tabs = $$<HTMLButtonElement>('[role="tab"]');
function selectTab(tab: HTMLButtonElement, focus = false) {
  tabs.forEach((t) => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    const panel = document.getElementById(t.getAttribute('aria-controls') || '');
    if (panel) panel.hidden = !on;
  });
  if (focus) tab.focus();
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    const n = tabs.length;
    const next = e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (next >= 0) { e.preventDefault(); selectTab(tabs[next], true); }
  });
});

// ------------------------------------------------------------------ scroll reveals

const reveals = $$('[data-reveal]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reduceMotion && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('lp-anim');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -5% 0px', threshold: 0 });
  reveals.forEach((el) => io.observe(el));
}

// ------------------------------------------------------------------ Quick Add demo

const input = $<HTMLInputElement>('#qa-input');
const titleEl = $('[data-qa-title]');
const metaEl = $('[data-qa-meta]');
const fieldsEl = $('[data-qa-fields]');
const checkEl = $('[data-qa-check]');

const PRIORITY_LABEL: Record<string, string> = { High: 'P1 · High', Medium: 'P2 · Medium', Low: 'P3 · Low', None: 'P4 · None' };

function el(tag: string, cls: string, text: string) {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

function render(r: QuickAddResult) {
  if (!titleEl || !metaEl || !fieldsEl || !checkEl) return;
  titleEl.textContent = r.title || 'Untitled task';
  checkEl.dataset.prio = r.priority ?? 'None';

  const due = r.dueDate ? [formatDueDate(r.dueDate), formatTime(r.dueTime)].filter(Boolean).join(' ') : '';
  const repeat = describeRecurrence(r.recurrence);
  const project = r.projectName ?? '';
  const labels = r.labels.map((l) => l.name);

  metaEl.replaceChildren(
    ...(due ? [el('li', repeat ? 'lp-meta-due is-repeat' : 'lp-meta-due', due)] : []),
    ...labels.map((l) => el('li', 'lp-meta-label', l)),
    ...(project ? [el('li', 'lp-meta-project', project)] : []),
  );

  const rows: [string, string][] = [
    ['Due', due || 'None'],
    ['Repeats', repeat || 'None'],
    ['Priority', r.priority ? PRIORITY_LABEL[r.priority] : 'None'],
    ['Project', project || 'Inbox'],
    ['Labels', labels.length ? labels.join(', ') : 'None'],
  ];
  fieldsEl.replaceChildren(...rows.flatMap(([k, v]) => [el('dt', '', k), el('dd', v === 'None' ? 'is-empty' : '', v)]));
}

if (input) {
  const run = () => render(parseQuickAdd(input.value));
  input.addEventListener('input', run);
  $$<HTMLButtonElement>('[data-example]').forEach((b) =>
    b.addEventListener('click', () => { input.value = b.dataset.example || ''; run(); input.focus(); }),
  );
  run();
}

const year = $('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
