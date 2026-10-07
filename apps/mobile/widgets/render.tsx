'use no memo';
/**
 * Android home-screen widgets (react-native-android-widget). Rendered from the
 * stored snapshot in a headless task. Light/dark follows the user's theme
 * preference (System → the OS appearance).
 */
import React from 'react';
import { Appearance } from 'react-native';
import { FlexWidget, TextWidget, ListWidget, type ColorProp } from 'react-native-android-widget';
import type { WidgetSnapshot, WidgetTask } from '@clearmind/shared/domain';
import type { WidgetInfo } from 'react-native-android-widget';

type Pal = { bg: ColorProp; card: ColorProp; text: ColorProp; muted: ColorProp; line: ColorProp; accent: ColorProp; danger: ColorProp; success: ColorProp };
const DARK: Pal = { bg: '#0F1219', card: '#1A1F2E', text: '#E2E8F0', muted: '#9CA3AF', line: '#1F2937', accent: '#3B82F6', danger: '#F87171', success: '#22C55E' };
const LIGHT: Pal = { bg: '#FFFFFF', card: '#F3F4F6', text: '#111827', muted: '#6B7280', line: '#E5E7EB', accent: '#2563EB', danger: '#DC2626', success: '#16A34A' };
const PRIORITY: Record<number, ColorProp> = { 1: '#F43F5E', 2: '#F59E0B', 3: '#3B82F6', 4: '#9CA3AF' };

function palette(s: WidgetSnapshot | null): Pal {
  const pref = s?.theme ?? 'system';
  const scheme = pref === 'system' ? Appearance.getColorScheme() ?? 'dark' : pref;
  return scheme === 'light' ? LIGHT : DARK;
}

const open = (uri: string) => ({ clickAction: 'OPEN_URI' as const, clickActionData: { uri } });

function Header({ p, title, count, addUri, openUri }: { p: Pal; title: string; count?: string; addUri?: string; openUri: string }) {
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
      <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }} {...open(openUri)}>
        <TextWidget text={title} style={{ fontSize: 16, fontWeight: '700', color: p.text }} />
        {count ? <TextWidget text={`  ${count}`} style={{ fontSize: 13, color: p.muted }} /> : <FlexWidget style={{}} />}
      </FlexWidget>
      {addUri ? (
        <FlexWidget style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: p.accent, justifyContent: 'center', alignItems: 'center' }} {...open(addUri)}>
          <TextWidget text="+" style={{ fontSize: 20, color: '#FFFFFF', fontWeight: '700' }} />
        </FlexWidget>
      ) : <FlexWidget style={{}} />}
    </FlexWidget>
  );
}

function Row({ p, t }: { p: Pal; t: WidgetTask }) {
  const color = PRIORITY[t.priority] ?? PRIORITY[4];
  const meta = [t.overdue ? 'Overdue' : t.due && t.due !== 'Today' ? t.due : null, t.time, t.project].filter(Boolean).join(' · ');
  return (
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', paddingHorizontal: 14, paddingVertical: 8 }} {...open(`clearmind://task/${t.id}`)}>
      <FlexWidget
        style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: color, marginRight: 12 }}
        clickAction="COMPLETE"
        clickActionData={{ taskId: t.id }}
      />
      <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
        <TextWidget text={t.title} maxLines={1} truncate="END" style={{ fontSize: 14, color: p.text }} />
        {meta ? <TextWidget text={meta} maxLines={1} truncate="END" style={{ fontSize: 11, color: t.overdue ? p.danger : p.muted }} /> : <FlexWidget style={{}} />}
      </FlexWidget>
    </FlexWidget>
  );
}

function Shell({ p, children }: { p: Pal; children: React.ReactNode }) {
  return <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 18, flexDirection: 'column' }}>{children}</FlexWidget>;
}

function Empty({ p, text, uri }: { p: Pal; text: string; uri: string }) {
  return (
    <FlexWidget style={{ flex: 1, width: 'match_parent', justifyContent: 'center', alignItems: 'center', padding: 12 }} {...open(uri)}>
      <TextWidget text={text} style={{ fontSize: 13, color: p.muted, textAlign: 'center' }} />
    </FlexWidget>
  );
}

function SignedOut({ p }: { p: Pal }) {
  return <Shell p={p}><Empty p={p} text="Sign in to ClearMind to see your tasks" uri="clearmind://" /></Shell>;
}

export function TodayWidget({ s }: { s: WidgetSnapshot | null }) {
  const p = palette(s);
  if (!s?.signedIn) return <SignedOut p={p} />;
  return (
    <Shell p={p}>
      <Header p={p} title="Today" count={s.today.total ? `${s.today.total}${s.today.overdue ? ` · ${s.today.overdue} overdue` : ''}` : undefined} addUri="clearmind://quickadd?due=today" openUri="clearmind://today" />
      {s.today.tasks.length ? (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {s.today.tasks.map((t) => <Row key={t.id} p={p} t={t} />)}
        </ListWidget>
      ) : <Empty p={p} text="All clear for today ✓" uri="clearmind://today" />}
    </Shell>
  );
}

export function InboxWidget({ s }: { s: WidgetSnapshot | null }) {
  const p = palette(s);
  if (!s?.signedIn) return <SignedOut p={p} />;
  return (
    <Shell p={p}>
      <Header p={p} title="Inbox" count={s.inbox.total ? String(s.inbox.total) : undefined} addUri="clearmind://quickadd?project=inbox" openUri="clearmind://inbox" />
      {s.inbox.tasks.length ? (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {s.inbox.tasks.map((t) => <Row key={t.id} p={p} t={t} />)}
        </ListWidget>
      ) : <Empty p={p} text="Inbox zero — tap + to capture" uri="clearmind://quickadd?project=inbox" />}
    </Shell>
  );
}

export function UpcomingWidget({ s }: { s: WidgetSnapshot | null }) {
  const p = palette(s);
  if (!s?.signedIn) return <SignedOut p={p} />;
  return (
    <Shell p={p}>
      <Header p={p} title="Upcoming" addUri="clearmind://quickadd" openUri="clearmind://upcoming" />
      {s.upcoming.days.length ? (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>
          {s.upcoming.days.flatMap((d) => [
            <FlexWidget key={`h${d.date}`} style={{ width: 'match_parent', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 2 }}>
              <TextWidget text={d.label} style={{ fontSize: 12, fontWeight: '700', color: p.muted }} />
            </FlexWidget>,
            ...d.tasks.map((t) => <Row key={`${d.date}${t.id}`} p={p} t={t} />),
          ])}
        </ListWidget>
      ) : <Empty p={p} text="Nothing scheduled this week" uri="clearmind://upcoming" />}
    </Shell>
  );
}

export function ProductivityWidget({ s }: { s: WidgetSnapshot | null }) {
  const p = palette(s);
  if (!s?.signedIn) return <SignedOut p={p} />;
  const { completedToday, dailyGoal, streak } = s.productivity;
  const pct = Math.min(1, dailyGoal ? completedToday / dailyGoal : 0);
  return (
    <Shell p={p}>
      <FlexWidget style={{ flex: 1, width: 'match_parent', padding: 14, flexDirection: 'column', justifyContent: 'space-between' }} {...open('clearmind://productivity')}>
        <TextWidget text="Momentum" style={{ fontSize: 13, fontWeight: '700', color: p.muted }} />
        <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <TextWidget text={String(completedToday)} style={{ fontSize: 34, fontWeight: '800', color: p.text }} />
          <TextWidget text={` / ${dailyGoal} today`} style={{ fontSize: 13, color: p.muted }} />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 8, borderRadius: 4, backgroundColor: p.card, flexDirection: 'row' }}>
          <FlexWidget style={{ flex: Math.max(0.001, pct), height: 8, borderRadius: 4, backgroundColor: pct >= 1 ? p.success : p.accent }} />
          <FlexWidget style={{ flex: Math.max(0.001, 1 - pct), height: 8 }} />
        </FlexWidget>
        <TextWidget text={streak ? `🔥 ${streak}-day streak` : 'Meet your daily goal to start a streak'} style={{ fontSize: 12, color: p.muted }} />
      </FlexWidget>
    </Shell>
  );
}

export function QuickAddWidget({ s }: { s: WidgetSnapshot | null }) {
  const p = palette(s);
  return (
    <FlexWidget style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.accent, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }} {...open(s?.signedIn ? 'clearmind://quickadd' : 'clearmind://')}>
      <TextWidget text="＋  Add task" style={{ fontSize: 16, fontWeight: '700', color: '#FFFFFF' }} />
    </FlexWidget>
  );
}

export function renderWidgetByName(name: string, s: WidgetSnapshot | null, _info?: WidgetInfo): React.JSX.Element {
  switch (name) {
    case 'Inbox': return <InboxWidget s={s} />;
    case 'Upcoming': return <UpcomingWidget s={s} />;
    case 'Productivity': return <ProductivityWidget s={s} />;
    case 'QuickAdd': return <QuickAddWidget s={s} />;
    default: return <TodayWidget s={s} />;
  }
}
