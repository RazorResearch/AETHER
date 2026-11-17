import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, FileUp, FolderSearch, Info, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, ProvenanceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { TextArea, TextInput } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { FormatFilter, ModelTable, type FormatValue } from '@/components/tables/ModelTable';
import { EngineOffline } from '@/components/engine/EngineOffline';
import { api, errorMessage } from '@/api/client';
import type { ModelDetail, ModelSummary } from '@/api/types';
import { formatContext, formatParams } from '@/api/adapters';
import { useAppStore } from '@/store/useAppStore';
import { useEngineStore } from '@/store/useEngineStore';
import { toast } from '@/store/useToastStore';
import { formatBytes, formatDateTime, formatNumber } from '@/utils/format';
import { useT } from '@/i18n';

/** Local model library, owned by the engine. Files are never copied or deleted. */
export function ModelsPage() {
  const models = useEngineStore((s) => s.models);
  const loaded = useEngineStore((s) => s.loaded);
  const connection = useEngineStore((s) => s.connection);
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const unit = useAppStore((s) => s.settings.unit);

  const [query, setQuery] = useState('');
  const [format, setFormat] = useState<FormatValue>('all');
  const [dialog, setDialog] = useState<'import' | 'scan' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ModelSummary | null>(null);
  const online = connection === 'online';
  const t = useT();

  const counts = useMemo(
    () => ({
      all: models.length,
      gguf: models.filter((m) => m.format === 'gguf').length,
      safetensors: models.filter((m) => m.format === 'safetensors').length,
    }),
    [models],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter(
      (m) =>
        (format === 'all' || m.format === format) &&
        (!needle ||
          m.name.toLowerCase().includes(needle) ||
          m.path.toLowerCase().includes(needle) ||
          (m.quantization ?? '').toLowerCase().includes(needle) ||
          (m.architecture ?? '').toLowerCase().includes(needle)),
    );
  }, [models, query, format]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteModel(deleteTarget.id);
      toast.info(t('Model removed'), t('{name} left the library. The file on disk is untouched.', { name: deleteTarget.name }));
      setDeleteTarget(null);
      setDetailId(null);
      await refreshCollections();
    } catch (error) {
      toast.error(t('Removal failed'), errorMessage(error));
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t('Models')}
        subtitle={t('Local model library. Metadata is read from the files by the engine; nothing is copied or downloaded.')}
        meta={<ProvenanceBadge kind={online ? 'live' : 'offline'} />}
        actions={
          <>
            <Button variant="outline" icon={<FolderSearch />} onClick={() => setDialog('scan')} disabled={!online}>
              {t('Scan folder')}
            </Button>
            <Button variant="primary" icon={<FileUp />} onClick={() => setDialog('import')} disabled={!online}>
              {t('Import model')}
            </Button>
          </>
        }
      />

      <EngineOffline />

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {t('Registered models')}
              <span className="readout text-[13px] font-normal text-ink-mute">
                {filtered.length}/{models.length}
              </span>
            </span>
          }
          hint={t('GGUF headers are parsed by the engine (architecture, tensors, quantization).')}
          action={<FormatFilter value={format} onChange={setFormat} counts={counts} />}
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-line/40 px-5 py-2.5">
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Search by name, path, architecture or quantization…')}
            icon={<Search />}
            wrapperClassName="w-full max-w-[380px]"
            aria-label={t('Search models')}
          />
          <span className="ml-auto hidden items-center gap-1.5 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-mute/70 sm:flex">
            <Info className="h-3 w-3" />
            {t('sorted by name')}
          </span>
        </div>

        {online && !loaded ? (
          <CardBody>
            <SkeletonRows rows={4} />
          </CardBody>
        ) : models.length === 0 ? (
          <CardBody>
            <EmptyState
              icon={<Boxes />}
              title={online ? t('Your library is empty') : t('No data — engine offline')}
              description={t('Register a .gguf or .safetensors file already on this machine, or scan a folder.')}
              action={
                <div className="flex gap-2">
                  <Button variant="primary" icon={<FileUp />} onClick={() => setDialog('import')} disabled={!online}>
                    {t('Import model')}
                  </Button>
                  <Button variant="outline" icon={<FolderSearch />} onClick={() => setDialog('scan')} disabled={!online}>
                    {t('Scan folder')}
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
              title={t('No model matches these filters')}
              description={t('Adjust the search term or reset the format filter.')}
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setFormat('all');
                  }}
                >
                  {t('Reset filters')}
                </Button>
              }
            />
          </CardBody>
        ) : (
          <ModelTable
            models={filtered}
            unit={unit}
            onOpen={(m) => setDetailId(m.id)}
            onDelete={setDeleteTarget}
          />
        )}
      </Card>

      {dialog === 'import' && <ImportDialog onClose={() => setDialog(null)} />}
      {dialog === 'scan' && <ScanDialog onClose={() => setDialog(null)} />}
      {detailId && (
        <ModelDetailModal
          id={detailId}
          onClose={() => setDetailId(null)}
          onDelete={(m) => setDeleteTarget(m)}
        />
      )}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title={t('Remove model from library?')}
        kicker={t('confirmation')}
        description={t('The library entry is removed. The file on disk is NOT deleted.')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="danger" icon={<Trash2 />} onClick={() => void confirmDelete()}>
              {t('Remove entry')}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-2.5 rounded-md border border-danger/25 bg-danger/[0.05] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
          <p className="break-all text-[13.5px] leading-relaxed text-ink-dim">
            <span className="text-ink">{deleteTarget?.name}</span> · {deleteTarget?.path}
          </p>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ImportDialog({ onClose }: { onClose: () => void }) {
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const [path, setPath] = useState('');
  const t = useT();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const model = await api.importModel(path.trim().replace(/^"|"$/g, ''), name.trim() || undefined);
      toast.success(t('Model imported'), `${model.name} · ${model.architecture ?? t('unknown arch')} · ${model.quantization ?? ''}`);
      await refreshCollections();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Import a local model')}
      kicker={t('engine · import')}
      description={t('Paste the absolute path of a .gguf or .safetensors file on the engine host. The engine reads its header; the file is never copied, moved or uploaded.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button variant="primary" icon={<FileUp />} onClick={() => void submit()} loading={busy} disabled={!path.trim()}>
            {t('Import')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextInput
          label={t('Absolute file path')}
          placeholder="/home/me/models/qwen2.5-1.5b-instruct-q4_k_m.gguf"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && path.trim() && void submit()}
        />
        <TextInput
          label={t('Display name')}
          hint={t('optional — defaults to general.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {error && <p className="break-words text-[13px] text-danger">{error}</p>}
        <p className="text-[12.5px] leading-relaxed text-ink-mute">
          {t("A browser cannot reveal a file's full path, so it must be typed or pasted (Shift + right-click → “Copy as path” on Windows).")}
        </p>
      </div>
    </Modal>
  );
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const refreshCollections = useEngineStore((s) => s.refreshCollections);
  const configured = useEngineStore((s) => s.health?.config.model_dirs ?? []);
  const t = useT();
  const [dirs, setDirs] = useState(configured.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const list = dirs.split('\n').map((d) => d.trim()).filter(Boolean);
      const res = await api.scanModels(list);
      toast.success(
        t('Scan finished'),
        t('{a} imported · {b} already registered · {c} errors', { a: res.imported.length, b: res.skipped.length, c: res.errors.length }),
      );
      if (res.errors.length) setError(res.errors.map((e) => `${e.path}: ${e.error}`).join('\n'));
      await refreshCollections();
      if (!res.errors.length) onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('Scan folders for models')}
      kicker={t('engine · scan')}
      description={t('Every .gguf / .safetensors file found (3 levels deep) is registered by path.')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Close')}
          </Button>
          <Button variant="primary" icon={<FolderSearch />} onClick={() => void submit()} loading={busy}>
            {t('Scan')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <TextArea
          label={t('Directories')}
          hint={t('one absolute path per line')}
          rows={3}
          value={dirs}
          onChange={(e) => setDirs(e.target.value)}
          placeholder={configured.length ? undefined : t('Empty = AETHER_MODEL_DIRS (not set on this engine)')}
        />
        {error && <pre className="whitespace-pre-wrap break-words text-[12.5px] text-danger">{error}</pre>}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

function ModelDetailModal({
  id,
  onClose,
  onDelete,
}: {
  id: string;
  onClose: () => void;
  onDelete: (m: ModelSummary) => void;
}) {
  const unit = useAppStore((s) => s.settings.unit);
  const [model, setModel] = useState<ModelDetail | null>(null);
  const t = useT();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .model(id)
      .then((m) => alive && setModel(m))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  const a = model?.analysis;
  const ar = a?.architecture;
  const maxLayerBytes = Math.max(1, ...(a?.layers.map((l) => l.nbytes ?? 0) ?? [1]));

  return (
    <Modal
      open
      onClose={onClose}
      title={model?.name ?? t('Model')}
      kicker={model ? `${model.id} · ${model.format}` : t('loading')}
      description={model?.path}
      size="lg"
      footer={
        <>
          {model && (
            <Button variant="danger" icon={<Trash2 />} onClick={() => onDelete(model)} className="mr-auto">
              {t('Remove entry')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('Close')}
          </Button>
        </>
      }
    >
      {error && <p className="text-[13px] text-danger">{error}</p>}
      {!model && !error && <SkeletonRows rows={5} />}
      {model && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={model.status === 'available' ? 'ok' : 'danger'} dot>
              {model.status === 'available' ? t('Available') : t('File missing')}
            </Badge>
            <Badge tone="muted" mono>{model.format}</Badge>
            {model.quantization && <Badge tone="muted" mono>{model.quantization}</Badge>}
            {a?.size_label && <Badge tone="muted">{a.size_label}</Badge>}
            <ProvenanceBadge kind="measured" />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {[
              [t('Architecture'), ar?.architecture],
              [t('Parameters'), formatParams(model.n_params)],
              [t('Size on disk'), formatBytes(model.file_size_bytes, unit)],
              [t('Bits / weight'), a?.quantization.bits_per_weight != null ? formatNumber(a.quantization.bits_per_weight, 3) : null],
              [t('Layers'), ar?.n_layers],
              [t('Embedding'), ar?.embedding_length],
              ['FFN', ar?.feed_forward_length],
              [t('Heads / KV heads'), ar ? `${ar.n_heads ?? '—'} / ${Array.isArray(ar.n_kv_heads) ? t('per-layer') : ar.n_kv_heads ?? '—'}` : null],
              [t('Head dim (K/V)'), ar ? `${ar.key_length ?? '—'} / ${ar.value_length ?? '—'}` : null],
              [t('Context (train)'), formatContext(ar?.context_length)],
              [t('Vocabulary'), ar?.vocab_size],
              [t('RoPE base'), ar?.rope_freq_base != null ? formatNumber(ar.rope_freq_base, 0) : null],
              [t('Experts'), ar?.expert_count != null ? `${ar.expert_used_count ?? '?'} / ${ar.expert_count}` : null],
              [t('Tensors'), a?.n_tensors],
              [t('Fingerprint'), model.fingerprint],
              [t('Registered'), formatDateTime(model.created_at)],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">{label}</dt>
                <dd className="mt-1 break-words text-[13.5px] text-ink-dim">{value ?? '—'}</dd>
              </div>
            ))}
          </dl>

          {a && Object.keys(a.quantization.tensor_type_counts).length > 0 && (
            <div>
              <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
                {t('Tensor type mix')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(a.quantization.tensor_type_counts).map(([t, n]) => (
                  <span key={t} className="rounded border border-line/70 px-1.5 py-[2px] font-mono text-[12px] text-ink-dim">
                    {t} × {n} · {formatBytes(a.quantization.tensor_type_bytes[t] ?? 0, unit)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {a && a.layers.length > 0 && (
            <div>
              <div className="mb-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-ink-mute">
                {t('Bytes per layer ({n} blocks)', { n: a.layers.length })}
              </div>
              <div className="flex h-16 items-end gap-[2px]">
                {a.layers.map((l) => (
                  <div
                    key={l.index}
                    title={`blk.${l.index} · ${formatBytes(l.nbytes ?? 0, unit)} · ${Object.entries(l.types).map(([t, n]) => `${t}×${n}`).join(' ')}`}
                    className="flex-1 bg-accent/60 hover:bg-accent"
                    style={{ height: `${Math.max(4, ((l.nbytes ?? 0) / maxLayerBytes) * 100)}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {a && a.warnings.length > 0 && (
            <ul className="space-y-1 border-l-2 border-warn/60 pl-3 text-[13px] text-ink-dim">
              {a.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p className="text-[12.5px] leading-relaxed text-ink-mute">
            {t('Values marked “—” are not present in the file’s metadata; AETHER does not guess them.')}
          </p>
        </div>
      )}
    </Modal>
  );
}
