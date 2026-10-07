/**
 * Obsidian-flavoured Markdown → HTML (reading view, hover previews, embeds).
 * Built on `marked` (GFM) with extensions for [[wikilinks]], ![[embeds]]
 * (recursive transclusion with depth/cycle guards), #tags, ==highlights==,
 * callouts, footnotes, %%comments%%, ^block-ids and clickable task boxes
 * that remember their source line. Output is NOT sanitised — the web view
 * passes it through DOMPurify. Framework-free so it is unit tested in node.
 */
import { Marked, type Tokens, type TokenizerAndRendererExtension } from 'marked';
import { maskCode, parseFrontmatter, parseLinkInner, slugify } from './parse';
import { CALLOUTS, parseCalloutHeader, resolveEmbed, stripComments, taskLines, linkDisplay, isExternalUrl, type ResolveFn } from './markdown';

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const svg = (body: string, cls = 'md-icon') =>
  `<svg class="${cls}" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS: Record<string, string> = {
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6 13H2"/><path d="M22 13h-4"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
};
export const icon = (name: string, cls?: string) => svg(ICONS[name] ?? ICONS.pencil, cls);

export interface RenderOptions {
  resolve: ResolveFn;
  /** Id of the note being rendered (for [[#heading]] and cycle guards). */
  fromId?: string;
  depth?: number;
  maxDepth?: number;
  visited?: ReadonlySet<string>;
  /** Task checkboxes are enabled and carry `data-line` (top-level reading view only). */
  interactiveTasks?: boolean;
  /** Truncate the body (hover previews). */
  maxChars?: number;
  /** Content already has no frontmatter (embedded sections). */
  bodyOnly?: boolean;
}

/** Remove trailing ` ^block-id` markers outside code. */
export function stripBlockIds(md: string): string {
  const masked = maskCode(md, false).split('\n');
  return md.split('\n').map((l, i) => {
    const m = /\s\^[A-Za-z0-9-]+\s*$/.exec(masked[i] ?? '');
    return m ? l.slice(0, m.index) : l;
  }).join('\n');
}

function truncate(md: string, max: number): string {
  if (md.length <= max) return md;
  let cut = md.lastIndexOf('\n', max);
  if (cut < max * 0.6) cut = max;
  let out = md.slice(0, cut);
  // Close an unbalanced code fence so the rest doesn't turn into code.
  if (((out.match(/^ {0,3}(```|~~~)/gm) ?? []).length) % 2) out += '\n```';
  return out + '\n\n…';
}

/** Render a note (or a fragment) to HTML. */
export function renderMarkdown(content: string, opts: RenderOptions): string {
  const depth = opts.depth ?? 0;
  const visited = new Set(opts.visited ?? []);
  if (opts.fromId) visited.add(opts.fromId);
  const lines = opts.interactiveTasks ? taskLines(stripComments(content, true)) : [];
  let taskIdx = 0;
  const footnotes = new Map<string, string>();
  const fnOrder: string[] = [];

  let body = opts.bodyOnly ? content : parseFrontmatter(content).body;
  body = stripBlockIds(stripComments(body));
  if (opts.maxChars) body = truncate(body, opts.maxChars);

  const isResolved = (target: string) => !!opts.resolve(target, opts.fromId);

  const renderEmbed = (inner: string, block: boolean): string => {
    const link = parseLinkInner(inner);
    const r = resolveEmbed(link, opts.resolve, { fromId: opts.fromId, depth, maxDepth: opts.maxDepth, visited });
    const attrs = `data-href="${esc(link.target)}"${link.heading ? ` data-heading="${esc(link.heading)}"` : ''}${link.block ? ` data-block="${esc(link.block)}"` : ''}`;
    if (r.kind === 'image') {
      const src = r.src!;
      const ok = isExternalUrl(src) || src.startsWith('/') || src.startsWith('./');
      return `<img class="md-embed-image" src="${esc(ok ? src : src)}" alt="${esc(link.target.split('/').pop() ?? '')}"${r.width ? ` width="${r.width}"` : ''}${r.height ? ` height="${r.height}"` : ''} loading="lazy">`;
    }
    const tag = block ? 'div' : 'span';
    if (r.kind === 'missing') return `<${tag} class="md-embed md-embed-missing"><a class="internal-link is-unresolved" role="link" tabindex="0" ${attrs}>${esc(linkDisplay(link))}</a> <span class="md-embed-note">— note not created yet</span></${tag}>`;
    const title = esc(r.note!.title + (link.heading ? ` › ${link.heading}` : link.block ? ` › ^${link.block}` : ''));
    const header = `<${tag} class="md-embed-header"><a class="internal-link md-embed-title" role="link" tabindex="0" ${attrs} aria-label="Open ${title}">${title}</a>${icon('link', 'md-embed-icon')}</${tag}>`;
    if (r.kind === 'cycle' || r.kind === 'depth') {
      return `<${tag} class="md-embed md-embed-stub">${header}<${tag} class="md-embed-body md-embed-note">${r.kind === 'cycle' ? 'Embed cycle — not expanded' : 'Embed too deep — open to view'}</${tag}></${tag}>`;
    }
    const html = renderMarkdown(r.markdown ?? '', { resolve: opts.resolve, fromId: r.note!.id, depth: depth + 1, maxDepth: opts.maxDepth, visited, bodyOnly: true });
    return `<div class="md-embed">${header}<div class="md-embed-body">${html}</div></div>`;
  };

  const extensions: TokenizerAndRendererExtension[] = [
    {
      name: 'callout', level: 'block',
      start(src) { const m = /^ {0,3}>[ \t]*\[![\w-]+\]/m.exec(src); return m ? m.index : undefined; },
      tokenizer(src) {
        const m = /^ {0,3}>[ \t]*\[![\w-]+\][^\n]*(?:\n {0,3}>[^\n]*)*/.exec(src);
        if (!m) return undefined;
        const ls = m[0].split('\n').map((l) => l.replace(/^ {0,3}> ?/, ''));
        const header = parseCalloutHeader(ls[0]);
        if (!header) return undefined;
        const bodySrc = ls.slice(1).join('\n');
        return {
          type: 'callout', raw: m[0] + (src[m[0].length] === '\n' ? '\n' : ''), header,
          titleTokens: this.lexer.inlineTokens(header.title), tokens: this.lexer.blockTokens(bodySrc, []),
        };
      },
      renderer(token) {
        const h = token.header as NonNullable<ReturnType<typeof parseCalloutHeader>>;
        const title = this.parser.parseInline(token.titleTokens);
        const body = this.parser.parse(token.tokens);
        const style = `style="--callout-color: ${h.type.color}"`;
        const iconHtml = `<span class="callout-icon">${icon(h.type.icon)}</span>`;
        const cls = `callout callout-${esc(h.type.key)}`;
        const content = body.trim() ? `<div class="callout-content">${body}</div>` : '';
        if (h.fold) {
          return `<details class="${cls} is-foldable" data-callout="${esc(h.type.key)}" ${style}${h.fold === '+' ? ' open' : ''}><summary class="callout-title">${iconHtml}<span class="callout-title-inner">${title}</span><span class="callout-fold">${icon('chevron')}</span></summary>${content}</details>\n`;
        }
        return `<div class="${cls}" data-callout="${esc(h.type.key)}" ${style}><div class="callout-title">${iconHtml}<span class="callout-title-inner">${title}</span></div>${content}</div>\n`;
      },
    },
    {
      name: 'embedBlock', level: 'block',
      start(src) { const m = /^ {0,3}!\[\[/m.exec(src); return m ? m.index : undefined; },
      tokenizer(src) {
        const m = /^ {0,3}!\[\[([^\[\]\n]+?)\]\][ \t]*(?:\n|$)/.exec(src);
        if (!m) return undefined;
        return { type: 'embedBlock', raw: m[0], inner: m[1] };
      },
      renderer(token) { return renderEmbed(token.inner, true) + '\n'; },
    },
    {
      name: 'footnoteDef', level: 'block',
      start(src) { const m = /^\[\^[^\]\s]+\]:/m.exec(src); return m ? m.index : undefined; },
      tokenizer(src) {
        const m = /^\[\^([^\]\s]+)\]:[ \t]*([^\n]*(?:\n(?: {2,}|\t)[^\n]*)*)(?:\n|$)/.exec(src);
        if (!m) return undefined;
        return { type: 'footnoteDef', raw: m[0], id: m[1], tokens: this.lexer.inlineTokens(m[2].replace(/\n\s+/g, ' ')) };
      },
      renderer(token) { footnotes.set(token.id, this.parser.parseInline(token.tokens)); return ''; },
    },
    {
      name: 'wikilink', level: 'inline',
      start(src) { const i = src.search(/!?\[\[/); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^(!?)\[\[([^\[\]\n]+?)\]\]/.exec(src);
        if (!m) return undefined;
        return { type: 'wikilink', raw: m[0], embed: m[1] === '!', inner: m[2] };
      },
      renderer(token) {
        if (token.embed) return renderEmbed(token.inner, false);
        const l = parseLinkInner(token.inner);
        const ok = isResolved(l.target);
        const attrs = `data-href="${esc(l.target)}"${l.heading ? ` data-heading="${esc(l.heading)}"` : ''}${l.block ? ` data-block="${esc(l.block)}"` : ''}`;
        return `<a class="internal-link${ok ? '' : ' is-unresolved'}" role="link" tabindex="0" ${attrs} title="${esc(l.target || l.heading || '')}">${esc(linkDisplay(l))}</a>`;
      },
    },
    {
      name: 'highlight', level: 'inline',
      start(src) { const i = src.indexOf('=='); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^==(?=\S)([^\n]*?\S)==(?!=)/.exec(src);
        if (!m) return undefined;
        return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) };
      },
      renderer(token) { return `<mark>${this.parser.parseInline(token.tokens)}</mark>`; },
    },
    {
      name: 'tag', level: 'inline',
      start(src) { const m = /(^|[\s(,;!?])#[\p{L}\p{N}_\-/]*[\p{L}_\-/]/u.exec(src); return m ? m.index + m[1].length : undefined; },
      tokenizer(src) {
        const m = /^#([\p{L}\p{N}_\-/]*[\p{L}_\-/][\p{L}\p{N}_\-/]*)/u.exec(src);
        if (!m) return undefined;
        return { type: 'tag', raw: m[0], tag: m[1].replace(/\/+$/, '') };
      },
      renderer(token) { return `<a class="tag" role="link" tabindex="0" data-tag="${esc(token.tag)}">#${esc(token.tag)}</a>`; },
    },
    {
      name: 'footnoteRef', level: 'inline',
      start(src) { const i = src.indexOf('[^'); return i < 0 ? undefined : i; },
      tokenizer(src) {
        const m = /^\[\^([^\]\s]+)\](?!:)/.exec(src);
        if (!m) return undefined;
        return { type: 'footnoteRef', raw: m[0], id: m[1] };
      },
      renderer(token) {
        if (!fnOrder.includes(token.id)) fnOrder.push(token.id);
        const n = fnOrder.indexOf(token.id) + 1;
        return `<sup class="footnote-ref"><a data-footnote="${esc(token.id)}" role="link" tabindex="0">${n}</a></sup>`;
      },
    },
  ];

  const md = new Marked({ gfm: true, breaks: false, async: false }, {
    extensions,
    renderer: {
      heading({ tokens, depth: d, text }: Tokens.Heading) {
        const slug = slugify(text.replace(/\s+#+\s*$/, ''));
        return `<h${d} data-slug="${esc(slug)}" data-heading="${esc(text)}" id="md-${esc(slug)}">${this.parser.parseInline(tokens)}</h${d}>\n`;
      },
      code({ text, lang }: Tokens.Code) {
        const l = (lang ?? '').trim().split(/\s+/)[0];
        return `<div class="md-codeblock">${l ? `<span class="md-code-lang">${esc(l)}</span>` : ''}<button type="button" class="md-copy" aria-label="Copy code">${icon('copy')}</button><pre><code${l ? ` class="language-${esc(l)}" data-lang="${esc(l)}"` : ''}>${esc(text)}</code></pre></div>\n`;
      },
      checkbox({ checked }: Tokens.Checkbox) {
        if (!opts.interactiveTasks) return `<input type="checkbox" class="task-checkbox" disabled${checked ? ' checked' : ''}> `;
        const line = lines[taskIdx++];
        return `<input type="checkbox" class="task-checkbox"${checked ? ' checked' : ''}${line !== undefined ? ` data-line="${line}"` : ' disabled'} aria-label="Toggle task"> `;
      },
      listitem(item: Tokens.ListItem) {
        const inner = this.parser.parse(item.tokens);
        if (!item.task) return `<li>${inner}</li>\n`;
        return `<li class="task-list-item${item.checked ? ' is-checked' : ''}">${inner}</li>\n`;
      },
      link({ href, title, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        // [text](Note.md) → internal link
        if (!isExternalUrl(href) && /\.md(#.*)?$/i.test(href)) {
          const [path, frag] = decodeURIComponent(href).split('#');
          const target = path.replace(/\.md$/i, '');
          const ok = isResolved(target);
          return `<a class="internal-link${ok ? '' : ' is-unresolved'}" role="link" tabindex="0" data-href="${esc(target)}"${frag ? (frag.startsWith('^') ? ` data-block="${esc(frag.slice(1))}"` : ` data-heading="${esc(frag)}"`) : ''}>${text}</a>`;
        }
        if (href.startsWith('#')) return `<a class="internal-link" role="link" tabindex="0" data-href="" data-heading="${esc(decodeURIComponent(href.slice(1)))}">${text}</a>`;
        return `<a class="external-link" href="${esc(href)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${esc(title)}"` : ''}>${text}</a>`;
      },
      image({ href, title, text }: Tokens.Image) {
        const size = /^(.*?)\|(\d+)(?:x(\d+))?$/.exec(text);
        return `<img src="${esc(href)}" alt="${esc(size ? size[1] : text)}"${size ? ` width="${size[2]}"` : ''}${size?.[3] ? ` height="${size[3]}"` : ''}${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
      },
      table(token: Tokens.Table) {
        let head = '';
        for (const c of token.header) head += this.tablecell(c);
        let rows = '';
        for (const r of token.rows) { let row = ''; for (const c of r) row += this.tablecell(c); rows += `<tr>${row}</tr>`; }
        return `<div class="md-table-wrap"><table><thead><tr>${head}</tr></thead>${rows ? `<tbody>${rows}</tbody>` : ''}</table></div>\n`;
      },
    },
  });

  let html = md.parse(body) as string;
  if (fnOrder.length || footnotes.size) {
    const ids = [...fnOrder, ...[...footnotes.keys()].filter((k) => !fnOrder.includes(k))];
    html += `<section class="footnotes"><hr><ol>${ids.map((id) => `<li data-footnote-id="${esc(id)}">${footnotes.get(id) ?? `<em>Missing footnote ${esc(id)}</em>`}</li>`).join('')}</ol></section>`;
  }
  return html;
}

export { CALLOUTS };
