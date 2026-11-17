import { Link } from 'react-router-dom';
import {
  ArrowUpRight,
  Atom,
  Cpu,
  FileCode2,
  FlaskConical,
  Layers,
  Lock,
  Waypoints,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { APP_CHANNEL, APP_VERSION } from '@/store/defaults';

const principles = [
  {
    icon: <FlaskConical className="h-3.5 w-3.5" />,
    title: 'Measurement before claims',
    description:
      'Every number carries its provenance. Demonstration values are labelled; nothing is presented as a measured result.',
  },
  {
    icon: <Lock className="h-3.5 w-3.5" />,
    title: 'Local by default',
    description:
      'No account, no backend, no outbound request. Workspace state lives in this browser and nowhere else.',
  },
  {
    icon: <Waypoints className="h-3.5 w-3.5" />,
    title: 'Multi-objective, not magic',
    description:
      'Intelligence, throughput, VRAM, RAM and energy are competing constraints. The objective is explicit, never hidden.',
  },
];

const roadmap = [
  {
    phase: 'Phase 01',
    title: 'Interface foundation',
    status: 'current',
    detail: 'Navigation, library, configuration surfaces, benchmark comparison, activity ledger.',
  },
  {
    phase: 'Phase 02',
    title: 'Native telemetry bridge',
    status: 'next',
    detail: 'Tauri host and Python sidecar exposing real GPU, RAM, CPU and storage counters.',
  },
  {
    phase: 'Phase 03',
    title: 'Optimization engine',
    status: 'planned',
    detail: 'C++/CUDA strategies: adaptive quantization, KV cache, offloading, speculative decoding.',
  },
  {
    phase: 'Phase 04',
    title: 'Reproducible benchmarks',
    status: 'planned',
    detail: 'Signed run manifests, real perplexity and energy measurements, exportable reports.',
  },
] as const;

/** Project and organisation information. */
export function AboutPage() {
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="About RazorResearch"
        subtitle="An independent research lab building open tools for local AI systems."
        actions={
          <Link
            to="/overview"
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface2 px-3 text-[13.5px] text-ink transition-colors hover:border-accent/40 hover:text-accent"
          >
            Open workspace
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        }
      />

      <Card className="mb-3 overflow-hidden">
        <div className="relative px-5 py-6">
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm border border-line bg-surface2/40">
              <Logo markOnly className="[&>svg]:h-8 [&>svg]:w-8" />
            </div>
            <div className="min-w-0">
              <div className="font-mono text-[12px] uppercase tracking-[0.28em] text-accent">
                Adaptive AI Optimization Platform
              </div>
              <h2 className="mt-2 text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink">
                AETHER
              </h2>
              <p className="mt-3 max-w-[78ch] text-[14px] leading-relaxed text-ink-dim">
                AETHER is an open research workspace for local language models. It is designed to
                make the trade-offs between model intelligence, inference speed, memory footprint and
                energy consumption explicit, inspectable and reproducible — starting with a rigorous
                interface, then a real engine.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="accent" mono>
                  v{APP_VERSION}-{APP_CHANNEL}
                </Badge>
                <Badge tone="muted">RazorResearch</Badge>
                <Badge tone="muted">Apache 2.0 — planned</Badge>
                <Badge tone="warn" dot>
                  engine offline
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardHeader title="How this build behaves" />
          <CardBody className="space-y-3">
            {principles.map((principle) => (
              <div key={principle.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line bg-surface2/50 text-accent/80">
                  {principle.icon}
                </span>
                <div>
                  <div className="text-[13.5px] font-medium text-ink">{principle.title}</div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-mute">
                    {principle.description}
                  </p>
                </div>
              </div>
            ))}

            <div className="mt-1 rounded-md border border-line/60 bg-raised/30 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <FileCode2 className="h-3 w-3 text-ink-mute" />
                <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
                  scope of version 0.1
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
                Interface only. No optimization algorithm, quantization pipeline, CUDA kernel,
                inference runtime or filesystem access is implemented. Buttons that would require an
                engine report that it is unavailable.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-5">
          <CardHeader title="From interface to engine" />
          <CardBody className="space-y-2">
            {roadmap.map((item) => (
              <div
                key={item.phase}
                className="rounded-md border border-line/60 bg-raised/30 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-ink-mute">
                    {item.phase}
                  </span>
                  <Badge
                    tone={item.status === 'current' ? 'accent' : item.status === 'next' ? 'glacier' : 'muted'}
                    mono
                  >
                    {item.status}
                  </Badge>
                </div>
                <div className="mt-1.5 text-[13.5px] font-medium text-ink">{item.title}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-mute">{item.detail}</p>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Frontend stack" />
          <CardBody className="space-y-2">
            {[
              ['React + TypeScript', 'strict types, no runtime schema guessing'],
              ['Vite', 'desktop-ready build, Tauri compatible'],
              ['Tailwind tokens', 'two themes from one semantic palette'],
              ['Recharts', 'scientific plots, theme-aware'],
              ['Zustand', 'local workspace state + persistence'],
            ].map(([name, detail]) => (
              <div key={name} className="flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] text-ink-dim">{name}</span>
                <span className="max-w-[58%] text-right text-[12.5px] text-ink-mute">{detail}</span>
              </div>
            ))}
          </CardBody>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="Apache 2.0 (planned)" />
          <CardBody className="space-y-2">
            <p className="text-[13px] leading-relaxed text-ink-dim">
              AETHER is intended to be released under the Apache License 2.0, including an explicit
              patent grant and permissive commercial use. No license file ships with this preview
              build.
            </p>
            <p className="text-[13px] leading-relaxed text-ink-mute">
              Model weights referenced in the demo library belong to their respective publishers and
              are not distributed by RazorResearch.
            </p>
          </CardBody>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader title="RazorResearch" />
          <CardBody className="space-y-3">
            <div className="flex items-center gap-2.5">
              <Atom className="h-4 w-4 text-accent/80" />
              <div>
                <div className="text-[13.5px] text-ink-dim">Independent research laboratory</div>
                <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                  open research · no hosted services
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Cpu className="h-4 w-4 text-ink-mute/70" />
              <div>
                <div className="text-[13.5px] text-ink-dim">Target environment</div>
                <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                  local desktop · cuda-capable gpu
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <Layers className="h-4 w-4 text-ink-mute/70" />
              <div>
                <div className="text-[13.5px] text-ink-dim">Interface build</div>
                <div className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute">
                  v{APP_VERSION}-{APP_CHANNEL} · preview
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
