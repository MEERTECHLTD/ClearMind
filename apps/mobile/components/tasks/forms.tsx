import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { Check, Hash, Inbox } from 'lucide-react-native';
import type { Label, Project } from '@clearmind/shared';
import { LIST_COLORS, orderedProjects } from '@clearmind/shared/tasks';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { C } from './theme';
import { createProject, updateProject, createLabel, updateLabel, projectColor, projectSubtree } from '../../services/taskActions';

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" className="my-3">
      {LIST_COLORS.map((c) => (
        <Pressable
          key={c.hex}
          onPress={() => onChange(c.hex)}
          className="w-9 h-9 rounded-full mr-2.5 items-center justify-center"
          style={{ backgroundColor: c.hex }}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === c.hex }}
          accessibilityLabel={c.name}
        >
          {value === c.hex ? <Check size={18} color="#fff" strokeWidth={3} /> : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Create / edit a project: name, colour, optional parent (nesting). */
export function ProjectFormSheet({
  visible, initial, parentId: initialParent, projects, onClose, onSaved,
}: {
  visible: boolean;
  initial?: Project | null;
  parentId?: string | null;
  projects: Project[];
  onClose: () => void;
  onSaved?: (p: Project) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LIST_COLORS[0].hex);
  const [parentId, setParentId] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(initial?.title ?? '');
      setColor(initial ? projectColor(initial) : LIST_COLORS[projects.length % LIST_COLORS.length].hex);
      setParentId(initial ? initial.parentId ?? null : initialParent ?? null);
    }
  }
  // A project can't be nested under itself or its own descendants.
  const blocked = new Set(initial ? projectSubtree(projects, initial.id) : []);
  const parents = orderedProjects(projects).filter(({ project }) => !blocked.has(project.id));

  const save = () => {
    const title = name.trim();
    if (!title) return;
    if (initial) {
      updateProject(initial, { title, color, parentId });
      onSaved?.({ ...initial, title, color, parentId });
    } else {
      onSaved?.(createProject({ title, color, parentId }));
    }
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit project' : 'New project'}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Project name"
        placeholderTextColor="#6b7280"
        autoFocus={!initial}
        className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line"
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Project name"
      />
      <ColorRow value={color} onChange={setColor} />
      <Text className="text-ink-muted text-xs font-semibold mb-1">PARENT PROJECT</Text>
      <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setParentId(null)} className="flex-row items-center py-2.5 active:opacity-60" accessibilityRole="radio" accessibilityState={{ selected: !parentId }}>
          <Inbox size={18} color={C.muted} />
          <Text className="text-ink flex-1 ml-3">No parent</Text>
          {!parentId ? <Check size={18} color={C.accent} /> : null}
        </Pressable>
        {parents.map(({ project, depth }) => (
          <Pressable
            key={project.id}
            onPress={() => setParentId(project.id)}
            className="flex-row items-center py-2.5 active:opacity-60"
            style={{ paddingLeft: depth * 16 }}
            accessibilityRole="radio"
            accessibilityState={{ selected: parentId === project.id }}
          >
            <Hash size={18} color={projectColor(project)} />
            <Text className="text-ink flex-1 ml-3" numberOfLines={1}>{project.title}</Text>
            {parentId === project.id ? <Check size={18} color={C.accent} /> : null}
          </Pressable>
        ))}
      </ScrollView>
      <View className="mt-4 mb-1">
        <Button title={initial ? 'Save' : 'Add project'} onPress={save} disabled={!name.trim()} />
      </View>
    </Sheet>
  );
}

export function LabelFormSheet({
  visible, initial, labels, onClose,
}: { visible: boolean; initial?: Label | null; labels: Label[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(LIST_COLORS[5].hex);
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setName(initial?.name ?? '');
      setColor(initial?.color ?? LIST_COLORS[(labels.length + 5) % LIST_COLORS.length].hex);
    }
  }
  const clean = name.trim().replace(/^[@%]/, '').replace(/\s+/g, '_');
  const dupe = labels.some((l) => l.id !== initial?.id && l.name.toLowerCase() === clean.toLowerCase());
  const save = () => {
    if (!clean || dupe) return;
    if (initial) updateLabel(initial, { name: clean, color });
    else createLabel({ name: clean, color });
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={initial ? 'Edit label' : 'New label'}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Label name"
        placeholderTextColor="#6b7280"
        autoFocus={!initial}
        autoCapitalize="none"
        className="bg-midnight text-ink rounded-xl px-4 py-3 text-base border border-line"
        returnKeyType="done"
        onSubmitEditing={save}
        accessibilityLabel="Label name"
      />
      {dupe ? <Text className="text-red-400 text-xs mt-1.5 ml-1">A label with that name already exists.</Text> : null}
      <ColorRow value={color} onChange={setColor} />
      <View className="mb-1">
        <Button title={initial ? 'Save' : 'Add label'} onPress={save} disabled={!clean || dupe} />
      </View>
    </Sheet>
  );
}
