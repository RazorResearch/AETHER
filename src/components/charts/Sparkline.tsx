interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  tone?: 'accent' | 'glacier' | 'ok' | 'warn' | 'danger';
  /** Draws a hairline baseline at the series minimum. */
  showBaseline?: boolean;
}

const colors = {
  accent: 'rgb(var(--c-accent))',
  glacier: 'rgb(var(--c-glacier))',
  ok: 'rgb(var(--c-ok))',
  warn: 'rgb(var(--c-warn))',
  danger: 'rgb(var(--c-danger))',
};

/** Micro trend line. Flat fill, hairline stroke, no gradient. */
export function Sparkline({
  values,
  width = 120,
  height = 28,
  className,
  tone = 'accent',
  showBaseline = false,
}: SparklineProps) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 2 - ((value - min) / span) * (height - 5);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {showBaseline && (
        <line
          x1="0"
          y1={height - 0.5}
          x2={width}
          y2={height - 0.5}
          stroke="rgb(var(--c-line))"
          strokeDasharray="2 3"
        />
      )}
      <polygon points={area} fill={colors[tone]} fillOpacity="0.06" />
      <polyline
        points={line}
        fill="none"
        stroke={colors[tone]}
        strokeWidth="1.1"
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
