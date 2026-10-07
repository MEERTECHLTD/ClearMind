/**
 * Read-only canvas on mobile: canvases (JSON Canvas) are edited on the web; here
 * we list their cards — text cards rendered as markdown, file cards as links,
 * web links as tappable URLs — grouped by canvas group, in reading order.
 */
import { useMemo } from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { FileText, Globe, LayoutDashboard, Monitor } from 'lucide-react-native';
import type { Note } from '@clearmind/shared';
import { parseCanvas, nodesInGroup, canvasColor, type CanvasNode } from '@clearmind/shared/notes/canvas';
import type { VaultIndex } from '@clearmind/shared/notes';
import { MarkdownBlocks, type LinkRef } from './MarkdownBlocks';
import { T } from '../../lib/theme';

const byPosition = (a: CanvasNode, b: CanvasNode) => a.y - b.y || a.x - b.x;

export function CanvasSummary({ note, index, onLink, onTag }: { note: Note; index: VaultIndex; onLink: (l: LinkRef) => void; onTag: (tag: string) => void }) {
  const sections = useMemo(() => {
    const c = parseCanvas(note.content);
    const groups = c.nodes.filter((n) => n.type === 'group').sort(byPosition);
    const placed = new Set<string>();
    const out: { title: string | null; color: string | null; cards: CanvasNode[] }[] = [];
    for (const g of groups) {
      const cards = nodesInGroup(c, g.id).filter((n) => n.type !== 'group' && !placed.has(n.id)).sort(byPosition);
      cards.forEach((n) => placed.add(n.id));
      out.push({ title: g.type === 'group' ? g.label ?? 'Group' : null, color: canvasColor(g.color), cards });
    }
    const rest = c.nodes.filter((n) => n.type !== 'group' && !placed.has(n.id)).sort(byPosition);
    if (rest.length) out.unshift({ title: null, color: null, cards: rest });
    return { sections: out, count: c.nodes.filter((n) => n.type !== 'group').length, edges: c.edges.length };
  }, [note.content]);

  const card = (n: CanvasNode) => {
    const accent = canvasColor(n.color);
    const border = { borderLeftWidth: accent ? 3 : 1, borderLeftColor: accent ?? undefined };
    if (n.type === 'text') {
      return (
        <View key={n.id} className="rounded-xl border border-line bg-midnight-light p-3 mb-2" style={border}>
          <MarkdownBlocks note={{ ...note, kind: 'note', content: n.text }} index={index} onLink={onLink} onTag={onTag} />
        </View>
      );
    }
    if (n.type === 'file') {
      const target = n.file.replace(/\.md$/i, '');
      const resolved = index.resolve(target, note.id);
      return (
        <Pressable key={n.id} onPress={() => onLink({ target, heading: n.subpath?.replace(/^#/, '') || undefined })} className="flex-row items-center rounded-xl border border-line bg-midnight-light p-3 mb-2 active:opacity-70" style={border} accessibilityRole="link" accessibilityLabel={`Open ${resolved?.title ?? target}`}>
          <FileText size={16} color={T.accent} />
          <Text className="text-accent font-semibold ml-2 flex-1" numberOfLines={1}>{resolved?.title ?? target}{n.subpath ?? ''}</Text>
        </Pressable>
      );
    }
    if (n.type === 'link') {
      return (
        <Pressable key={n.id} onPress={() => Linking.openURL(n.url).catch(() => {})} className="flex-row items-center rounded-xl border border-line bg-midnight-light p-3 mb-2 active:opacity-70" style={border} accessibilityRole="link">
          <Globe size={16} color={T.accent} />
          <Text className="text-accent ml-2 flex-1" numberOfLines={1}>{n.url.replace(/^https?:\/\//, '')}</Text>
        </Pressable>
      );
    }
    return null;
  };

  return (
    <View>
      <View className="flex-row items-center rounded-xl border border-line bg-midnight-light px-3 py-2.5 mb-4">
        <LayoutDashboard size={16} color={T.accent} />
        <Text className="text-ink-muted text-xs ml-2 flex-1">Canvas · {sections.count} cards · {sections.edges} connections</Text>
        <Monitor size={14} color={T.faint} />
        <Text className="text-ink-faint text-xs ml-1">Edit on web</Text>
      </View>
      {sections.sections.length === 0 ? <Text className="text-ink-muted italic">This canvas is empty.</Text> : null}
      {sections.sections.map((s, i) => (
        <View key={i} className="mb-3">
          {s.title ? (
            <View className="flex-row items-center mb-2">
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color ?? T.faint }} />
              <Text className="text-ink font-bold ml-2">{s.title}</Text>
            </View>
          ) : null}
          {s.cards.map(card)}
        </View>
      ))}
    </View>
  );
}
