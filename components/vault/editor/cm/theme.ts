/** Light / dark CodeMirror themes + Markdown highlight styles matching the app. */
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

interface Palette {
  text: string; heading: string; muted: string; faint: string; border: string; accent: string; accentSoft: string;
  caret: string; selection: string; codeBg: string; codeText: string; mark: string; markText: string; quote: string;
  panel: string; tooltip: string; tooltipSel: string; searchMatch: string; searchMatchSel: string;
  kw: string; str: string; num: string; comment: string; fn: string; type: string; prop: string;
}

const LIGHT: Palette = {
  text: '#1f2937', heading: '#111827', muted: '#6b7280', faint: '#9ca3af', border: '#e5e7eb', accent: '#2563eb', accentSoft: 'rgba(37,99,235,.10)',
  caret: '#2563eb', selection: 'rgba(59,130,246,.22)', codeBg: '#f3f4f6', codeText: '#be185d', mark: '#fef08a', markText: 'inherit', quote: '#d1d5db',
  panel: '#f9fafb', tooltip: '#ffffff', tooltipSel: 'rgba(59,130,246,.12)', searchMatch: 'rgba(250,204,21,.35)', searchMatchSel: 'rgba(249,115,22,.45)',
  kw: '#7c3aed', str: '#15803d', num: '#b45309', comment: '#9ca3af', fn: '#1d4ed8', type: '#0e7490', prop: '#0369a1',
};
const DARK: Palette = {
  text: '#e2e8f0', heading: '#f8fafc', muted: '#9ca3af', faint: '#6b7280', border: '#273041', accent: '#7aa7ff', accentSoft: 'rgba(96,165,250,.14)',
  caret: '#93c5fd', selection: 'rgba(96,165,250,.28)', codeBg: '#161c28', codeText: '#f9a8d4', mark: 'rgba(234,179,8,.32)', markText: '#fef9c3', quote: '#374151',
  panel: '#0c1018', tooltip: '#151a24', tooltipSel: 'rgba(96,165,250,.18)', searchMatch: 'rgba(250,204,21,.25)', searchMatchSel: 'rgba(249,115,22,.4)',
  kw: '#c4b5fd', str: '#86efac', num: '#fcd34d', comment: '#6b7280', fn: '#93c5fd', type: '#67e8f9', prop: '#7dd3fc',
};

function theme(p: Palette, dark: boolean): Extension {
  const view = EditorView.theme({
    '&': { color: p.text, backgroundColor: 'transparent', fontSize: '16px' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: SANS, lineHeight: '1.65', overflowX: 'hidden' },
    '.cm-content': { padding: '8px 32px 45vh', caretColor: p.caret, fontFamily: SANS },
    '@media (max-width: 640px)': { '.cm-content': { paddingLeft: '16px', paddingRight: '16px' } },
    '&.cm-readable .cm-content': { maxWidth: '760px', marginLeft: 'auto', marginRight: 'auto' },
    '.cm-line': { padding: '0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: p.caret, borderLeftWidth: '2px' },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': { backgroundColor: p.selection + ' !important' },
    '.cm-placeholder': { color: p.faint, fontStyle: 'italic' },
    '.cm-searchMatch': { backgroundColor: p.searchMatch, borderRadius: '2px' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: p.searchMatchSel },
    '.cm-selectionMatch': { backgroundColor: p.accentSoft },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: p.accentSoft, outline: 'none' },
    '.cm-panels': { backgroundColor: p.panel, color: p.text, fontFamily: SANS },
    '.cm-panels.cm-panels-top': { borderBottom: `1px solid ${p.border}` },
    '.cm-panels.cm-panels-bottom': { borderTop: `1px solid ${p.border}` },
    '.cm-panel.cm-search': { padding: '8px 12px', fontSize: '13px' },
    '.cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label': { fontSize: '13px' },
    '.cm-panel.cm-search input[type=text], .cm-textfield': { backgroundColor: dark ? '#0F1219' : '#fff', color: p.text, border: `1px solid ${p.border}`, borderRadius: '6px', padding: '3px 8px' },
    '.cm-button': { backgroundImage: 'none', backgroundColor: dark ? '#1A1F2E' : '#fff', color: p.text, border: `1px solid ${p.border}`, borderRadius: '6px', padding: '3px 10px' },
    '.cm-panel.cm-search [name=close]': { color: p.muted, fontSize: '18px' },
    '.cm-tooltip': { backgroundColor: p.tooltip, color: p.text, border: `1px solid ${p.border}`, borderRadius: '8px', boxShadow: dark ? '0 10px 30px rgba(0,0,0,.5)' : '0 10px 30px rgba(0,0,0,.12)', overflow: 'hidden' },
    '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: SANS, fontSize: '14px', maxHeight: '18em', minWidth: '260px', maxWidth: 'min(520px, 90vw)' },
    '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px !important', lineHeight: '1.5', display: 'flex', alignItems: 'baseline', gap: '8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: p.tooltipSel, color: p.text },
    '.cm-completionLabel': { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis' },
    '.cm-completionDetail': { color: p.faint, fontStyle: 'normal', fontSize: '12px', marginLeft: 'auto' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: p.accent, fontWeight: '600' },
    '.cm-completionInfo': { padding: '6px 10px', fontSize: '12px', color: p.muted },
    // ---- live preview / markdown styling
    '.cm-lp-h1': { fontSize: '1.9em', lineHeight: '1.3', fontWeight: '700', color: p.heading, paddingTop: '.5em !important', letterSpacing: '-.01em' },
    '.cm-lp-h2': { fontSize: '1.5em', lineHeight: '1.3', fontWeight: '700', color: p.heading, paddingTop: '.45em !important' },
    '.cm-lp-h3': { fontSize: '1.25em', lineHeight: '1.35', fontWeight: '700', color: p.heading, paddingTop: '.35em !important' },
    '.cm-lp-h4': { fontSize: '1.1em', fontWeight: '700', color: p.heading, paddingTop: '.25em !important' },
    '.cm-lp-h5': { fontSize: '1em', fontWeight: '700', color: p.heading },
    '.cm-lp-h6': { fontSize: '.9em', fontWeight: '700', color: p.muted },
    '.cm-lp-strong': { fontWeight: '700' },
    '.cm-lp-em': { fontStyle: 'italic' },
    '.cm-lp-strike': { textDecoration: 'line-through', textDecorationColor: p.faint },
    '.cm-lp-mark': { backgroundColor: p.mark, color: p.markText, borderRadius: '2px' },
    '.cm-lp-code': { fontFamily: MONO, fontSize: '.86em', backgroundColor: p.codeBg, color: p.codeText, borderRadius: '4px', padding: '.1em .3em' },
    '.cm-lp-wikilink, .cm-lp-link, .cm-lp-url': { color: p.accent, cursor: 'pointer', textDecoration: 'none' },
    '.cm-lp-wikilink:hover, .cm-lp-link:hover, .cm-lp-url:hover': { textDecoration: 'underline' },
    '.cm-lp-wikilink-raw': { color: p.accent },
    '.cm-lp-unresolved': { opacity: '.6' },
    '.cm-lp-tag': { cursor: 'pointer' },
    '.cm-lp-tag-raw': { color: p.accent },
    '.cm-lp-comment': { color: p.faint },
    '.cm-lp-blockid': { color: p.faint, fontSize: '.85em' },
    '.cm-lp-fn': { color: p.accent, fontSize: '.75em', verticalAlign: 'super' },
    '.cm-lp-bullet': { color: p.faint, display: 'inline-block', width: '1.1em', textAlign: 'center', fontWeight: '700' },
    '.cm-lp-checkbox-wrap': { display: 'inline-block', width: '1.5em', verticalAlign: 'baseline' },
    '.cm-lp-done': { color: p.muted, textDecoration: 'line-through', textDecorationColor: p.faint },
    '.cm-lp-hr-w': { display: 'inline-block', width: '100%', borderTop: `1px solid ${p.border}`, verticalAlign: 'middle' },
    '.cm-lp-quote': { borderLeft: `3px solid ${p.quote}`, paddingLeft: '1em !important', color: p.muted },
    '.cm-lp-callout': { borderLeft: '3px solid rgb(var(--callout-color))', backgroundColor: `rgba(var(--callout-color), ${dark ? '.12' : '.08'})`, paddingLeft: '1em !important', paddingRight: '.8em !important' },
    '.cm-lp-callout-first': { borderTopRightRadius: '6px', paddingTop: '.35em !important' },
    '.cm-lp-callout-last': { borderBottomRightRadius: '6px', paddingBottom: '.35em !important' },
    '.cm-lp-callout-title': { color: 'rgb(var(--callout-color))', fontWeight: '600' },
    '.cm-lp-callout-icon': { display: 'inline-flex', verticalAlign: '-0.15em', marginRight: '.4em', color: 'rgb(var(--callout-color))' },
    '.cm-lp-callout-icon svg': { width: '1em', height: '1em' },
    '.cm-lp-codeblock': { fontFamily: MONO, fontSize: '.86em', backgroundColor: p.codeBg, paddingLeft: '1em !important', paddingRight: '1em !important', lineHeight: '1.55' },
    '.cm-lp-codeblock-first': { borderTopLeftRadius: '6px', borderTopRightRadius: '6px', paddingTop: '.3em !important' },
    '.cm-lp-codeblock-last': { borderBottomLeftRadius: '6px', borderBottomRightRadius: '6px', paddingBottom: '.3em !important' },
    '.cm-lp-fence': { color: p.faint },
    '.cm-lp-table': { fontFamily: MONO, fontSize: '.88em' },
    '.cm-frontmatter': { fontFamily: MONO, fontSize: '.86em', color: p.muted },
    '.cm-lp-embed': { display: 'block', whiteSpace: 'normal', cursor: 'default' },
    '.cm-lp-embed .mdv': { fontSize: '15px' },
    '.cm-lp-img': { maxWidth: '100%', borderRadius: '6px', display: 'block', margin: '.3em 0' },
  }, { dark });

  const hl = HighlightStyle.define([
    { tag: [t.heading1, t.heading2, t.heading3, t.heading4, t.heading5, t.heading6, t.heading], fontWeight: '700', color: p.heading },
    { tag: t.strong, fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through' },
    { tag: [t.link, t.url], color: p.accent },
    { tag: t.monospace, fontFamily: MONO, fontSize: '.9em', color: p.codeText },
    { tag: t.quote, color: p.muted },
    { tag: [t.processingInstruction, t.contentSeparator], color: p.faint },
    { tag: t.meta, color: p.muted },
    { tag: [t.keyword, t.operatorKeyword, t.controlKeyword, t.modifier, t.definitionKeyword], color: p.kw },
    { tag: [t.string, t.special(t.string), t.regexp], color: p.str },
    { tag: [t.number, t.bool, t.atom, t.null], color: p.num },
    { tag: [t.comment, t.lineComment, t.blockComment], color: p.comment, fontStyle: 'italic' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.variableName)], color: p.fn },
    { tag: [t.typeName, t.className, t.namespace], color: p.type },
    { tag: [t.propertyName, t.attributeName], color: p.prop },
    { tag: [t.tagName], color: p.kw },
    { tag: t.invalid, color: '#ef4444' },
  ]);
  return [view, syntaxHighlighting(hl)];
}

export const lightTheme = theme(LIGHT, false);
export const darkTheme = theme(DARK, true);
export const editorTheme = (dark: boolean) => (dark ? darkTheme : lightTheme);
export const isDarkDoc = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
