import { Boxes, ChevronRight, Trash2 } from 'lucide-react';
import type { LocalModel } from '@/types';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Field';
import { formatBytes, formatNumber, formatRelative } from '@/utils/format';
import type { SizeUnit } from '@/types';

const statusTone: Record<LocalModel['status'], BadgeTone> = {
  Ready: 'ok',
  Indexed: 'accent',
  Idle: 'neutral',
  Unavailable: 'danger',
};

interface ModelTableProps {
  models: LocalModel[];
  unit: SizeUnit;
  onOpen: (model: LocalModel) => void;
  onDelete: (model: LocalModel) => void;
}

export function ModelTable({ models, unit, onOpen, onDelete }: ModelTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {['Model', 'Type', 'Quantization', 'Size', 'Context', 'Status', 'Imported', ''].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2 font-mono text-[9px] font-medium uppercase tracking-[0.14em] text-ink-mute first:pl-5 last:pr-4"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr
              key={model.id}
              onClick={() => onOpen(model)}
              className="group cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/40"
            >
              <td className="px-3 py-2.5 pl-5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-line/80 bg-surface2/50 text-ink-mute">
                    <Boxes className="h-3.5 w-3.5" strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-ink">{model.name}</div>
                    <div className="truncate text-[10.5px] text-ink-mute">
                      {model.publisher} · {model.parameters} parameters
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2.5">
                <span className="font-mono text-[10.5px] text-ink-dim">{model.format}</span>
              </td>
              <td className="px-3 py-2.5">
                <Badge tone="muted" mono>
                  {model.quantization}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                <span className="readout text-[11.5px] text-ink-dim">
                  {formatBytes(model.sizeBytes, unit)}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <span className="readout text-[11px] text-ink-mute">
                  {formatNumber(model.contextWindow / 1024, 0)}K
                </span>
              </td>
              <td className="px-3 py-2.5">
                <Badge tone={statusTone[model.status]} dot>
                  {model.status}
                </Badge>
              </td>
              <td className="px-3 py-2.5">
                <span className="whitespace-nowrap font-mono text-[9.5px] text-ink-mute">
                  {formatRelative(model.importedAt)}
                </span>
              </td>
              <td className="px-3 py-2.5 pr-4 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    aria-label={`Remove ${model.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(model);
                    }}
                    className="focus-ring rounded p-1.5 text-ink-mute/60 opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <ChevronRight className="h-3.5 w-3.5 text-ink-mute/40 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-mute" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Format filter used above the model table. */
export function FormatFilter({
  value,
  onChange,
  counts,
}: {
  value: 'all' | 'GGUF' | 'Safetensors';
  onChange: (value: 'all' | 'GGUF' | 'Safetensors') => void;
  counts: { all: number; GGUF: number; Safetensors: number };
}) {
  return (
    <Segmented
      ariaLabel="Filter models by format"
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All', count: counts.all },
        { value: 'GGUF', label: 'GGUF', count: counts.GGUF },
        { value: 'Safetensors', label: 'Safetensors', count: counts.Safetensors },
      ]}
    />
  );
}
