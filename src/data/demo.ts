import type {
  ActivityEvent,
  BenchmarkMetric,
  BenchmarkRun,
  LocalModel,
  OptimizationStrategy,
  OptimizationTarget,
  TelemetrySnapshot,
} from '@/types';

/* -------------------------------------------------------------------------- */
/* DEMONSTRATION DATA                                                         */
/* Every record in this module is fictional and exists to exercise the UI.    */
/* No model is downloaded, no hardware is detected, no benchmark is executed. */
/* -------------------------------------------------------------------------- */

const GIB = 1024 ** 3;
const gib = (value: number) => Math.round(value * GIB);

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const demoModels: LocalModel[] = [
  {
    id: 'mdl_llama31_8b',
    name: 'Llama 3.1 8B Instruct',
    publisher: 'Meta',
    parameters: '8B',
    parametersB: 8,
    format: 'GGUF',
    quantization: 'Q4_K_M',
    sizeBytes: gib(4.92),
    status: 'Ready',
    contextWindow: 131072,
    importedAt: minutesAgo(38),
    license: 'Llama 3.1 Community License',
    notes: 'Reference model for the balanced optimization profile.',
  },
  {
    id: 'mdl_mistral_7b',
    name: 'Mistral 7B Instruct v0.3',
    publisher: 'Mistral AI',
    parameters: '7B',
    parametersB: 7.3,
    format: 'GGUF',
    quantization: 'Q5_K_M',
    sizeBytes: gib(5.37),
    status: 'Ready',
    contextWindow: 32768,
    importedAt: minutesAgo(190),
    license: 'Apache 2.0',
    notes: 'Long-running baseline for throughput comparisons.',
  },
  {
    id: 'mdl_qwen25_14b',
    name: 'Qwen2.5 14B Instruct',
    publisher: 'Alibaba Cloud',
    parameters: '14B',
    parametersB: 14.7,
    format: 'GGUF',
    quantization: 'Q4_K_M',
    sizeBytes: gib(8.99),
    status: 'Indexed',
    contextWindow: 32768,
    importedAt: minutesAgo(430),
    license: 'Apache 2.0',
  },
  {
    id: 'mdl_phi35_mini',
    name: 'Phi-3.5 Mini Instruct',
    publisher: 'Microsoft',
    parameters: '3.8B',
    parametersB: 3.8,
    format: 'GGUF',
    quantization: 'Q8_0',
    sizeBytes: gib(4.07),
    status: 'Idle',
    contextWindow: 131072,
    importedAt: minutesAgo(1290),
    license: 'MIT',
  },
  {
    id: 'mdl_deepseek_r1_7b',
    name: 'DeepSeek-R1 Distill 7B',
    publisher: 'DeepSeek',
    parameters: '7B',
    parametersB: 7.6,
    format: 'Safetensors',
    quantization: 'BF16',
    sizeBytes: gib(15.21),
    status: 'Ready',
    contextWindow: 65536,
    importedAt: minutesAgo(1620),
    license: 'MIT',
    notes: 'Stored as raw weights; requires conversion before inference.',
  },
  {
    id: 'mdl_gemma2_9b',
    name: 'Gemma 2 9B IT',
    publisher: 'Google DeepMind',
    parameters: '9B',
    parametersB: 9.2,
    format: 'Safetensors',
    quantization: 'BF16',
    sizeBytes: gib(18.49),
    status: 'Unavailable',
    contextWindow: 8192,
    importedAt: minutesAgo(2400),
    license: 'Gemma Terms of Use',
    notes: 'Shard set incomplete — 2 of 5 files present on disk.',
  },
  {
    id: 'mdl_llama32_3b',
    name: 'Llama 3.2 3B Instruct',
    publisher: 'Meta',
    parameters: '3B',
    parametersB: 3.2,
    format: 'GGUF',
    quantization: 'Q4_0',
    sizeBytes: gib(2.01),
    status: 'Ready',
    contextWindow: 131072,
    importedAt: minutesAgo(3100),
    license: 'Llama 3.2 Community License',
  },
];

export const optimizationStrategies: OptimizationStrategy[] = [
  {
    id: 'adaptive-quantization',
    label: 'Adaptive Quantization',
    code: 'AQ',
    description: 'Per-tensor bit-width selection driven by activation sensitivity.',
    detail:
      'Chooses quantization granularity per tensor group from activation outlier statistics instead of applying a single global bit-width. Sensitivity scores are illustrative until the engine lands.',
    maturity: 'Preview',
    tags: ['4-bit', '8-bit', 'Sensitivity'],
  },
  {
    id: 'kv-cache-optimization',
    label: 'KV Cache Optimization',
    code: 'KVC',
    description: 'Compress the key/value cache to extend usable context.',
    detail:
      'Pages the attention cache and stores keys/values at reduced precision. Primarily lowers VRAM growth at long context lengths.',
    maturity: 'Preview',
    tags: ['Context', 'VRAM'],
  },
  {
    id: 'layer-wise-precision',
    label: 'Layer-wise Precision',
    code: 'LWP',
    description: 'Assign mixed precision to individual transformer layers.',
    detail:
      'Keeps numerically sensitive layers (embeddings, first/last blocks) at higher precision while compressing tolerant blocks.',
    maturity: 'Preview',
    tags: ['Mixed precision'],
  },
  {
    id: 'structured-pruning',
    label: 'Structured Pruning',
    code: 'PRN',
    description: 'Drop redundant attention heads and channels.',
    detail:
      'Ranks heads and intermediate channels by contribution, then removes contiguous groups so the resulting graph stays dense and fast.',
    maturity: 'Planned',
    tags: ['Sparsity', 'Accuracy risk'],
  },
  {
    id: 'speculative-decoding',
    label: 'Speculative Decoding',
    code: 'SPD',
    description: 'Draft-model assisted decoding for higher throughput.',
    detail:
      'A smaller draft model proposes token spans that the target model verifies in a single pass. Trades additional VRAM for tokens per second.',
    maturity: 'Planned',
    tags: ['Latency', 'Extra VRAM'],
  },
  {
    id: 'memory-optimization',
    label: 'Memory Optimization',
    code: 'MEM',
    description: 'Buffer reuse and weight streaming under a RAM ceiling.',
    detail:
      'Reuses activation buffers and streams cold weights from disk to satisfy a hard RAM constraint at a small latency cost.',
    maturity: 'Preview',
    tags: ['RAM', 'Streaming'],
  },
  {
    id: 'cpu-gpu-offloading',
    label: 'CPU / GPU Offloading',
    code: 'OFF',
    description: 'Place layers across GPU VRAM and system memory.',
    detail:
      'Solves a layer placement problem against the VRAM budget; offloaded layers run on CPU and dominate generation time.',
    maturity: 'Preview',
    tags: ['Placement', 'Speed'],
  },
];

export const optimizationTargets: OptimizationTarget[] = [
  {
    id: 'max-intelligence',
    label: 'Maximum Intelligence',
    description: 'Preserve evaluation quality; spend memory and latency where it matters.',
    weights: { intelligence: 0.7, speed: 0.15, memory: 0.15 },
  },
  {
    id: 'balanced',
    label: 'Balanced Performance',
    description: 'Equal pressure on quality, throughput and memory footprint.',
    weights: { intelligence: 0.4, speed: 0.35, memory: 0.25 },
  },
  {
    id: 'min-memory',
    label: 'Minimum Memory',
    description: 'Fit the tightest VRAM/RAM envelope, accepting quality trade-offs.',
    weights: { intelligence: 0.2, speed: 0.25, memory: 0.55 },
  },
];

export const demoActivity: ActivityEvent[] = [
  {
    id: 'act_01',
    timestamp: minutesAgo(4),
    category: 'System',
    type: 'engine.status',
    description: 'Optimization engine reported unavailable — interface running in preview mode.',
    status: 'Warning',
  },
  {
    id: 'act_02',
    timestamp: minutesAgo(12),
    category: 'Benchmark',
    type: 'benchmark.completed',
    description: 'Throughput sweep completed for Mistral 7B Instruct · demo data.',
    status: 'Success',
  },
  {
    id: 'act_03',
    timestamp: minutesAgo(38),
    category: 'Model',
    type: 'model.import',
    description: 'Llama 3.1 8B Instruct added to the local library (Q4_K_M · 4.92 GiB).',
    status: 'Success',
  },
  {
    id: 'act_04',
    timestamp: minutesAgo(74),
    category: 'Optimization',
    type: 'profile.created',
    description: 'Optimization profile "Balanced · 8 GB VRAM ceiling" created.',
    status: 'Info',
  },
  {
    id: 'act_05',
    timestamp: minutesAgo(96),
    category: 'Experiment',
    type: 'experiment.started',
    description: 'Experiment EXP-014 "KV cache precision sweep" moved to running.',
    status: 'Info',
  },
  {
    id: 'act_06',
    timestamp: minutesAgo(140),
    category: 'Experiment',
    type: 'experiment.failed',
    description: 'Experiment EXP-011 aborted — draft model checkpoint missing.',
    status: 'Failed',
  },
  {
    id: 'act_07',
    timestamp: minutesAgo(190),
    category: 'Model',
    type: 'model.index',
    description: 'Mistral 7B Instruct v0.3 metadata indexed.',
    status: 'Success',
  },
  {
    id: 'act_08',
    timestamp: minutesAgo(255),
    category: 'System',
    type: 'telemetry.simulated',
    description: 'Hardware telemetry refreshed from the simulation layer.',
    status: 'Info',
  },
  {
    id: 'act_09',
    timestamp: minutesAgo(430),
    category: 'Model',
    type: 'model.import',
    description: 'Qwen2.5 14B Instruct added to the local library (Q4_K_M · 8.99 GiB).',
    status: 'Success',
  },
  {
    id: 'act_10',
    timestamp: minutesAgo(610),
    category: 'Optimization',
    type: 'profile.draft',
    description: 'Draft strategy set saved: AQ + KVC + OFF.',
    status: 'Info',
  },
  {
    id: 'act_11',
    timestamp: minutesAgo(1290),
    category: 'Model',
    type: 'model.import',
    description: 'Phi-3.5 Mini Instruct added to the local library (Q8_0 · 4.07 GiB).',
    status: 'Success',
  },
  {
    id: 'act_12',
    timestamp: minutesAgo(1470),
    category: 'Benchmark',
    type: 'benchmark.export',
    description: 'Report exported: aether-benchmark-demo.json.',
    status: 'Success',
  },
];

/** Simulated performance trend, tokens/second on a fixed 14-day window. */
export const performanceSeries = [
  { day: 'Nov 03', llama: 41.2, mistral: 47.8, qwen: 26.4 },
  { day: 'Nov 04', llama: 42.0, mistral: 48.1, qwen: 27.0 },
  { day: 'Nov 05', llama: 41.6, mistral: 49.4, qwen: 26.8 },
  { day: 'Nov 06', llama: 43.4, mistral: 49.0, qwen: 27.9 },
  { day: 'Nov 07', llama: 44.1, mistral: 50.2, qwen: 28.3 },
  { day: 'Nov 08', llama: 43.8, mistral: 51.6, qwen: 28.1 },
  { day: 'Nov 09', llama: 45.6, mistral: 52.0, qwen: 29.4 },
  { day: 'Nov 10', llama: 46.9, mistral: 51.4, qwen: 30.0 },
  { day: 'Nov 11', llama: 46.2, mistral: 53.1, qwen: 29.8 },
  { day: 'Nov 12', llama: 48.3, mistral: 54.6, qwen: 31.2 },
  { day: 'Nov 13', llama: 49.1, mistral: 55.0, qwen: 31.6 },
  { day: 'Nov 14', llama: 48.6, mistral: 56.2, qwen: 32.4 },
  { day: 'Nov 15', llama: 50.4, mistral: 57.1, qwen: 33.0 },
  { day: 'Nov 16', llama: 51.8, mistral: 58.4, qwen: 33.9 },
];

export const performanceSeriesMeta = [
  { key: 'llama', label: 'Llama 3.1 8B', color: 'accent' },
  { key: 'mistral', label: 'Mistral 7B', color: 'glacier' },
  { key: 'qwen', label: 'Qwen2.5 14B', color: 'ok' },
] as const;

/** Metric catalogue used by the benchmark comparison view. */
export function benchmarkMetricsForRun(runId: string): BenchmarkMetric[] {
  if (runId === 'run_mistral') {
    return [
      {
        id: 'tps',
        label: 'Tokens per second',
        unit: 'tok/s',
        description: 'Decode throughput measured on a 512-token generation, batch size 1.',
        betterWhen: 'higher',
        original: 47.9,
        optimized: 62.4,
      },
      {
        id: 'ttft',
        label: 'Time to first token',
        unit: 'ms',
        description: 'Latency between request submission and the first emitted token.',
        betterWhen: 'lower',
        original: 388,
        optimized: 291,
      },
      {
        id: 'vram',
        label: 'Peak VRAM',
        unit: 'GiB',
        description: 'Maximum GPU memory resident during the generation window.',
        betterWhen: 'lower',
        original: 12.2,
        optimized: 7.4,
      },
      {
        id: 'ram',
        label: 'Peak RAM',
        unit: 'GiB',
        description: 'Maximum host memory used by the runtime process tree.',
        betterWhen: 'lower',
        original: 19.6,
        optimized: 11.9,
      },
      {
        id: 'ppl',
        label: 'Perplexity',
        unit: 'PPL',
        description: 'Language modelling perplexity on the held-out calibration slice (lower is better).',
        betterWhen: 'lower',
        original: 5.18,
        optimized: 5.36,
      },
      {
        id: 'accuracy',
        label: 'Benchmark accuracy',
        unit: '%',
        description: 'Aggregate score across reasoning and reading-comprehension probes.',
        betterWhen: 'higher',
        original: 68.4,
        optimized: 67.1,
      },
      {
        id: 'energy',
        label: 'Energy consumption',
        unit: 'Wh/1k tok',
        description: 'Illustrative wall-power estimate normalized per 1,000 generated tokens.',
        betterWhen: 'lower',
        original: 1.74,
        optimized: 1.21,
      },
    ];
  }

  return [
    {
      id: 'tps',
      label: 'Tokens per second',
      unit: 'tok/s',
      description: 'Decode throughput measured on a 512-token generation, batch size 1.',
      betterWhen: 'higher',
      original: 46.2,
      optimized: 71.8,
    },
    {
      id: 'ttft',
      label: 'Time to first token',
      unit: 'ms',
      description: 'Latency between request submission and the first emitted token.',
      betterWhen: 'lower',
      original: 412,
      optimized: 268,
    },
    {
      id: 'vram',
      label: 'Peak VRAM',
      unit: 'GiB',
      description: 'Maximum GPU memory resident during the generation window.',
      betterWhen: 'lower',
      original: 14.8,
      optimized: 8.9,
    },
    {
      id: 'ram',
      label: 'Peak RAM',
      unit: 'GiB',
      description: 'Maximum host memory used by the runtime process tree.',
      betterWhen: 'lower',
      original: 21.4,
      optimized: 12.7,
    },
    {
      id: 'ppl',
      label: 'Perplexity',
      unit: 'PPL',
      description: 'Language modelling perplexity on the held-out calibration slice (lower is better).',
      betterWhen: 'lower',
      original: 5.42,
      optimized: 5.58,
    },
    {
      id: 'accuracy',
      label: 'Benchmark accuracy',
      unit: '%',
      description: 'Aggregate score across reasoning and reading-comprehension probes.',
      betterWhen: 'higher',
      original: 71.3,
      optimized: 70.6,
    },
    {
      id: 'energy',
      label: 'Energy consumption',
      unit: 'Wh/1k tok',
      description: 'Illustrative wall-power estimate normalized per 1,000 generated tokens.',
      betterWhen: 'lower',
      original: 1.86,
      optimized: 1.12,
    },
  ];
}

export const benchmarkRuns: BenchmarkRun[] = [
  {
    id: 'run_llama',
    label: 'Llama 3.1 8B · adaptive profile',
    modelName: 'Llama 3.1 8B Instruct',
    originalVariant: 'Q4_K_M · baseline',
    optimizedVariant: 'AQ + KVC + LWP · demo',
    capturedAt: minutesAgo(52),
  },
  {
    id: 'run_mistral',
    label: 'Mistral 7B · memory profile',
    modelName: 'Mistral 7B Instruct v0.3',
    originalVariant: 'Q5_K_M · baseline',
    optimizedVariant: 'KVC + MEM + OFF · demo',
    capturedAt: minutesAgo(212),
  },
];

/** Normalized 0–100 quality/throughput scores for the radar view. */
export const benchmarkRadar = [
  { axis: 'Throughput', original: 52, optimized: 81 },
  { axis: 'Latency', original: 58, optimized: 78 },
  { axis: 'VRAM', original: 44, optimized: 82 },
  { axis: 'RAM', original: 47, optimized: 79 },
  { axis: 'Quality', original: 78, optimized: 75 },
  { axis: 'Energy', original: 49, optimized: 77 },
];

/* ---------------------------- simulated telemetry ------------------------- */

const jitter = (value: number, amount: number) =>
  Math.round((value + (Math.random() - 0.5) * amount) * 100) / 100;

/**
 * Produces a *simulated* telemetry snapshot.
 *
 * The browser cannot read GPU counters. This generator is the placeholder the
 * future Tauri/Python telemetry bridge will replace (see utils/systemBridge.ts).
 */
export function createTelemetrySnapshot(): TelemetrySnapshot {
  const vramTotal = 24;
  const ramTotal = 32;
  const diskTotal = 1024;
  const cores = 16;

  return {
    capturedAt: new Date().toISOString(),
    gpuName: 'Simulated GPU · 24 GiB class',
    vramUsedGb: jitter(15.4, 2.6),
    vramTotalGb: vramTotal,
    gpuUtilization: Math.round(jitter(72, 18)),
    gpuTemperatureC: Math.round(jitter(68, 8)),
    cpuName: 'Simulated CPU · 16-core class',
    cpuCores: cores,
    cpuUtilization: Math.round(jitter(38, 22)),
    ramUsedGb: jitter(18.7, 2.2),
    ramTotalGb: ramTotal,
    diskUsedGb: 412,
    diskTotalGb: diskTotal,
    coreLoad: Array.from({ length: cores }, () => Math.round(jitter(38, 46))).map((value) =>
      Math.min(99, Math.max(3, value)),
    ),
  };
}
