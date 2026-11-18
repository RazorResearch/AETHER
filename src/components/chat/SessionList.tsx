import { useState } from 'react';
import { Check, MessageSquarePlus, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { chatApi } from '@/api/chat';
import { errorMessage } from '@/api/client';
import { useChatStore } from '@/store/useChatStore';
import { toast } from '@/store/useToastStore';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/format';

/** Conversation history (persisted by the engine in SQLite). */
export function SessionList() {
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeId);
  const phase = useChatStore((s) => s.phase);
  const openSession = useChatStore((s) => s.openSession);
  const refreshSessions = useChatStore((s) => s.refreshSessions);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [toDelete, setToDelete] = useState<string | null>(null);
  const busy = phase !== 'idle';

  const rename = async (id: string) => {
    try {
      await chatApi.renameSession(id, title);
      setEditing(null);
      await refreshSessions();
    } catch (e) {
      toast.error('Rename failed', errorMessage(e));
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await chatApi.deleteSession(toDelete);
      if (toDelete === activeId) await openSession(null);
      setToDelete(null);
      await refreshSessions();
    } catch (e) {
      toast.error('Delete failed', errorMessage(e));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2">
        <Button variant="secondary" className="w-full" icon={<MessageSquarePlus />} onClick={() => void openSession(null)} disabled={busy}>
          New conversation
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {sessions.length === 0 && <p className="px-2 py-3 text-[12.5px] text-ink-mute">No conversation yet.</p>}
        <ul className="space-y-px">
          {sessions.map((s) => (
            <li key={s.id}>
              {editing === s.id ? (
                <div className="flex items-center gap-1 rounded-sm bg-surface2/60 px-1.5 py-1">
                  <input
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void rename(s.id);
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none"
                    aria-label="Conversation title"
                  />
                  <button type="button" onClick={() => void rename(s.id)} aria-label="Save title" className="p-0.5 text-ok">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditing(null)} aria-label="Cancel" className="p-0.5 text-ink-mute">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !busy && void openSession(s.id)}
                  onKeyDown={(e) => e.key === 'Enter' && !busy && void openSession(s.id)}
                  className={cn(
                    'group flex cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1.5 transition-colors',
                    s.id === activeId ? 'bg-surface2/80 text-ink' : 'text-ink-dim hover:bg-surface2/40',
                    busy && s.id !== activeId && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{s.title}</div>
                    <div className="font-mono text-[11px] text-ink-mute/70">
                      {formatRelative(s.updated_at)} · {s.message_count ?? 0} msg
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Rename ${s.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTitle(s.title);
                      setEditing(s.id);
                    }}
                    className="rounded-sm p-1 text-ink-mute opacity-0 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${s.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete(s.id);
                    }}
                    className="rounded-sm p-1 text-ink-mute opacity-0 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <Modal
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Delete conversation?"
        kicker="confirmation"
        description="The conversation, its messages and their stored metrics are deleted from the engine database."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => void remove()}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] text-ink-dim">{sessions.find((s) => s.id === toDelete)?.title}</p>
      </Modal>
    </div>
  );
}
