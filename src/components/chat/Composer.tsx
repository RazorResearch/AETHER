import { useState } from 'react';
import { ArrowUp, Loader2, Square } from 'lucide-react';
import { useChatStore } from '@/store/useChatStore';
import { cn } from '@/utils/cn';

const phaseLabel = { idle: '', loading: 'loading model…', generating: 'generating…', stopping: 'stopping…' } as const;

export function Composer({ disabledReason }: { disabledReason: string | null }) {
  const phase = useChatStore((s) => s.phase);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const [text, setText] = useState('');
  const busy = phase !== 'idle';

  const submit = () => {
    const t = text.trim();
    if (!t || busy || disabledReason) return;
    setText('');
    void send(t);
  };

  return (
    <div className="border-t border-line/60 bg-base px-4 py-3">
      <div className="mx-auto max-w-[860px]">
        <div className={cn('flex items-end gap-2 rounded-md border bg-raised px-3 py-2', busy ? 'border-accent/30' : 'border-line')}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(8, Math.max(1, text.split('\n').length))}
            placeholder={disabledReason ?? 'Message the local model…  (Enter to send, Shift+Enter for a new line)'}
            disabled={Boolean(disabledReason)}
            aria-label="Message"
            className="max-h-[220px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[14px] leading-relaxed text-ink outline-none placeholder:text-ink-mute/70 disabled:cursor-not-allowed"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void stop()}
              disabled={phase === 'stopping'}
              aria-label="Stop generation"
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-50"
            >
              {phase === 'stopping' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!text.trim() || Boolean(disabledReason)}
              aria-label="Send message"
              className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink text-base hover:bg-ink/85 disabled:opacity-30"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="mt-1 h-4 font-mono text-[11.5px] text-ink-mute">
          {busy && (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> {phaseLabel[phase]}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
