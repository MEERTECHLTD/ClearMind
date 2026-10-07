/**
 * Scoped stylesheet for the reading view, embeds, callouts, hover previews and
 * Live Preview widgets. Injected once into <head>; light/dark via the `.dark`
 * class on <html> (Tailwind class mode).
 */
const CSS = `
.mdv-root {
  --mdv-text: #1f2937; --mdv-muted: #6b7280; --mdv-faint: #9ca3af; --mdv-border: #e5e7eb;
  --mdv-accent: #2563eb; --mdv-accent-soft: rgba(37,99,235,.10); --mdv-code-bg: #f3f4f6; --mdv-code-text: #be185d;
  --mdv-mark: #fef08a; --mdv-mark-text: inherit; --mdv-quote: #d1d5db; --mdv-embed-bg: rgba(0,0,0,.015);
  --mdv-heading: #111827;
}
.dark .mdv-root {
  --mdv-text: #e2e8f0; --mdv-muted: #9ca3af; --mdv-faint: #6b7280; --mdv-border: #273041;
  --mdv-accent: #7aa7ff; --mdv-accent-soft: rgba(96,165,250,.14); --mdv-code-bg: #161c28; --mdv-code-text: #f9a8d4;
  --mdv-mark: rgba(234,179,8,.32); --mdv-mark-text: #fef9c3; --mdv-quote: #374151; --mdv-embed-bg: rgba(255,255,255,.02);
  --mdv-heading: #f8fafc;
}
.mdv { color: var(--mdv-text); font-family: Inter, ui-sans-serif, system-ui, sans-serif; font-size: 16px; line-height: 1.65; word-wrap: break-word; }
.mdv.mdv-page { padding: 8px 32px 40vh; }
@media (max-width: 640px) { .mdv.mdv-page { padding-left: 16px; padding-right: 16px; } }
.mdv.mdv-readable { max-width: 760px; margin-left: auto; margin-right: auto; width: 100%; box-sizing: border-box; }
.mdv > :first-child { margin-top: 0; }
.mdv p { margin: 0 0 .9em; }
.mdv h1, .mdv h2, .mdv h3, .mdv h4, .mdv h5, .mdv h6 { color: var(--mdv-heading); font-weight: 700; line-height: 1.3; margin: 1.4em 0 .5em; scroll-margin-top: 16px; }
.mdv h1 { font-size: 1.9em; letter-spacing: -.01em; } .mdv h2 { font-size: 1.5em; } .mdv h3 { font-size: 1.25em; }
.mdv h4 { font-size: 1.1em; } .mdv h5 { font-size: 1em; } .mdv h6 { font-size: .9em; color: var(--mdv-muted); }
.mdv ul, .mdv ol { margin: 0 0 .9em; padding-left: 1.6em; }
.mdv ul { list-style: disc; } .mdv ol { list-style: decimal; } .mdv ul ul { list-style: circle; }
.mdv li { margin: .15em 0; } .mdv li > p { margin: 0; } .mdv li > ul, .mdv li > ol { margin: .1em 0; }
.mdv li::marker { color: var(--mdv-faint); }
.mdv li.task-list-item { list-style: none; position: relative; }
.mdv li.task-list-item > .task-checkbox, .mdv li.task-list-item > p > .task-checkbox { position: absolute; left: -1.45em; top: .38em; }
.mdv li.task-list-item.is-checked { color: var(--mdv-muted); text-decoration: line-through; text-decoration-color: var(--mdv-faint); }
.mdv .task-checkbox, .cm-lp-checkbox { appearance: none; -webkit-appearance: none; width: 1em; height: 1em; border: 1.5px solid var(--mdv-faint, #9ca3af); border-radius: 4px; vertical-align: -0.12em; cursor: pointer; margin: 0; background: transparent; display: inline-grid; place-content: center; }
.mdv .task-checkbox:checked, .cm-lp-checkbox:checked { background: #3B82F6; border-color: #3B82F6; }
.mdv .task-checkbox:checked::after, .cm-lp-checkbox:checked::after { content: ''; width: .55em; height: .3em; border: 2px solid white; border-top: 0; border-right: 0; transform: rotate(-45deg) translate(1px,-1px); }
.mdv .task-checkbox:disabled { cursor: default; opacity: .8; }
.mdv .task-checkbox:focus-visible, .cm-lp-checkbox:focus-visible { outline: 2px solid #3B82F6; outline-offset: 2px; }
.mdv a { color: var(--mdv-accent); text-decoration: none; cursor: pointer; }
.mdv a:hover { text-decoration: underline; }
.mdv a.internal-link.is-unresolved { opacity: .6; }
.mdv a.external-link::after { content: '↗'; font-size: .75em; margin-left: 2px; opacity: .6; }
.mdv a.tag, .cm-lp-tag { display: inline-block; background: var(--mdv-accent-soft); color: var(--mdv-accent); border-radius: 999px; padding: 0 .55em; font-size: .85em; line-height: 1.6; text-decoration: none; }
.mdv a.tag:hover { filter: brightness(1.1); text-decoration: none; }
.mdv [role=link]:focus-visible { outline: 2px solid #3B82F6; outline-offset: 1px; border-radius: 3px; }
.mdv mark { background: var(--mdv-mark); color: var(--mdv-mark-text); border-radius: 2px; padding: 0 1px; }
.mdv code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .86em; background: var(--mdv-code-bg); color: var(--mdv-code-text); border-radius: 4px; padding: .12em .35em; }
.mdv .md-codeblock { position: relative; margin: 0 0 1em; }
.mdv .md-codeblock pre { background: var(--mdv-code-bg); border: 1px solid var(--mdv-border); border-radius: 8px; padding: .9em 1em; overflow-x: auto; line-height: 1.5; }
.mdv .md-codeblock pre code { background: none; color: var(--mdv-text); padding: 0; font-size: .85em; }
.mdv .md-code-lang { position: absolute; right: 2.6em; top: .55em; font-size: .7em; color: var(--mdv-faint); text-transform: lowercase; }
.mdv .md-copy { position: absolute; right: .45em; top: .4em; border: 0; background: transparent; color: var(--mdv-faint); padding: .25em; border-radius: 5px; cursor: pointer; opacity: 0; transition: opacity .15s; }
.mdv .md-codeblock:hover .md-copy, .mdv .md-copy:focus-visible { opacity: 1; }
.mdv .md-copy:hover { color: var(--mdv-text); background: var(--mdv-border); }
.mdv .md-copy.is-copied { color: #16a34a; opacity: 1; }
.mdv blockquote { border-left: 3px solid var(--mdv-quote); margin: 0 0 1em; padding: .1em 0 .1em 1em; color: var(--mdv-muted); }
.mdv blockquote > :last-child { margin-bottom: 0; }
.mdv hr { border: 0; border-top: 1px solid var(--mdv-border); margin: 1.6em 0; }
.mdv img { max-width: 100%; border-radius: 6px; }
.mdv .md-table-wrap { overflow-x: auto; margin: 0 0 1em; }
.mdv table { border-collapse: collapse; font-size: .94em; }
.mdv th, .mdv td { border: 1px solid var(--mdv-border); padding: .4em .75em; text-align: left; }
.mdv th { background: var(--mdv-code-bg); font-weight: 600; }
.mdv .footnotes { font-size: .88em; color: var(--mdv-muted); margin-top: 2em; }
.mdv .footnote-ref a { font-size: .75em; padding: 0 1px; }
/* callouts */
.mdv .callout { --callout-color: 68, 138, 255; background: rgba(var(--callout-color), .08); border-left: 3px solid rgb(var(--callout-color)); border-radius: 6px; padding: .6em .9em; margin: 0 0 1em; }
.dark .mdv .callout { background: rgba(var(--callout-color), .12); }
.mdv .callout-title { display: flex; align-items: center; gap: .45em; font-weight: 600; color: rgb(var(--callout-color)); list-style: none; }
.mdv summary.callout-title { cursor: pointer; }
.mdv summary.callout-title::-webkit-details-marker { display: none; }
.mdv .callout-title .md-icon { width: 1.05em; height: 1.05em; flex: none; }
.mdv .callout-icon { display: inline-flex; }
.mdv .callout-fold { display: inline-flex; margin-left: auto; transition: transform .15s; }
.mdv details[open] > summary .callout-fold { transform: rotate(90deg); }
.mdv .callout-content { margin-top: .4em; color: var(--mdv-text); }
.mdv .callout-content > :last-child { margin-bottom: 0; }
/* embeds */
.mdv .md-embed, .cm-lp-embed .md-embed { display: block; border: 1px solid var(--mdv-border); border-left: 3px solid var(--mdv-accent); border-radius: 6px; background: var(--mdv-embed-bg); padding: .5em .9em .6em; margin: .3em 0 1em; }
.mdv .md-embed-header { display: flex; align-items: center; justify-content: space-between; gap: .5em; font-size: .8em; font-weight: 600; margin-bottom: .3em; }
.mdv .md-embed-title { color: var(--mdv-muted) !important; }
.mdv .md-embed-icon { width: 14px; height: 14px; color: var(--mdv-faint); }
.mdv .md-embed-body > :last-child { margin-bottom: 0; }
.mdv .md-embed-note { color: var(--mdv-faint); font-size: .85em; font-style: italic; }
.mdv .md-embed-missing { border-left-color: var(--mdv-faint); }
/* code token colours (classHighlighter) */
.mdv .tok-keyword, .mdv .tok-operatorKeyword, .mdv .tok-controlKeyword { color: #7c3aed; }
.mdv .tok-string, .mdv .tok-string2 { color: #15803d; }
.mdv .tok-number, .mdv .tok-bool, .mdv .tok-atom { color: #b45309; }
.mdv .tok-comment { color: #9ca3af; font-style: italic; }
.mdv .tok-variableName.tok-definition, .mdv .tok-function { color: #1d4ed8; }
.mdv .tok-typeName, .mdv .tok-className { color: #0e7490; }
.mdv .tok-propertyName { color: #0369a1; }
.mdv .tok-meta, .mdv .tok-punctuation { color: var(--mdv-muted); }
.dark .mdv .tok-keyword, .dark .mdv .tok-operatorKeyword, .dark .mdv .tok-controlKeyword { color: #c4b5fd; }
.dark .mdv .tok-string, .dark .mdv .tok-string2 { color: #86efac; }
.dark .mdv .tok-number, .dark .mdv .tok-bool, .dark .mdv .tok-atom { color: #fcd34d; }
.dark .mdv .tok-comment { color: #6b7280; }
.dark .mdv .tok-variableName.tok-definition, .dark .mdv .tok-function { color: #93c5fd; }
.dark .mdv .tok-typeName, .dark .mdv .tok-className { color: #67e8f9; }
.dark .mdv .tok-propertyName { color: #7dd3fc; }
/* hover preview */
.mdv-preview { position: fixed; z-index: 1000; width: min(460px, calc(100vw - 24px)); max-height: 360px; overflow: auto; border-radius: 10px; border: 1px solid var(--mdv-border); background: #fff; box-shadow: 0 12px 32px rgba(0,0,0,.18); padding: 12px 16px 14px; }
.dark .mdv-preview { background: #121722; box-shadow: 0 12px 32px rgba(0,0,0,.55); }
.mdv-preview .mdv { font-size: 14px; }
.mdv-preview-title { font-size: 12px; font-weight: 600; color: var(--mdv-muted); margin-bottom: 6px; display: flex; justify-content: space-between; gap: 8px; }
.mdv-preview-title button { color: var(--mdv-accent); background: none; border: 0; cursor: pointer; font-size: 12px; padding: 0; }
`;

let injected = false;
export function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  if (document.getElementById('cm-vault-md-styles')) return;
  const el = document.createElement('style');
  el.id = 'cm-vault-md-styles';
  el.textContent = CSS;
  document.head.appendChild(el);
}
