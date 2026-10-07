import { Inbox, Flag, Sparkles } from 'lucide-react-native';
import type { Project } from '@clearmind/shared';
import { usePreferences } from '../../../hooks/usePreferences';
import { useCollection } from '../../../hooks/useCollection';
import { STORES } from '../../../services/db';
import { SettingsPage, Group, ChoiceRow, SwitchRow } from '../../../components/settings/ui';
import { T } from '../../../lib/theme';

export default function QuickAddSettings() {
  const { prefs, update } = usePreferences();
  const { items: projects } = useCollection<Project>(STORES.PROJECTS);
  return (
    <SettingsPage title="Quick Add">
      <Group title="Defaults" footer="Used when you don’t pick something yourself. Screen context (e.g. adding from a project) still wins.">
        <ChoiceRow icon={<Inbox size={20} color={T.accent} />} label="Default project" value={prefs.quickAddProjectId ?? null} onChange={(v) => update({ quickAddProjectId: v })}
          choices={[{ value: null, label: 'Inbox' }, ...projects.filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.title }))]} />
        <ChoiceRow icon={<Flag size={20} color={T.accent} />} label="Default priority" value={prefs.quickAddPriority} onChange={(v) => update({ quickAddPriority: v })}
          choices={[{ value: 'None', label: 'Priority 4 (none)' }, { value: 'Low', label: 'Priority 3' }, { value: 'Medium', label: 'Priority 2' }, { value: 'High', label: 'Priority 1' }]} />
      </Group>
      <Group footer="Recognises dates, times, repeats, p1–p4, #project, @label, reminders (!30m) and durations (for 1h) as you type. Recognised parts are shown as chips you can undo.">
        <SwitchRow icon={<Sparkles size={20} color={T.accent} />} label="Parse natural language" value={prefs.quickAddParse} onChange={(v) => update({ quickAddParse: v })} />
      </Group>
    </SettingsPage>
  );
}
