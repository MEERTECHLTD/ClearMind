/**
 * "Turn into task" from a Journal entry: the first line becomes the task name
 * (trimmed to a sensible length) and the full entry goes in the description
 * when it says more than the name.
 */
export function entryToTask(content: string): { title: string; description?: string } {
  const text = content.trim();
  const first = (text.split(/\r?\n/).find((l) => l.trim()) ?? '').trim();
  const title = first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first;
  return text !== title ? { title, description: text } : { title };
}
