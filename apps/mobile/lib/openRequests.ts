/**
 * Cross-cutting "open" requests (from notifications, widgets, deep links) that
 * the task UI fulfils once it is mounted. Requests made before mount are queued.
 */
type Req = { type: 'task'; id: string } | { type: 'quickadd'; projectId?: string | null; dueDate?: string | null };
let handler: ((r: Req) => void) | null = null;
const queue: Req[] = [];

export function requestOpen(r: Req) {
  if (handler) handler(r);
  else queue.push(r);
}

export function setOpenHandler(h: ((r: Req) => void) | null) {
  handler = h;
  if (h) while (queue.length) h(queue.shift()!);
}

export type OpenRequest = Req;
