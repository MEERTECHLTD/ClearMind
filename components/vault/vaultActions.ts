/**
 * Extra vault mutations used by the workspace shell, built on useVault's
 * primitives (kept separate so the data layer stays small).
 */
import type { Note } from '../../types';
import { buildIndex, linkMention, uniqueTitle, type Mention } from '../../shared/notes';
import { createNote, saveContent, getVaultSettings, setVaultSettings } from './useVault';

/** Toggle `- [ ]` ↔ `- [x]` on a 0-based source line. Returns the new content (or null if not a task). */
export function toggleTaskLine(content: string, line: number): string | null {
  const lines = content.split('\n');
  const l = lines[line];
  if (l === undefined) return null;
  const m = /^(\s*[-*+]\s+\[)([ xX])(\].*)$/.exec(l);
  if (!m) return null;
  lines[line] = `${m[1]}${m[2] === ' ' ? 'x' : ' '}${m[3]}`;
  return lines.join('\n');
}

export async function toggleTask(note: Note, line: number) {
  const next = toggleTaskLine(note.content, line);
  if (next !== null) await saveContent(note.id, next);
}

export async function duplicateNote(note: Note, all: Note[]): Promise<Note> {
  const title = uniqueTitle(buildIndex(all), note.title, note.folder ?? null);
  return createNote({ title, folder: note.folder ?? null, content: note.content, kind: note.kind === 'daily' ? 'note' : note.kind });
}

/** Link one unlinked mention of `target` inside `source`. */
export async function linkUnlinked(source: Note, m: Mention, target: Note) {
  await saveContent(source.id, linkMention(source.content, m, target.title));
}

/** Link every unlinked mention in one source note (back to front so offsets stay valid). */
export async function linkAllUnlinked(source: Note, ms: Mention[], target: Note) {
  let c = source.content;
  for (const m of [...ms].sort((a, b) => b.start - a.start)) c = linkMention(c, m, target.title);
  await saveContent(source.id, c);
}

// ------------------------------------------------------------------ sample vault

const SAMPLES: { title: string; folder: string | null; kind?: Note['kind']; content: string }[] = [
  {
    title: 'Welcome', folder: null, content: `---
aliases: [Start here, Home]
tags: [meta]
---
# Welcome to your vault

This is your **second brain**. Notes link to each other with [[Linking your thinking|wikilinks]], and every link shows up in the *Backlinks* panel on the right.

## Where to go next
- Read [[Linking your thinking]] to learn how links work
- See what's planned in [[Projects/ClearMind Roadmap|the roadmap]]
- Capture fleeting ideas in [[Quick capture]]
- Try the Zettelkasten method — this mention isn't linked yet, so it appears under *Unlinked mentions* on that note

> [!tip] Keyboard first
> Press **⌘/Ctrl O** to jump to any note and **⌘/Ctrl P** for every command.

![[Quick capture#Inbox]]

#getting-started
`,
  },
  {
    title: 'Linking your thinking', folder: 'Concepts', content: `---
tags: [pkm/linking]
status: evergreen
---
# Linking your thinking

Links are the heart of a vault. Type \`[[\` to link a note — even one that doesn't exist yet, like [[Evergreen notes]]. Clicking an unresolved link creates it.

- Link to a heading: [[Zettelkasten#Principles]]
- Give a link a different label: [[Welcome|back home]]
- Embed another note with \`![[...]]\`

Ideas compound when they're connected. See also [[Zettelkasten]]. ^compound

#pkm #pkm/linking
`,
  },
  {
    title: 'Zettelkasten', folder: 'Concepts', content: `---
tags: [pkm]
source: Niklas Luhmann
---
# Zettelkasten

A slip-box of small, atomic notes that link to each other.

## Principles
1. One idea per note
2. Write in your own words
3. Always link new notes to existing ones — see [[Linking your thinking]]

> [!note] Origin
> Luhmann wrote ~90,000 cards and 70 books with this system.

#pkm/method
`,
  },
  {
    title: 'ClearMind Roadmap', folder: 'Projects', content: `---
tags: [project]
status: active
due: 2026-12-31
---
# ClearMind Roadmap

## This quarter
- [x] Vault with folders and wikilinks
- [x] Graph view
- [ ] Canvas boards
- [ ] Publish notes to the web #idea

## Notes
Built on the ideas in [[Zettelkasten]] and [[Linking your thinking#Linking your thinking|linking]].

> [!warning] Scope
> Keep the editor fast — performance is a feature.

#project/clearmind
`,
  },
  {
    title: 'Quick capture', folder: null, content: `# Quick capture

## Inbox
- [ ] Read "How to Take Smart Notes" #reading
- [ ] Sketch the weekly review template
- [x] Set up the vault

## Someday
- Learn about spaced repetition — related to [[Evergreen notes]]
`,
  },
  {
    title: 'Reading list', folder: 'Projects', content: `---
tags: [reading]
type: list
---
# Reading list

| Book | Status |
| --- | --- |
| How to Take Smart Notes | reading |
| Building a Second Brain | queued |

- [ ] Finish chapter 3 of *How to Take Smart Notes*
- [ ] Write a literature note on [[Zettelkasten]]

#reading
`,
  },
  {
    title: 'Daily Note', folder: 'Templates', kind: 'template', content: `---
tags: [daily]
created: {{date}}
---
# {{date:dddd, MMMM D}}

## Focus
- [ ]

## Log
- {{time}}

## Links
[[Quick capture]]
`,
  },
  {
    title: 'Meeting', folder: 'Templates', kind: 'template', content: `---
tags: [meeting]
date: {{date}}
attendees: []
---
## Agenda
-

## Notes

## Action items
- [ ]
`,
  },
];

/** Seed a small interlinked example vault (skips titles that already exist). Returns the Welcome note. */
export async function seedSampleNotes(existing: Note[]): Promise<Note | null> {
  const have = new Set(existing.map((n) => `${n.folder ?? ''}/${n.title}`.toLowerCase()));
  let welcome: Note | null = null;
  for (const s of SAMPLES) {
    if (have.has(`${s.folder ?? ''}/${s.title}`.toLowerCase())) continue;
    try {
      const n = await createNote({ title: s.title, folder: s.folder, content: s.content, kind: s.kind ?? 'note' });
      if (s.title === 'Welcome') welcome = n;
      if (s.title === 'Daily Note' && !getVaultSettings().daily.templateId) setVaultSettings({ daily: { ...getVaultSettings().daily, templateId: n.id } });
    } catch { /* clash — skip */ }
  }
  return welcome;
}
