import { ChevronRight, Trash2 } from 'lucide-react';
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
            {['Model', 'Format', 'Quantization', 'Size', 'Context', 'Status', 'Imported', ''].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-3 py-2 font-mono text-[11.5px] font-normal uppercase tracking-[0.08em] text-ink-mute/70 first:pl-4 last:pr-4"
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
              className="group cursor-pointer border-b border-line/30 transition-colors last:border-0 hover:bg-surface2/30"
            >
              <td className="py-2 pl-4 pr-3">
                <div className="truncate text-[13.5px] text-ink">{model.name}</div>
                <div className="truncate text-[12.5px] text-ink-mute">
                  {model.publisher} · {model.parameters} params
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12.5px] text-ink-mute">{model.format}</span>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12.5px] text-ink-dim">{model.quantization}</span>
              </td>
              <td className="px-3 py-2">
                <span className="readout text-[13px] text-ink-dim">
                  {formatBytes(model.sizeBytes, unit)}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="readout text-[12.5px] text-ink-mute">
                  {formatNumber(model.contextWindow / 1024, 0)}K
                </span>
              </td>
              <td className="px-3 py-2">
                <Badge tone={statusTone[model.status]} dot>
                  {model.status}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <span className="whitespace-nowrap font-mono text-[12px] text-ink-mute/80">
                  {formatRelative(model.importedAt)}
                </span>
              </td>
              <td className="py-2 pl-3 pr-4 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={`Remove ${model.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(model);
                    }}
                    className="focus-ring rounded-sm p-1 text-ink-mute/50 opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <ChevronRight className="h-3 w-3 text-ink-mute/30 transition-colors group-hover:text-ink-mute" />
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
