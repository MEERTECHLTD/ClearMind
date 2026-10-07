import React, { useMemo, useState } from 'react';
import { MessageSquare, Send, Bot, Trash2 } from 'lucide-react';
import type { ChangeSource, Comment } from '../../types';
import { MONTH_SHORT } from '../../shared/tasks';
import { STORES } from '../../services/db';
import { firebaseService } from '../../services/firebase';
import { useStore } from './store';
import { addComment, deleteComment } from './actions';
import { cx } from './ui';

export const SOURCE_LABEL: Record<ChangeSource, string> = {
  android: 'Android', ios: 'iOS', web: 'web', mcp: 'MCP', api: 'API', cli: 'CLI', widget: 'widget', notification: 'a notification', system: 'ClearMind',
};
export const isAgentSource = (s?: ChangeSource | null) => s === 'mcp' || s === 'api' || s === 'cli';

/** "just now", "5m ago", "3h ago", "2d ago", else "Oct 7, 2026". */
export function timeAgo(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function currentAuthorName(): string | null {
  try { return firebaseService.getCurrentUser()?.displayName ?? null; } catch { return null; }
}

/** Comment thread for a task: list, add (Cmd/Ctrl+Enter), delete. */
export function TaskComments({ taskId }: { taskId: string }) {
  const { items } = useStore<Comment>(STORES.COMMENTS);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const comments = useMemo(
    () => items.filter((c) => !c.deleted && c.taskId === taskId).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '')),
    [items, taskId],
  );

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    try {
      addComment({ taskId, text: t, authorName: currentAuthorName() });
      setText('');
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Could not add comment');
    }
  };

  const remove = (c: Comment) => {
    if (window.confirm(`Delete this comment?\n\n${c.text.slice(0, 120)}${c.text.length > 120 ? '…' : ''}`)) deleteComment(c.id);
  };

  return (
    <section aria-label="Comments">
      <div className={`flex items-center gap-2 text-sm font-semibold mb-1 ${cx.text}`}>
        <MessageSquare size={15} /> Comments
        {comments.length ? <span className={`font-normal ${cx.muted}`}>{comments.length}</span> : null}
      </div>
      {comments.length ? (
        <ul>
          {comments.map((c) => {
            const bot = !!c.agent || isAgentSource(c.source);
            const name = c.agent || c.authorName || (bot ? 'Agent' : 'You');
            const via = c.source && c.source !== 'web' ? `${bot ? 'via' : 'from'} ${SOURCE_LABEL[c.source] ?? c.source}` : '';
            return (
              <li key={c.id} className={`group/comment py-2.5 border-b ${cx.border}`}>
                <div className={`flex items-center gap-1.5 text-[11px] ${cx.muted}`}>
                  {bot ? <Bot size={12} className="text-blue-500" aria-hidden /> : null}
                  <span className={`font-semibold ${cx.text}`}>{name}</span>
                  {via ? <span>{via}</span> : null}
                  <span aria-hidden>·</span>
                  <time dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
                  <span className="flex-1" />
                  <button
                    onClick={() => remove(c)}
                    className={`p-1 rounded ${cx.hover} ${cx.faint} hover:text-red-500 opacity-100 md:opacity-0 md:group-hover/comment:opacity-100 focus:opacity-100`}
                    aria-label="Delete comment"
                    title="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
                <p className={`text-sm mt-0.5 whitespace-pre-wrap break-words ${cx.text}`}>{c.text}</p>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex items-end gap-2 mt-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          placeholder="Add a comment or note"
          rows={2}
          className={`${cx.input} flex-1 resize-y min-h-[2.5rem] max-h-48`}
          aria-label="New comment"
        />
        <button onClick={submit} disabled={!text.trim()} className={`${cx.btnPrimary} h-9 flex items-center gap-1.5`} aria-label="Add comment" title="Add comment (Ctrl/⌘+Enter)">
          <Send size={14} /><span className="hidden sm:inline">Comment</span>
        </button>
      </div>
      {error ? <p className="text-xs text-red-500 mt-1" role="alert">{error}</p> : <p className={`text-[11px] mt-1 ${cx.faint}`}>Ctrl/⌘ + Enter to send</p>}
    </section>
  );
}
