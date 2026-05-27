// Sparkline.jsx — daily faturamento by hour with subtle amber fill.
function Sparkline({ points, ariaLabel }) {
  const W = 600, H = 80, P = 4;
  const xs = points.map((p, i) => P + (i * (W - P * 2)) / Math.max(points.length - 1, 1));
  const max = Math.max(1, ...points.map((p) => p.y));
  const ys = points.map((p) => H - P - (p.y / max) * (H - P * 2));
  const pathD = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${ys[i].toFixed(2)}`).join(' ');
  const areaD = `${pathD} L ${xs[xs.length - 1].toFixed(2)} ${H - P} L ${xs[0].toFixed(2)} ${H - P} Z`;
  const peakIdx = points.reduce((bi, p, i) => p.y > points[bi].y ? i : bi, 0);

  return (
    <svg className="sparkline-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={ariaLabel} role="img">
      <defs>
        <linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill="url(#spark-fill)" />
      <path d={pathD} fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[peakIdx]} cy={ys[peakIdx]} r="3.5" fill="#fbbf24" stroke="#0b1220" strokeWidth="1.5" />
    </svg>
  );
}

window.Sparkline = Sparkline;
