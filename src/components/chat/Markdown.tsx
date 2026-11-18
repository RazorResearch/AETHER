import { memo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github-dark-dimmed.css';

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1200);
        });
      }}
      className={
        className ??
        'focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11.5px] text-ink-mute hover:text-ink'
      }
      aria-label={label}
      title={label}
    >
      {done ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
      {done ? 'copied' : label.toLowerCase()}
    </button>
  );
}

function Pre({ children }: { children?: ReactNode }) {
  const child = Array.isArray(children) ? children[0] : children;
  const className = (child as { props?: { className?: string } })?.props?.className ?? '';
  const lang = /language-([\w+-]+)/.exec(className)?.[1] ?? 'text';
  return (
    <div className="md-code my-3 overflow-hidden rounded-md border border-line/70 bg-[#1c2128]">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1">
        <span className="font-mono text-[11.5px] uppercase tracking-[0.08em] text-[#adbac7]/70">{lang}</span>
        <CopyButton
          text={textOf(children).replace(/\n$/, '')}
          className="focus-ring inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[11.5px] text-[#adbac7]/70 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto px-3 py-2.5 text-[13px] leading-relaxed">{children}</pre>
    </div>
  );
}

/** Markdown with GFM tables/lists and highlighted, copyable code blocks. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          pre: Pre,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline-offset-2 hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
