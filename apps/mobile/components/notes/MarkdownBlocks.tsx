/**
 * Reading-mode renderer for notes: Markdown blocks/inlines (from ./markdown)
 * drawn with plain RN <Text>/<View>. Wikilinks, #tags, embeds and task
 * checkboxes are interactive; everything else is static text.
 */
import React, { memo, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, Linking } from 'react-native';
import { Square, CheckSquare, FileText, ChevronRight, ChevronDown } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import type { PropValue, VaultIndex } from '@clearmind/shared/notes';
import { resolveEmbed, isExternalUrl } from '@clearmind/shared/notes/markdown';
import { T } from '../../lib/theme';
import { parseNote, parseInline, previewLines, wikiDisplay, type Block, type Inline } from './markdown';

export interface LinkRef { target: string; heading?: string; block?: string }

export interface MarkdownHandlers {
  onLink: (l: LinkRef) => void;
  onTag: (tag: string) => void;
  onToggleTask?: (line: number) => void;
  /** Top-level heading positions (relative to the renderer's container) for in-note anchors. */
  onHeadingLayout?: (slug: string, y: number) => void;
}

interface Ctx extends MarkdownHandlers { index: VaultIndex; noteId: string; depth: number }

const MONO = { fontFamily: 'monospace' } as const;
const HIGHLIGHT = 'rgba(250, 204, 21, 0.35)';

// ------------------------------------------------------------------ inline

function InlineNodes({ nodes, ctx }: { nodes: Inline[]; ctx: Ctx }) {
  return <>{nodes.map((n, i) => <InlineNode key={i} n={n} ctx={ctx} />)}</>;
}

function InlineNode({ n, ctx }: { n: Inline; ctx: Ctx }) {
  switch (n.t) {
    case 'text': return <>{n.text}</>;
    case 'bold': return <Text style={{ fontWeight: '700' }}><InlineNodes nodes={n.children} ctx={ctx} /></Text>;
    case 'italic': return <Text style={{ fontStyle: 'italic' }}><InlineNodes nodes={n.children} ctx={ctx} /></Text>;
    case 'bolditalic': return <Text style={{ fontWeight: '700', fontStyle: 'italic' }}><InlineNodes nodes={n.children} ctx={ctx} /></Text>;
    case 'strike': return <Text style={{ textDecorationLine: 'line-through' }}><InlineNodes nodes={n.children} ctx={ctx} /></Text>;
    case 'highlight': return <Text style={{ backgroundColor: HIGHLIGHT }}><InlineNodes nodes={n.children} ctx={ctx} /></Text>;
    case 'code': return <Text className="bg-midnight-lighter text-ink" style={[MONO, { fontSize: 13 }]}>{` ${n.text} `}</Text>;
    case 'wikilink':
    case 'embed': {
      const resolved = !n.target || !!ctx.index.resolve(n.target, ctx.noteId);
      return (
        <Text
          className="text-accent font-semibold"
          style={resolved ? undefined : { opacity: 0.6, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
          onPress={() => ctx.onLink({ target: n.target, heading: n.heading, block: n.block })}
          accessibilityRole="link"
          accessibilityLabel={`${resolved ? 'Open' : 'Create'} note ${n.text}`}
        >
          {n.text}
        </Text>
      );
    }
    case 'link':
      return (
        <Text className="text-accent" style={{ textDecorationLine: 'underline' }} onPress={() => openUrl(n.href, ctx)} accessibilityRole="link">
          <InlineNodes nodes={n.children} ctx={ctx} />
        </Text>
      );
    case 'image':
      return <Text className="text-accent" onPress={() => openUrl(n.href, ctx)} accessibilityRole="link">{`[image${n.alt ? `: ${n.alt}` : ''}]`}</Text>;
    case 'tag':
      return (
        <Text className="text-accent bg-accent/10" onPress={() => ctx.onTag(n.tag)} accessibilityRole="button" accessibilityLabel={`Tag ${n.tag}`}>
          {n.text}
        </Text>
      );
  }
}

function openUrl(href: string, ctx: Ctx) {
  if (isExternalUrl(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) { Linking.openURL(href).catch(() => {}); return; }
  // Relative markdown link to a note: [x](Some%20Note.md)
  let target = href;
  try { target = decodeURIComponent(href); } catch { /* keep raw */ }
  const [path, frag] = target.split('#');
  ctx.onLink({ target: path.replace(/\.md$/i, ''), heading: frag && !frag.startsWith('^') ? frag : undefined, block: frag?.startsWith('^') ? frag.slice(1) : undefined });
}

function Rich({ text, ctx, className = 'text-ink', style }: { text: string; ctx: Ctx; className?: string; style?: any }) {
  const nodes = useMemo(() => parseInline(text), [text]);
  return <Text className={`${className} text-[15px] leading-6`} style={style}><InlineNodes nodes={nodes} ctx={ctx} /></Text>;
}

// ------------------------------------------------------------------ blocks

const HEADING_CLS = ['', 'text-2xl font-extrabold', 'text-xl font-bold', 'text-lg font-bold', 'text-base font-bold', 'text-base font-semibold', 'text-sm font-semibold'];

function Blocks({ blocks, ctx }: { blocks: Block[]; ctx: Ctx }) {
  return <>{blocks.map((b, i) => <BlockView key={`${b.line}-${i}`} b={b} ctx={ctx} first={i === 0} />)}</>;
}

function BlockView({ b, ctx, first }: { b: Block; ctx: Ctx; first: boolean }) {
  switch (b.t) {
    case 'heading': {
      const nodes = parseInline(b.text);
      return (
        <View
          className={first ? 'mb-2' : 'mt-4 mb-2'}
          onLayout={ctx.depth === 0 && ctx.onHeadingLayout ? (e) => ctx.onHeadingLayout!(b.slug, e.nativeEvent.layout.y) : undefined}
        >
          <Text className={`text-ink ${HEADING_CLS[b.level]}`} accessibilityRole="header"><InlineNodes nodes={nodes} ctx={ctx} /></Text>
        </View>
      );
    }
    case 'paragraph':
      return <View className="mb-3"><Rich text={b.text} ctx={ctx} /></View>;
    case 'item': {
      const checked = b.task?.checked;
      return (
        <View className="flex-row items-start mb-1.5" style={{ paddingLeft: b.depth * 18 }}>
          {b.task ? (
            <Pressable
              onPress={() => ctx.onToggleTask?.(b.line)}
              disabled={!ctx.onToggleTask}
              hitSlop={8}
              className="mr-2 mt-0.5 active:opacity-60"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!checked }}
              accessibilityLabel={b.text}
            >
              {checked ? <CheckSquare size={20} color={T.accent} /> : <Square size={20} color={T.muted} />}
            </Pressable>
          ) : (
            <Text className="text-ink-muted text-[15px] leading-6 mr-2" style={{ minWidth: b.ordered ? 22 : 12 }}>{b.ordered ? b.marker : '•'}</Text>
          )}
          <View className="flex-1">
            <Rich text={b.text} ctx={ctx} className={checked ? 'text-ink-muted' : 'text-ink'} style={checked ? { textDecorationLine: 'line-through' } : undefined} />
          </View>
        </View>
      );
    }
    case 'quote':
      return (
        <View className="border-l-4 border-line pl-3 mb-3">
          <Blocks blocks={b.children} ctx={{ ...ctx, depth: ctx.depth + 1 }} />
        </View>
      );
    case 'callout':
      return <Callout b={b} ctx={ctx} />;
    case 'code':
      return (
        <ScrollView horizontal className="bg-midnight-lighter rounded-xl mb-3" contentContainerStyle={{ padding: 12 }} showsHorizontalScrollIndicator={false}>
          <Text className="text-ink text-[13px]" style={MONO} selectable>{b.text}</Text>
        </ScrollView>
      );
    case 'hr':
      return <View className="h-px bg-line my-4" />;
    case 'embed':
      return <EmbedCard b={b} ctx={ctx} />;
    case 'table':
      return (
        <ScrollView horizontal className="mb-3" showsHorizontalScrollIndicator={false}>
          <View className="border border-line rounded-lg overflow-hidden">
            {[b.header, ...b.rows].map((row, r) => (
              <View key={r} className={`flex-row ${r === 0 ? 'bg-midnight-lighter' : r % 2 ? '' : 'bg-midnight-light'}`}>
                {b.header.map((_, c) => (
                  <View key={c} className="px-3 py-2 border-r border-line" style={{ minWidth: 96, maxWidth: 220 }}>
                    <Rich text={row[c] ?? ''} ctx={ctx} className={r === 0 ? 'text-ink font-bold' : 'text-ink'} />
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
  }
}

function Callout({ b, ctx }: { b: Extract<Block, { t: 'callout' }>; ctx: Ctx }) {
  const [open, setOpen] = useState(b.callout.fold !== '-');
  const rgb = b.callout.type.color;
  const foldable = !!b.callout.fold;
  return (
    <View className="rounded-xl mb-3 px-3 py-2.5" style={{ backgroundColor: `rgba(${rgb}, 0.12)`, borderLeftWidth: 4, borderLeftColor: `rgb(${rgb})` }}>
      <Pressable
        onPress={foldable ? () => setOpen((o) => !o) : undefined}
        disabled={!foldable}
        className="flex-row items-center"
        accessibilityRole={foldable ? 'button' : undefined}
        accessibilityState={foldable ? { expanded: open } : undefined}
      >
        <Text className="font-bold text-[15px] flex-1" style={{ color: `rgb(${rgb})` }}>
          <InlineNodes nodes={parseInline(b.callout.title)} ctx={ctx} />
        </Text>
        {foldable ? (open ? <ChevronDown size={16} color={`rgb(${rgb})`} /> : <ChevronRight size={16} color={`rgb(${rgb})`} />) : null}
      </Pressable>
      {open && b.children.length ? <View className="mt-1.5"><Blocks blocks={b.children} ctx={{ ...ctx, depth: ctx.depth + 1 }} /></View> : null}
    </View>
  );
}

function EmbedCard({ b, ctx }: { b: Extract<Block, { t: 'embed' }>; ctx: Ctx }) {
  const r = useMemo(() => resolveEmbed(b, (t, from) => ctx.index.resolve(t, from), { fromId: ctx.noteId, depth: ctx.depth, visited: new Set([ctx.noteId]) }), [b, ctx.index, ctx.noteId, ctx.depth]);
  if (r.kind === 'image') {
    if (r.src && isExternalUrl(r.src)) {
      return <Image source={{ uri: r.src }} style={{ width: r.width ?? '100%', height: r.height ?? 200, borderRadius: 12, marginBottom: 12 }} resizeMode="contain" accessibilityLabel={b.target} />;
    }
    return <Text className="text-ink-muted text-sm mb-3">{`[image: ${b.target}]`}</Text>;
  }
  const lines = r.markdown ? previewLines(r.markdown, 6) : [];
  const title = r.note ? (b.heading || b.block ? `${r.note.title} > ${b.heading ?? '^' + b.block}` : r.note.title) : wikiDisplay(b);
  return (
    <Pressable
      onPress={() => ctx.onLink({ target: b.target, heading: b.heading, block: b.block })}
      className="border border-line bg-midnight-light rounded-xl px-3 py-2.5 mb-3 active:opacity-70"
      accessibilityRole="link"
      accessibilityLabel={`${r.kind === 'missing' ? 'Create' : 'Open'} embedded note ${title}`}
    >
      <View className="flex-row items-center mb-1">
        <FileText size={14} color={r.kind === 'missing' ? T.faint : T.accent} />
        <Text className={`ml-1.5 font-semibold text-sm flex-1 ${r.kind === 'missing' ? 'text-ink-muted' : 'text-accent'}`} numberOfLines={1}>{title}</Text>
      </View>
      {r.kind === 'missing' ? (
        <Text className="text-ink-muted text-sm italic">Note not created yet — tap to create</Text>
      ) : r.kind === 'cycle' || r.kind === 'depth' ? (
        <Text className="text-ink-muted text-sm italic">Embedded note</Text>
      ) : lines.length ? (
        lines.map((l, i) => <Text key={i} className="text-ink-muted text-sm leading-5" numberOfLines={2}>{l}</Text>)
      ) : (
        <Text className="text-ink-muted text-sm italic">Empty note</Text>
      )}
    </Pressable>
  );
}

// ------------------------------------------------------------------ properties

const fmtValue = (v: PropValue): string[] => (Array.isArray(v) ? v.map(String) : v === null ? [] : [String(v)]);

export function Properties({ props, onTag }: { props: Record<string, PropValue>; onTag: (t: string) => void }) {
  const keys = Object.keys(props);
  if (!keys.length) return null;
  return (
    <View className="border border-line rounded-xl px-3 py-2 mb-4 bg-midnight-light" accessibilityLabel="Properties">
      {keys.map((k) => {
        const vals = fmtValue(props[k]);
        const isTags = k === 'tags' || k === 'tag';
        return (
          <View key={k} className="flex-row items-start py-1">
            <Text className="text-ink-muted text-xs mt-1 mr-2" style={{ width: 84 }} numberOfLines={1}>{k}</Text>
            <View className="flex-1 flex-row flex-wrap">
              {vals.length ? vals.flatMap((v) => (isTags ? v.split(/[ ,]+/).filter(Boolean) : [v])).map((v, i) => (
                <Pressable
                  key={`${v}-${i}`}
                  onPress={isTags ? () => onTag(v.replace(/^#/, '')) : undefined}
                  disabled={!isTags}
                  className={`px-2 py-0.5 rounded-full mr-1.5 mb-1 ${isTags ? 'bg-accent/15' : 'bg-midnight-lighter'}`}
                  accessibilityRole={isTags ? 'button' : undefined}
                >
                  <Text className={`text-xs ${isTags ? 'text-accent font-semibold' : 'text-ink'}`}>{isTags ? `#${v.replace(/^#/, '')}` : v}</Text>
                </Pressable>
              )) : <Text className="text-ink-muted text-xs mt-1">—</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ root

export const MarkdownBlocks = memo(function MarkdownBlocks({
  note, index, ...handlers
}: { note: Note; index: VaultIndex } & MarkdownHandlers) {
  const parsed = useMemo(() => parseNote(note.content), [note.content]);
  const ctx: Ctx = { ...handlers, index, noteId: note.id, depth: 0 };
  return (
    <View>
      <Properties props={parsed.props} onTag={handlers.onTag} />
      <Blocks blocks={parsed.blocks} ctx={ctx} />
    </View>
  );
});
