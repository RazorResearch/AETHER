import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  FileUp,
  FolderOpen,
  Info,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Label, SelectInput, TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { FormatFilter, ModelTable } from '@/components/tables/ModelTable';
import { useAppStore } from '@/store/useAppStore';
import { useMountedLoading } from '@/hooks/useTelemetry';
import { toast } from '@/store/useToastStore';
import type { ImportModelInput } from '@/store/defaults';
import type { LocalModel, ModelFormat } from '@/types';
import { formatBytes, formatDate, formatNumber, formatRelative } from '@/utils/format';
import { cn } from '@/utils/cn';

type FormatValue = 'all' | ModelFormat;

const GIB = 1024 ** 3;

const statusTone = {
  Ready: 'ok',
  Indexed: 'accent',
  Idle: 'neutral',
  Unavailable: 'danger',
} as const;

/** Local model library. All metadata stays in this browser. */
export function ModelsPage() {
  const isLoading = useMountedLoading(380);
  const models = useAppStore((state) => state.models);
  const addModel = useAppStore((state) => state.addModel);
  const removeModel = useAppStore((state) => state.removeModel);
  const unit = useAppStore((state) => state.settings.unit);

  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<FormatValue>('all');
  const [dialog, setDialog] = useState<'import' | 'manual' | null>(null);
  const [detail, setDetail] = useState<LocalModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalModel | null>(null);

  const counts = useMemo(
    () => ({
      all: models.length,
      GGUF: models.filter((model) => model.format === 'GGUF').length,
      Safetensors: models.filter((model) => model.format === 'Safetensors').length,
    }),
    [models],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((model) => {
      const matchesFormat = format === 'all' || model.format === format;
      const matchesQuery =
        needle.length === 0 ||
        model.name.toLowerCase().includes(needle) ||
        model.publisher.toLowerCase().includes(needle) ||
        model.quantization.toLowerCase().includes(needle);
      return matchesFormat && matchesQuery;
    });
  }, [models, query, format]);

  const handleRegister = (input: ImportModelInput) => {
    addModel(input);
    setDialog(null);
    toast.success('Model registered', `${input.name} was added to the local library (metadata only).`);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    removeModel(deleteTarget.id);
    toast.info('Model removed', `${deleteTarget.name} was removed from the library. Files on disk are untouched.`);
    setDeleteTarget(null);
    setDetail(null);
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Models"
        subtitle="Local model library — metadata only, no weights are copied or parsed."
        meta={<ProvenanceBadge />}
        actions={
          <>
            <Button variant="outline" icon={<Plus />} onClick={() => setDialog('manual')}>
              Add manually
            </Button>
            <Button variant="primary" icon={<FileUp />} onClick={() => setDialog('import')}>
              Import model
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              Registered models
              <span className="readout text-[13px] font-normal text-ink-mute">
                {filtered.length}/{models.length}
              </span>
            </span>
          }
          hint="Import is simulated: only the metadata you enter is stored, in localStorage."
          action={<FormatFilter value={format} onChange={setFormat} counts={counts} />}
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, publisher or quantization…"
            icon={<Search />}
            wrapperClassName="w-full max-w-[340px]"
            aria-label="Search models"
          />
          <span className="ml-auto hidden items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute/70 sm:flex">
            <Info className="h-3 w-3" />
            sorted by import date
          </span>
        </div>

        {isLoading ? (
          <CardBody>
            <SkeletonRows rows={6} />
          </CardBody>
        ) : models.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Boxes />}
              title="Your library is empty"
              description="Register a local model to unlock optimization profiles, experiments and benchmark comparisons."
              action={
                <div className="flex gap-2">
                  <Button variant="primary" icon={<FileUp />} onClick={() => setDialog('import')}>
                    Import model
                  </Button>
                  <Button variant="outline" icon={<Plus />} onClick={() => setDialog('manual')}>
                    Add manually
                  </Button>
                </div>
              }
            />
          </CardBody>
        ) : filtered.length === 0 ? (
          <CardBody>
            <EmptyState
              compact
              icon={<SlidersHorizontal />}
              title="No model matches these filters"
              description="Adjust the search term or reset the format filter to see the full library."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setFormat('all');
                  }}
                >
                  Reset filters
                </Button>
              }
            />
          </CardBody>
        ) : (
          <ModelTable models={filtered} unit={unit} onOpen={setDetail} onDelete={setDeleteTarget} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/40 px-5 py-2.5">
          <p className="flex items-center gap-1.5 text-[13px] text-ink-mute">
            <AlertTriangle className="h-3 w-3 text-warn/70" />
            Demonstration metadata — no model files exist on disk.
          </p>
          <span className="font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute/60">
            local storage only
          </span>
        </div>
      </Card>

      {/* ------------------------------- dialogs ------------------------------ */}
      {dialog && (
        <ModelDialog
          key={dialog}
          mode={dialog}
          onClose={() => setDialog(null)}
          onSubmit={handleRegister}
        />
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? 'Model'}
        kicker="model record"
        description={detail ? `${detail.publisher} · ${detail.license}` : undefined}
        size="lg"
        footer={
          <>
            <Button
              variant="danger"
              icon={<Trash2 />}
              onClick={() => {
                setDeleteTarget(detail);
              }}
            >
              Remove entry
            </Button>
            <Button variant="secondary" onClick={() => setDetail(null)}>
              Close
            </Button>
          </>
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[detail.status]} dot>
                {detail.status}
              </Badge>
              <Badge tone="muted" mono>
                {detail.format}
              </Badge>
              <Badge tone="muted" mono>
                {detail.quantization}
              </Badge>
              <Badge tone="muted">{detail.parameters} parameters</Badge>
            </div>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {[
                ['Parameters', detail.parameters],
                ['Format', detail.format],
                ['Quantization', detail.quantization],
                ['Size on disk', formatBytes(detail.sizeBytes, unit)],
                ['Context window', `${formatNumber(detail.contextWindow / 1024, 0)}K tokens`],
                ['License', detail.license],
                ['Registered', formatRelative(detail.importedAt)],
                ['Import date', formatDate(detail.importedAt)],
                ['Model id', detail.id],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-[13.5px] text-ink-dim">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="rounded-md border border-line/70 bg-raised/40 px-3 py-2.5">
              <div className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">Notes</div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-dim">
                {detail.notes ??
                  'No notes for this record. Notes are stored with the model metadata only.'}
              </p>
            </div>

            <p className="text-[13px] leading-relaxed text-ink-mute/80">
              Removing the entry does not touch the filesystem. A native build will unlink files only
              after an explicit confirmation from the local runtime.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Remove model from library?"
        kicker="confirmation"
        description="This removes the entry from your local library. Files on disk are not deleted."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={confirmDelete}>
              Remove model
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger/[0.05] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="text-[13.5px] leading-relaxed text-ink-dim">
            <span className="text-ink">{deleteTarget?.name}</span> will disappear from the library.
            Experiments referencing this model will keep its identifier until they are updated.
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Import / manual registration dialog                                        */
/* -------------------------------------------------------------------------- */

interface ModelDialogProps {
  mode: 'import' | 'manual';
  onClose: () => void;
  onSubmit: (input: ImportModelInput) => void;
}

function ModelDialog({ mode, onClose, onSubmit }: ModelDialogProps) {
  const [name, setName] = useState('');
  const [publisher, setPublisher] = useState('');
  const [parameters, setParameters] = useState('7B');
  const [format, setFormat] = useState<ModelFormat>('GGUF');
  const [quantization, setQuantization] = useState('Q4_K_M');
  const [sizeGiB, setSizeGiB] = useState('4.50');
  const [contextWindow, setContextWindow] = useState('8192');
  const [notes, setNotes] = useState('');
  const [pickedFile, setPickedFile] = useState<{ name: string; size: number } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 1;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension !== 'gguf' && extension !== 'safetensors') {
      setFileError('Unsupported extension — expected .gguf or .safetensors.');
      setPickedFile(null);
      return;
    }
    setFileError(null);
    setPickedFile({ name: file.name, size: file.size });
    const derived = file.name.replace(/\.(gguf|safetensors)$/i, '').replace(/[-_]/g, ' ');
    if (!name) setName(derived);
    setFormat(extension === 'gguf' ? 'GGUF' : 'Safetensors');
    if (file.size > 0) setSizeGiB((file.size / GIB).toFixed(2));
  };

  const submit = () => {
    if (!canSubmit) return;
    const sizeBytes = Math.round(Number.parseFloat(sizeGiB) * GIB);
    onSubmit({
      name,
      publisher,
      parameters,
      parametersB: Number.parseFloat(parameters) || undefined,
      format,
      quantization,
      status: 'Ready',
      sizeBytes,
      contextWindow: Number.parseInt(contextWindow, 10) || 8192,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'import' ? 'Import a local model' : 'Register a model manually'}
      kicker={mode === 'import' ? 'import · simulated' : 'manual entry'}
      description={
        mode === 'import'
          ? 'Select a local file to prefill metadata. The file is never read, copied or transmitted — only the record below is stored.'
          : 'Describe a model that already exists on this machine. Nothing is downloaded.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit} icon={<Plus />}>
            {mode === 'import' ? 'Register model' : 'Add to library'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'import' && (
          <div>
            <Label>Source file</Label>
            <label
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-center transition-colors',
                fileError
                  ? 'border-danger/40 bg-danger/[0.04]'
                  : 'border-line hover:border-accent/40 hover:bg-accent/[0.03]',
              )}
            >
              <input
                type="file"
                accept=".gguf,.safetensors"
                className="sr-only"
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
              {pickedFile ? (
                <>
                  <FolderOpen className="mb-2 h-4 w-4 text-accent" />
                  <span className="text-[13.5px] font-medium text-ink">{pickedFile.name}</span>
                  <span className="mt-1 font-mono text-[12.5px] text-ink-mute">
                    {(pickedFile.size / GIB).toFixed(2)} GiB reported by the file input
                  </span>
                </>
              ) : (
                <>
                  <FileUp className="mb-2 h-4 w-4 text-ink-mute" />
                  <span className="text-[13.5px] font-medium text-ink-dim">
                    Choose a .gguf or .safetensors file
                  </span>
                  <span className="mt-1 text-[13px] text-ink-mute">
                    Reads only name and size — no content is parsed.
                  </span>
                </>
              )}
            </label>
            {fileError && <p className="mt-1.5 text-[13px] text-danger">{fileError}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextInput
            label="Model name"
            placeholder="Llama 3.1 8B Instruct"
            value={name}
            onChange={(event) => setName(event.target.value)}
            wrapperClassName="sm:col-span-2"
            autoFocus
          />
          <TextInput
            label="Publisher"
            placeholder="Meta"
            value={publisher}
            onChange={(event) => setPublisher(event.target.value)}
          />
          <TextInput
            label="Parameters"
            placeholder="8B"
            hint="label"
            value={parameters}
            onChange={(event) => setParameters(event.target.value)}
          />
          <SelectInput
            label="Format"
            value={format}
            onChange={(event) => setFormat(event.target.value as ModelFormat)}
          >
            <option value="GGUF">GGUF</option>
            <option value="Safetensors">Safetensors</option>
          </SelectInput>
          <TextInput
            label="Quantization"
            placeholder="Q4_K_M"
            hint="free text"
            value={quantization}
            onChange={(event) => setQuantization(event.target.value)}
          />
          <TextInput
            label="Size on disk"
            hint="GiB"
            type="number"
            step="0.01"
            min="0"
            value={sizeGiB}
            onChange={(event) => setSizeGiB(event.target.value)}
          />
          <TextInput
            label="Context window"
            hint="tokens"
            type="number"
            step="1024"
            min="512"
            value={contextWindow}
            onChange={(event) => setContextWindow(event.target.value)}
          />
          <TextArea
            label="Notes"
            placeholder="Optional. Stored locally with the record."
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            wrapperClassName="sm:col-span-2"
          />
        </div>

        {!canSubmit && (
          <p className="text-[13px] text-ink-mute">A model name is required to register a record.</p>
        )}
      </div>
    </Modal>
  );
}
