/**
 * Obsidian Live Preview for CodeMirror 6: decorations that hide Markdown
 * syntax except on the lines the selection touches, render wikilinks / tasks /
 * bullets / rules / callouts / embeds as widgets, and style emphasis, code,
 * highlights and tags. In source mode only the "semantic" marks (wikilinks,
 * tags, headings sizes, frontmatter) are applied so Cmd-click and hover work.
 */
import { syntaxTree } from '@codemirror/language';
import type { Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { scanInline, lineInfo, linkDisplay, isImageTarget, isExternalUrl, parseCalloutHeader, cycleTaskLine, type CalloutHeader } from '../../../../shared/notes/markdown';
import { icon } from '../../../../shared/notes/markdownRender';
import { renderSafe, resolverFor, handleRenderedClick, highlightCodeBlocks } from '../render';
import { editorCtx, activeLines } from './context';
import { attachmentFor, buildAttachmentEmbed, fileRendererFor, hydrateAttachments } from '../attachmentEmbeds';
import { parseEmbedSize } from '../../attachmentUtils';
import type { Attachment } from '../../../../types';

// ------------------------------------------------------------------ widgets

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(o: CheckboxWidget) { return o.checked === this.checked; }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-lp-checkbox-wrap';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-lp-checkbox';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Mark task as not done' : 'Mark task as done');
    box.addEventListener('mousedown', (e) => e.preventDefault());
    box.addEventListener('click', (e) => {
      e.preventDefault();
      const pos = view.posAtDOM(wrap);
      const line = view.state.doc.lineAt(pos);
      const next = cycleTaskLine(line.text);
      if (next !== line.text) view.dispatch({ changes: { from: line.from, to: line.to, insert: next }, userEvent: 'input.toggle' });
    });
    wrap.appendChild(box);
    return wrap;
  }
  ignoreEvent() { return true; }
}

class TextWidget extends WidgetType {
  constructor(readonly text: string, readonly cls: string) { super(); }
  eq(o: TextWidget) { return o.text === this.text && o.cls === this.cls; }
  toDOM() { const s = document.createElement('span'); s.className = this.cls; s.textContent = this.text; return s; }
  ignoreEvent() { return false; }
}

class HrWidget extends WidgetType {
  eq() { return true; }
  toDOM() { const s = document.createElement('span'); s.className = 'cm-lp-hr-w'; s.setAttribute('role', 'separator'); return s; }
}

class CalloutIconWidget extends WidgetType {
  constructor(readonly h: CalloutHeader, readonly showLabel: boolean) { super(); }
  eq(o: CalloutIconWidget) { return o.h.type.key === this.h.type.key && o.showLabel === this.showLabel && o.h.fold === this.h.fold; }
  toDOM() {
    const s = document.createElement('span');
    s.className = 'cm-lp-callout-icon';
    s.innerHTML = icon(this.h.type.icon);
    if (this.showLabel) { const l = document.createElement('span'); l.textContent = this.h.title; l.style.marginLeft = '.4em'; s.appendChild(l); }
    return s;
  }
}

interface LinkData { target: string; heading?: string; block?: string; alias?: string }

class WikilinkWidget extends WidgetType {
  constructor(readonly link: LinkData, readonly resolved: boolean) { super(); }
  eq(o: WikilinkWidget) { return o.resolved === this.resolved && o.link.target === this.link.target && o.link.heading === this.link.heading && o.link.block === this.link.block && o.link.alias === this.link.alias; }
  toDOM() {
    const a = document.createElement('span');
    a.className = `cm-lp-wikilink${this.resolved ? '' : ' cm-lp-unresolved'}`;
    a.textContent = linkDisplay(this.link);
    a.dataset.wlTarget = this.link.target;
    if (this.link.heading) a.dataset.wlHeading = this.link.heading;
    if (this.link.block) a.dataset.wlBlock = this.link.block;
    a.setAttribute('role', 'link');
    a.title = this.link.target || this.link.heading || '';
    return a;
  }
  ignoreEvent() { return false; }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string, readonly width?: number) { super(); }
  eq(o: ImageWidget) { return o.src === this.src && o.width === this.width; }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'cm-lp-img';
    img.src = this.src;
    img.alt = this.alt;
    img.loading = 'lazy';
    if (this.width) img.width = this.width;
    return img;
  }
  get estimatedHeight() { return 200; }
}

/** `![[file.ext]]` for a vault attachment: image / PDF / audio / video / file chip. */
class AttachmentWidget extends WidgetType {
  constructor(readonly a: Attachment, readonly target: string, readonly width?: number, readonly height?: number) { super(); }
  eq(o: AttachmentWidget) { return o.a.id === this.a.id && o.a.updatedAt === this.a.updatedAt && o.target === this.target && o.width === this.width && o.height === this.height; }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-lp-att';
    wrap.appendChild(buildAttachmentEmbed(this.a, { target: this.target, width: this.width, height: this.height }));
    wrap.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement).closest('.internal-link, button')) e.preventDefault(); });
    wrap.addEventListener('click', (e) => {
      const ctx = view.state.facet(editorCtx);
      if (handleRenderedClick(e, { onOpenLink: ctx.openLink, onTagClick: ctx.tagClick, root: wrap })) e.stopPropagation();
    });
    return wrap;
  }
  get estimatedHeight() { return this.a.mime === 'application/pdf' ? 540 : this.a.height && this.a.width ? Math.min(600, this.a.height) : 120; }
  ignoreEvent(e: Event) { return !(e.type === 'mousedown' && !(e.target as HTMLElement).closest('.md-att-bar, audio, video, iframe')); }
}

class EmbedWidget extends WidgetType {
  constructor(readonly inner: string, readonly key: string, readonly html: string) { super(); }
  eq(o: EmbedWidget) { return o.key === this.key; }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span');
    wrap.className = 'cm-lp-embed';
    const body = document.createElement('div');
    body.className = 'mdv';
    body.innerHTML = this.html;
    wrap.appendChild(body);
    highlightCodeBlocks(body);
    hydrateAttachments(body, view.state.facet(editorCtx).index);
    wrap.addEventListener('mousedown', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.internal-link, a.tag, .md-copy, input')) e.preventDefault();
    });
    wrap.addEventListener('click', (e) => {
      const ctx = view.state.facet(editorCtx);
      if (handleRenderedClick(e, { onOpenLink: ctx.openLink, onTagClick: ctx.tagClick, root: body })) e.stopPropagation();
    });
    return wrap;
  }
  get estimatedHeight() { return 120; }
  ignoreEvent(e: Event) { return e.type !== 'mousedown' || !(e.target as HTMLElement).closest('.md-embed-header, .internal-link'); }
}

// ------------------------------------------------------------------ decoration builder

const hide = Decoration.replace({});
const embedCache = new Map<string, string>();
const lineDeco = (cls: string, attrs?: Record<string, string>) => Decoration.line({ class: cls, attributes: attrs });
const mark = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs });

const SKIP_NODES = new Set(['FencedCode', 'CodeBlock', 'Frontmatter', 'HTMLBlock', 'Table', 'CommentBlock']);

const INLINE_CLASS: Partial<Record<string, string>> = {
  bold: 'cm-lp-strong', italic: 'cm-lp-em', bolditalic: 'cm-lp-strong cm-lp-em', strike: 'cm-lp-strike', highlight: 'cm-lp-mark', code: 'cm-lp-code',
};

function calloutAbove(view: EditorView, lineNo: number): CalloutHeader | null {
  const doc = view.state.doc;
  for (let n = lineNo, i = 0; n >= 1 && i < 300; n--, i++) {
    const info = lineInfo(doc.line(n).text);
    if (!info.quoteDepth) return null;
    if (info.callout) return info.callout;
  }
  return null;
}

function build(view: EditorView): DecorationSet {
  const state = view.state;
  const ctx = state.facet(editorCtx);
  const live = ctx.mode === 'live';
  const doc = state.doc;
  const active = live ? activeLines(view) : new Set<number>();
  const sel = state.selection.ranges;
  const touches = (from: number, to: number) => view.hasFocus && sel.some((r) => r.from <= to && r.to >= from);
  const index = ctx.index;
  const resolved = (target: string) => !index || !!index.resolve(target, ctx.noteId) || !!attachmentFor(index, target, ctx.noteId);
  const out: Range<Decoration>[] = [];
  const tree = syntaxTree(state);

  for (const { from, to } of view.visibleRanges) {
    const blocks: { from: number; to: number; name: string }[] = [];
    tree.iterate({ from, to, enter: (n) => { if (SKIP_NODES.has(n.name)) { blocks.push({ from: n.from, to: n.to, name: n.name }); return false; } return undefined; } });
    let callout: CalloutHeader | null = null;
    let calloutInit = false;
    let lineNo = doc.lineAt(from).number;
    const lastLine = doc.lineAt(to).number;
    for (; lineNo <= lastLine; lineNo++) {
      const line = doc.line(lineNo);
      const block = blocks.find((b) => b.from <= line.from && line.from <= b.to);
      if (block) {
        callout = null;
        if (block.name === 'Frontmatter') { out.push(lineDeco('cm-frontmatter').range(line.from)); continue; }
        if (!live) continue;
        if (block.name === 'FencedCode' || block.name === 'CodeBlock') {
          const first = doc.lineAt(block.from).number === lineNo;
          const last = doc.lineAt(block.to).number === lineNo;
          const fence = block.name === 'FencedCode' && (first || last);
          out.push(lineDeco(`cm-lp-codeblock${first ? ' cm-lp-codeblock-first' : ''}${last ? ' cm-lp-codeblock-last' : ''}${fence ? ' cm-lp-fence' : ''}`).range(line.from));
        } else if (block.name === 'Table') out.push(lineDeco('cm-lp-table').range(line.from));
        continue;
      }
      const text = line.text;
      const info = lineInfo(text);
      const isActive = active.has(lineNo);
      const hideHere = live && !isActive;
      let markersHidden = false;

      // --- block-level
      if (info.kind === 'heading') {
        out.push(lineDeco(`cm-lp-h${info.level}`).range(line.from));
        if (hideHere && info.markerTo! > info.markerFrom!) out.push(hide.range(line.from + info.markerFrom!, line.from + info.markerTo!));
      }
      if (live && info.quoteDepth) {
        if (!calloutInit) { callout = info.callout ?? calloutAbove(view, lineNo - 1); calloutInit = true; }
        if (info.callout) callout = info.callout;
        if (callout) {
          const nextInfo = lineNo < doc.lines ? lineInfo(doc.line(lineNo + 1).text) : null;
          const isLast = !nextInfo?.quoteDepth || !!nextInfo.callout;
          out.push(lineDeco(`cm-lp-callout${info.callout ? ' cm-lp-callout-first cm-lp-callout-title' : ''}${isLast ? ' cm-lp-callout-last' : ''}`, { style: `--callout-color: ${callout.type.color}` }).range(line.from));
          if (info.callout && hideHere) {
            const head = /^\[![\w-]+\][+-]?[ \t]*/.exec(text.slice(info.quoteTo!))![0];
            const h = parseCalloutHeader(text.slice(info.quoteTo!))!;
            const explicitTitle = text.slice(info.quoteTo! + head.length).trim().length > 0;
            out.push(Decoration.replace({ widget: new CalloutIconWidget(h, !explicitTitle) }).range(line.from, line.from + info.quoteTo! + head.length));
            markersHidden = true;
          }
          if (isLast) callout = null;
        } else {
          out.push(lineDeco('cm-lp-quote').range(line.from));
        }
        if (hideHere && info.quoteTo && !markersHidden) out.push(hide.range(line.from, line.from + info.quoteTo));
      } else {
        callout = null; calloutInit = true;
      }
      if (live && info.kind === 'hr' && !isActive) {
        out.push(Decoration.replace({ widget: new HrWidget() }).range(line.from + (info.markerFrom ?? 0), line.to));
        continue;
      }
      if (live && info.kind === 'task') {
        const a = line.from + info.markerFrom!, b = line.from + info.markerTo!;
        if (!touches(a, b - 1)) out.push(Decoration.replace({ widget: new CheckboxWidget(!!info.checked) }).range(a, b));
        if (info.checked && b < line.to) out.push(mark('cm-lp-done').range(b, line.to));
      } else if (live && info.kind === 'bullet') {
        const a = line.from + info.markerFrom!;
        if (!touches(a, a + 1)) out.push(Decoration.replace({ widget: new TextWidget('•', 'cm-lp-bullet') }).range(a, a + 1));
      }

      // --- inline
      for (const s of scanInline(text)) {
        const f = line.from + s.from, t = line.from + s.to, cf = line.from + s.contentFrom, ct = line.from + s.contentTo;
        if (info.kind === 'heading' && s.to <= info.markerTo!) continue;
        switch (s.kind) {
          case 'wikilink': {
            const ok = resolved(s.target ?? '');
            if (hideHere) out.push(Decoration.replace({ widget: new WikilinkWidget({ target: s.target ?? '', heading: s.heading, block: s.block, alias: s.alias }, ok) }).range(f, t));
            else {
              const attrs: Record<string, string> = { 'data-wl-target': s.target ?? '' };
              if (s.heading) attrs['data-wl-heading'] = s.heading;
              if (s.block) attrs['data-wl-block'] = s.block;
              out.push(mark(`cm-lp-wikilink-raw${ok ? '' : ' cm-lp-unresolved'}`, attrs).range(f, t));
            }
            break;
          }
          case 'embed': {
            if (!hideHere) { out.push(mark('cm-lp-wikilink-raw', { 'data-wl-target': s.target ?? '', ...(s.heading ? { 'data-wl-heading': s.heading } : {}), ...(s.block ? { 'data-wl-block': s.block } : {}) }).range(f, t)); break; }
            const target = s.target ?? '';
            const att = attachmentFor(index, target, ctx.noteId);
            if (att) {
              const size = parseEmbedSize(s.alias);
              out.push(Decoration.replace({ widget: new AttachmentWidget(att, target, size.width, size.height) }).range(f, t));
            } else if (isImageTarget(target)) {
              const w = /^(\d+)/.exec(s.alias ?? '');
              out.push(Decoration.replace({ widget: new ImageWidget(target, target, w ? Number(w[1]) : undefined) }).range(f, t));
            } else if (index) {
              const note = index.resolve(target, ctx.noteId);
              const inner = text.slice(s.from, s.to);
              const key = `${inner}\u0000${note?.id ?? ''}\u0000${note?.content ?? ''}`;
              let html = embedCache.get(key);
              if (html === undefined) {
                html = renderSafe(inner, { resolve: resolverFor(index), fromId: ctx.noteId, depth: 0, bodyOnly: true, renderFile: fileRendererFor(index) });
                if (embedCache.size > 64) embedCache.delete(embedCache.keys().next().value!);
                embedCache.set(key, html);
              }
              out.push(Decoration.replace({ widget: new EmbedWidget(inner, key, html) }).range(f, t));
            }
            break;
          }
          case 'link':
          case 'image': {
            if (s.kind === 'image' && hideHere && s.href) { out.push(Decoration.replace({ widget: new ImageWidget(s.href, text.slice(s.contentFrom, s.contentTo)) }).range(f, t)); break; }
            if (s.kind === 'image') break;
            if (hideHere) {
              out.push(hide.range(f, cf));
              out.push(hide.range(ct, t));
              if (ct > cf) out.push(mark('cm-lp-link', { 'data-href': s.href ?? '' }).range(cf, ct));
            } else out.push(mark('cm-lp-wikilink-raw', { 'data-href': s.href ?? '' }).range(f, t));
            break;
          }
          case 'url':
            out.push(mark(live ? 'cm-lp-url' : 'cm-lp-wikilink-raw', { 'data-href': s.href ?? '' }).range(f, t));
            break;
          case 'tag':
            out.push(mark(live ? 'cm-lp-tag' : 'cm-lp-tag-raw', { 'data-tag': s.tag ?? '' }).range(f, t));
            break;
          case 'comment':
            out.push(mark('cm-lp-comment').range(f, t));
            break;
          case 'blockid':
            out.push(mark('cm-lp-blockid').range(f, t));
            break;
          case 'footnote':
            if (live) out.push(mark('cm-lp-fn').range(f, t));
            break;
          default: {
            const cls = INLINE_CLASS[s.kind];
            if (!cls || !live) break;
            if (ct > cf) out.push(mark(cls).range(cf, ct));
            if (hideHere) { out.push(hide.range(f, cf)); out.push(hide.range(ct, t)); }
          }
        }
      }
    }
  }
  return Decoration.set(out, true);
}

export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = build(view); }
  update(u: ViewUpdate) {
    if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged
      || u.startState.facet(editorCtx) !== u.state.facet(editorCtx) || syntaxTree(u.startState) !== syntaxTree(u.state)) {
      this.decorations = build(u.view);
    }
  }
}, { decorations: (v) => v.decorations });

// ------------------------------------------------------------------ interaction

function linkFromEl(el: HTMLElement) {
  return { target: el.dataset.wlTarget ?? '', heading: el.dataset.wlHeading, block: el.dataset.wlBlock };
}

function lineIsActive(view: EditorView, el: HTMLElement): boolean {
  try {
    const pos = view.posAtDOM(el);
    return activeLines(view).has(view.state.doc.lineAt(pos).number);
  } catch { return false; }
}

export const linkInteractions = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (e.button !== 0 && e.button !== 1) return false;
    const t = e.target as HTMLElement;
    if (!t.closest) return false;
    const ctx = view.state.facet(editorCtx);
    const mod = e.metaKey || e.ctrlKey;
    const live = ctx.mode === 'live';
    const wl = t.closest<HTMLElement>('[data-wl-target]');
    if (wl) {
      const widget = wl.classList.contains('cm-lp-wikilink');
      if (mod || widget || e.button === 1) {
        e.preventDefault();
        ctx.hoverEnd();
        const l = linkFromEl(wl);
        ctx.openLink(l.target, { newTab: e.button === 1 || (widget ? mod : e.altKey || e.shiftKey), heading: l.heading, block: l.block });
        return true;
      }
      return false;
    }
    const href = t.closest<HTMLElement>('[data-href]');
    if (href && (mod || (live && href.classList.contains('cm-lp-link')) || (live && href.classList.contains('cm-lp-url') && !lineIsActive(view, href)))) {
      const url = href.dataset.href ?? '';
      if (!url) return false;
      e.preventDefault();
      if (isExternalUrl(url) || /^www\./i.test(url)) window.open(/^www\./i.test(url) ? `https://${url}` : url, '_blank', 'noopener,noreferrer');
      else {
        const m = /^([^#]*?)(?:\.md)?(?:#(.*))?$/.exec(decodeURIComponent(url));
        const frag = m?.[2];
        ctx.openLink(m?.[1] ?? url, { newTab: mod && (e.altKey || e.shiftKey), heading: frag && !frag.startsWith('^') ? frag : undefined, block: frag?.startsWith('^') ? frag.slice(1) : undefined });
      }
      return true;
    }
    const tag = t.closest<HTMLElement>('[data-tag]');
    if (tag && (mod || (live && !lineIsActive(view, tag)))) {
      e.preventDefault();
      ctx.tagClick(tag.dataset.tag ?? '');
      return true;
    }
    return false;
  },
  mousemove(e, view) {
    const t = e.target as HTMLElement;
    if (!t.closest) return false;
    const wl = t.closest<HTMLElement>('[data-wl-target]');
    const ctx = view.state.facet(editorCtx);
    if (wl && (e.metaKey || e.ctrlKey)) ctx.hoverLink(wl, linkFromEl(wl));
    return false;
  },
  mouseout(e, view) {
    const t = e.target as HTMLElement;
    if (!t.closest?.('[data-wl-target]')) return false;
    const to = e.relatedTarget as Node | null;
    if (to && t.contains(to)) return false;
    view.state.facet(editorCtx).hoverEnd();
    return false;
  },
});
