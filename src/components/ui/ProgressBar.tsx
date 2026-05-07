type ProgressBarProps = {
  pct: number;
};

export function ProgressBar({ pct }: ProgressBarProps) {
  const w = Math.min(100, Math.max(0, pct));

  return (
    <div className="progress" role="presentation" aria-hidden="true">
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}
