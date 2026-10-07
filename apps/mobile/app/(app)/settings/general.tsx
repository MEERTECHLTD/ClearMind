import { Text } from 'react-native';
import { Home, Sparkles, CalendarDays, CalendarArrowUp, Sofa, Globe, Volume2, MoveRight, MoveLeft, Languages } from 'lucide-react-native';
import type { SwipeAction } from '@clearmind/shared';
import { deviceTimeZone, isValidTimeZone } from '@clearmind/shared/tasks/time';
import { usePreferences } from '../../../hooks/usePreferences';
import { useCollection } from '../../../hooks/useCollection';
import { STORES } from '../../../services/db';
import { SettingsPage, Group, Row, SwitchRow, ChoiceRow } from '../../../components/settings/ui';
import { T } from '../../../lib/theme';
import type { Project } from '@clearmind/shared';

const I = 20;
const SWIPES: { value: SwipeAction; label: string; detail?: string }[] = [
  { value: 'complete', label: 'Complete' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'priority', label: 'Change priority' },
  { value: 'move', label: 'Move to project' },
  { value: 'delete', label: 'Delete', detail: 'With undo' },
  { value: 'none', label: 'Nothing' },
];
const ZONES = ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'].filter(isValidTimeZone);

export default function GeneralSettings() {
  const { prefs, update } = usePreferences();
  const { items: projects } = useCollection<Project>(STORES.PROJECTS);
  const device = deviceTimeZone();
  return (
    <SettingsPage title="General">
      <Group title="Start">
        <ChoiceRow
          icon={<Home size={I} color={T.accent} />}
          label="Home view"
          detail="Where ClearMind opens"
          value={prefs.homeView}
          onChange={(v) => update({ homeView: v as any })}
          choices={[
            { value: 'today', label: 'Today' }, { value: 'inbox', label: 'Inbox' }, { value: 'upcoming', label: 'Upcoming' },
            { value: 'search', label: 'Search' }, { value: 'browse', label: 'Browse' },
            ...projects.filter((p) => !p.archived).slice(0, 30).map((p) => ({ value: `project:${p.id}` as const, label: `# ${p.title}` })),
          ]}
        />
      </Group>

      <Group title="Dates & time" footer="Smart date recognition turns words like “tomorrow 4pm” or “every Monday” into due dates as you type. Turn it off to keep text exactly as written.">
        <SwitchRow icon={<Sparkles size={I} color={T.accent} />} label="Smart date recognition" value={prefs.smartDates} onChange={(v) => update({ smartDates: v })} />
        <ChoiceRow icon={<CalendarDays size={I} color={T.accent} />} label="Start week on" value={prefs.weekStart} onChange={(v) => update({ weekStart: v as 0 | 1 | 6 })}
          choices={[{ value: 1, label: 'Monday' }, { value: 0, label: 'Sunday' }, { value: 6, label: 'Saturday' }]} />
        <ChoiceRow icon={<CalendarArrowUp size={I} color={T.accent} />} label="“Next week” means" value={prefs.nextWeek} onChange={(v) => update({ nextWeek: v })}
          choices={[{ value: 'monday', label: 'Next Monday' }, { value: 'plus7', label: 'Seven days from today' }]} />
        <ChoiceRow icon={<Sofa size={I} color={T.accent} />} label="“Weekend” means" value={prefs.weekend} onChange={(v) => update({ weekend: v })}
          choices={[{ value: 'saturday', label: 'Saturday' }, { value: 'sunday', label: 'Sunday' }]} />
        <ChoiceRow icon={<Globe size={I} color={T.accent} />} label="Time zone" value={prefs.timezone ?? null} onChange={(v) => update({ timezone: v })}
          choices={[{ value: null, label: `Automatic (${device})` }, ...ZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))]} />
      </Group>

      <Group title="Task behaviour">
        <SwitchRow icon={<Volume2 size={I} color={T.accent} />} label="Task completion sound" value={prefs.completeSound} onChange={(v) => update({ completeSound: v })} />
        <ChoiceRow icon={<MoveRight size={I} color={T.accent} />} label="Swipe right" value={prefs.swipeRight} onChange={(v) => update({ swipeRight: v })} choices={SWIPES} />
        <ChoiceRow icon={<MoveLeft size={I} color={T.accent} />} label="Swipe left" value={prefs.swipeLeft} onChange={(v) => update({ swipeLeft: v })} choices={SWIPES} />
      </Group>

      <Group title="Language" footer="More languages are planned.">
        <Row icon={<Languages size={I} color={T.muted} />} label="Language" value="English" />
      </Group>
      <Text className="text-ink-muted text-xs text-center mt-6 mx-8">Preferences sync to every device where you’re signed in.</Text>
    </SettingsPage>
  );
}
