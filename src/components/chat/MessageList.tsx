import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Brain, ChevronDown, Pencil, RefreshCw, Square, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ChatMessage } from '@/api/chat';
import { useChatStore } from '@/store/useChatStore';
import { cn } from '@/utils/cn';
import { formatNumber } from '@/utils/format';
import { CopyButton, Markdown } from './Markdown';

function MetricsLine({ m }: { m: ChatMessage }) {
  const x = m.metrics;
  if (!x) return null;
  const parts = [
    x.engine.tokens_per_s != null ? `${formatNumber(x.engine.tokens_per_s, 1)} tok/s` : null,
    x.wall.ttft_ms != null ? `TTFT ${formatNumber(x.wall.ttft_ms, 0)} ms` : null,
    x.engine.completion_tokens != null ? `${x.engine.completion_tokens} tokens` : null,
    x.wall.total_ms != null ? `${formatNumber(x.wall.total_ms / 1000, 2)} s` : null,
    x.model.quantization,
    `KV ${x.runtime.cache_type_k}/${x.runtime.cache_type_v}`,
  ].filter(Boolean);
  return <span className="font-mono text-[11.5px] text-ink-mute/80">{parts.join(' · ')}</span>;
}

function Assistant({ m, last }: { m: ChatMessage; last: boolean }) {
  const phase = useChatStore((s) => s.phase);
  const regenerate = useChatStore((s) => s.regenerate);
  const [showReasoning, setShowReasoning] = useState(false);
  const generating = m.status === 'generating';
  return (
    <div className="group">
      <div className="mb-1 flex items-center gap-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink-mute">
        <span className="h-1.5 w-1.5 rounded-[1px] bg-accent" /> {m.metrics?.model.name ?? 'assistant'}
        {m.status === 'stopped' && (
          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-warn">
            <Square className="h-2.5 w-2.5" /> stopped
          </span>
        )}
        {m.status === 'error' && (
          <span className="inline-flex items-center gap-1 normal-case tracking-normal text-danger">
            <AlertTriangle className="h-3 w-3" /> error
          </span>
        )}
      </div>
      {m.reasoning && (
        <div className="mb-2 rounded-md border border-line/60 bg-raised/30">
          <button
            type="button"
            onClick={() => setShowReasoning((v) => !v)}
            className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left font-mono text-[12px] text-ink-mute hover:text-ink-dim"
          >
            <Brain className="h-3 w-3" /> reasoning ({m.reasoning.length} chars)
            <ChevronDown className={cn('ml-auto h-3 w-3 transition-transform', showReasoning && 'rotate-180')} />
          </button>
          {(showReasoning || (generating && !m.content)) && (
            <div className="whitespace-pre-wrap border-t border-line/50 px-3 py-2 text-[13px] leading-relaxed text-ink-mute">
              {m.reasoning}
            </div>
          )}
        </div>
      )}
      <div className={cn(generating && 'chat-caret')}>
        {m.content ? <Markdown text={m.content} /> : generating ? null : <span className="text-[13px] text-ink-mute">(empty)</span>}
      </div>
      {!generating && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <MetricsLine m={m} />
          <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            {m.content && <CopyButton text={m.content} />}
            {last && (
              <button
                type="button"
                disabled={phase !== 'idle'}
                onClick={() => void regenerate()}
                className="focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11.5px] text-ink-mute hover:text-ink disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" /> regenerate
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function UserMsg({ m }: { m: ChatMessage }) {
  const phase = useChatStore((s) => s.phase);
  const editAndResend = useChatStore((s) => s.editAndResend);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const persisted = !m.id.startsWith('pending');
  return (
    <div className="group flex justify-end">
      <div className="max-w-[85%]">
        {editing ? (
          <div className="rounded-md border border-accent/40 bg-raised p-2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={Math.min(10, text.split('\n').length + 1)}
              className="w-full min-w-[320px] resize-y bg-transparent text-[14px] text-ink outline-none"
              autoFocus
            />
            <div className="mt-1 flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="primary"
                disabled={!text.trim() || phase !== 'idle'}
                onClick={() => {
                  setEditing(false);
                  void editAndResend(m.id, text);
                }}
              >
                Resubmit
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-line/70 bg-surface2/60 px-3.5 py-2 text-[14px] leading-relaxed text-ink">
            <div className="whitespace-pre-wrap break-words">{m.content}</div>
          </div>
        )}
        {!editing && persisted && (
          <div className="mt-1 flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
            <CopyButton text={m.content} />
            <button
              type="button"
              disabled={phase !== 'idle'}
              onClick={() => {
                setText(m.content);
                setEditing(true);
              }}
              className="focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11.5px] text-ink-mute hover:text-ink disabled:opacity-40"
            >
              <Pencil className="h-3 w-3" /> edit
            </button>
          </div>
        )}
      </div>
      <span className="ml-2 mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-line/70 text-ink-mute">
        <User className="h-3 w-3" />
      </span>
    </div>
  );
}

export function MessageList() {
  const messages = useChatStore((s) => s.messages);
  const phase = useChatStore((s) => s.phase);
  const bottom = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const lastAssistant = messages.map((m) => m.role).lastIndexOf('assistant');

  return (
    <div
      ref={container}
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto"
    >
      <div className="mx-auto max-w-[860px] space-y-6 px-4 py-5">
        {messages.map((m, i) =>
          m.role === 'user' ? <UserMsg key={m.id} m={m} /> : <Assistant key={m.id} m={m} last={i === lastAssistant && phase === 'idle'} />,
        )}
        <div ref={bottom} />
      </div>
    </div>
  );
}
