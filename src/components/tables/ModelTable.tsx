import { ChevronRight, Trash2 } from 'lucide-react';
import type { ModelSummary } from '@/api/types';
import { Badge } from '@/components/ui/Badge';
import { Segmented } from '@/components/ui/Field';
import { fileName, formatContext, formatParams } from '@/api/adapters';
import { formatBytes, formatRelative } from '@/utils/format';
import type { SizeUnit } from '@/types';
import { useT } from '@/i18n';

interface ModelTableProps {
  models: ModelSummary[];
  unit: SizeUnit;
  onOpen: (model: ModelSummary) => void;
  onDelete: (model: ModelSummary) => void;
}

export function ModelTable({ models, unit, onOpen, onDelete }: ModelTableProps) {
  const t = useT();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line/70">
            {[t('Model'), t('Arch'), t('Params'), t('Format'), t('Quantization'), t('Size'), t('Context'), t('Status'), t('Imported'), ''].map(
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
              <td className="max-w-[300px] py-2 pl-4 pr-3">
                <div className="truncate text-[13.5px] text-ink">{model.name}</div>
                <div className="truncate font-mono text-[12px] text-ink-mute" title={model.path}>
                  {fileName(model.path)}
                </div>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12.5px] text-ink-mute">{model.architecture ?? '—'}</span>
              </td>
              <td className="px-3 py-2">
                <span className="readout text-[13px] text-ink-dim">{formatParams(model.n_params)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12.5px] uppercase text-ink-mute">{model.format}</span>
              </td>
              <td className="px-3 py-2">
                <span className="font-mono text-[12.5px] text-ink-dim">{model.quantization ?? '—'}</span>
              </td>
              <td className="px-3 py-2">
                <span className="readout text-[13px] text-ink-dim">{formatBytes(model.file_size_bytes, unit)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="readout text-[12.5px] text-ink-mute">{formatContext(model.context_length)}</span>
              </td>
              <td className="px-3 py-2">
                <Badge tone={model.status === 'available' ? 'ok' : 'danger'} dot>
                  {model.status === 'available' ? t('Available') : t('File missing')}
                </Badge>
              </td>
              <td className="px-3 py-2">
                <span className="whitespace-nowrap font-mono text-[12px] text-ink-mute/80">
                  {formatRelative(model.created_at)}
                </span>
              </td>
              <td className="py-2 pl-3 pr-4 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  <button
                    type="button"
                    aria-label={t('Remove {name}', { name: model.name })}
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

export type FormatValue = 'all' | 'gguf' | 'safetensors';

/** Format filter used above the model table. */
export function FormatFilter({
  value,
  onChange,
  counts,
}: {
  value: FormatValue;
  onChange: (value: FormatValue) => void;
  counts: Record<FormatValue, number>;
}) {
  const t = useT();
  return (
    <Segmented
      ariaLabel={t('Filter models by format')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: t('All'), count: counts.all },
        { value: 'gguf', label: 'GGUF', count: counts.gguf },
        { value: 'safetensors', label: 'Safetensors', count: counts.safetensors },
      ]}
    />
  );
}
