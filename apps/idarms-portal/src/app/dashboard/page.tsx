import { idarmsGet } from '@/lib/api';

interface DashboardMetric {
  id: string;
  date: string;
  totalBilled: string | number;
  totalCollected: string | number;
  propertiesVerified: number;
}

function amount(value: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function CollectionChart({ metrics }: { metrics: DashboardMetric[] }) {
  if (metrics.length === 0) {
    return (
      <div className="chart-empty">
        Collection history will appear here after reporting data is received.
      </div>
    );
  }

  const width = 640;
  const height = 190;
  const padding = { top: 16, right: 12, bottom: 12, left: 12 };
  const values = metrics.map((metric) => Number(metric.totalCollected) || 0);
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = padding.left + (index / Math.max(values.length - 1, 1)) * (width - padding.left - padding.right);
    const y = height - padding.bottom - (value / maximum) * (height - padding.top - padding.bottom);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const area = `${line} L ${points[points.length - 1][0]} ${height - padding.bottom} L ${points[0][0]} ${height - padding.bottom} Z`;
  const labels = metrics.length > 1
    ? [metrics[0], metrics[Math.floor((metrics.length - 1) / 2)], metrics[metrics.length - 1]]
    : [metrics[0]];

  return (
    <div className="chart-wrap">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Total collected over reporting dates">
        <defs>
          <linearGradient id="collection-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#0f766e" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f766e" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.2, 0.45, 0.7, 0.95].map((position) => (
          <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} stroke="#edf1f5" strokeDasharray="4 6" />
        ))}
        <path d={area} fill="url(#collection-fill)" />
        <path d={line} fill="none" stroke="#0f766e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], index) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={values.length < 12 ? 4 : 2.5} fill="#fff" stroke="#0f766e" strokeWidth="2" />
        ))}
      </svg>
      <div className="chart-labels">
        {labels.map((metric) => <span key={metric.id}>{formatDate(metric.date)}</span>)}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const payload = await idarmsGet<{ data: DashboardMetric[] }>('dashboard', '/dashboard/metrics');
  const metrics = (payload?.data ?? [])
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalBilled = metrics.reduce((total, metric) => total + (Number(metric.totalBilled) || 0), 0);
  const totalCollected = metrics.reduce((total, metric) => total + (Number(metric.totalCollected) || 0), 0);
  const propertiesVerified = metrics.reduce((total, metric) => total + (Number(metric.propertiesVerified) || 0), 0);
  const outstanding = totalBilled - totalCollected;
  const collectionRate = totalBilled > 0 ? `${Math.round((totalCollected / totalBilled) * 100)}%` : '—';
  const latestMetric = metrics.at(-1);
  const latestDate = latestMetric ? formatDate(latestMetric.date) : 'No report data yet';
  const metricCards = [
    { label: 'Total billed', value: amount(totalBilled), icon: '↗', tone: 'blue', note: 'Across reported periods' },
    { label: 'Total collected', value: amount(totalCollected), icon: '✓', tone: 'green', note: 'Across reported periods' },
    { label: 'Outstanding', value: amount(outstanding), icon: '◷', tone: 'amber', note: 'Billed less collected' },
    { label: 'Properties verified', value: propertiesVerified.toLocaleString('en-GH'), icon: '⌂', tone: '', note: 'Reported verification activity' },
  ];

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Operational overview</p>
          <h1>Revenue &amp; operations</h1>
          <p className="muted">A clear view of billing, collections, and property verification activity.</p>
        </div>
        <div className="heading-meta"><span>Latest reporting date</span><strong>{latestDate}</strong></div>
      </div>

      <div className="context-strip">
        <span className="context-icon" aria-hidden="true">ⓘ</span>
        <span>
          <strong>Dashboard context</strong>
          Figures are calculated from reporting-service records currently available to this workspace. No sample figures are shown.
        </span>
      </div>

      <div className="metric-grid">
        {metricCards.map((card) => (
          <article className="metric-card" key={card.label}>
            <div className="metric-top">
              <span className="metric-label">{card.label}</span>
              <span className={`metric-icon ${card.tone}`}>{card.icon}</span>
            </div>
            <div className="metric-value">{metrics.length ? card.value : '—'}</div>
            <div className="metric-note">{metrics.length ? card.note : 'Waiting for reporting data'}</div>
          </article>
        ))}
      </div>

      <div className="dashboard-lower">
        <section className="chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Collection trend</h2>
              <p>Reported collections by available reporting date</p>
            </div>
            <span className="legend"><span className="legend-dot" /> Collected</span>
          </div>
          <CollectionChart metrics={metrics} />
        </section>

        <section className="panel" style={{ marginTop: 0 }}>
          <div className="panel-heading">
            <div>
              <h2>Collection snapshot</h2>
              <p>Summary for the data available</p>
            </div>
          </div>
          <div className="summary-list">
            <div className="summary-row">
              <span className="summary-label"><span className="summary-mark">₵</span>Total billed</span>
              <span className="summary-number">{metrics.length ? amount(totalBilled) : '—'}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label"><span className="summary-mark">✓</span>Total collected</span>
              <span className="summary-number">{metrics.length ? amount(totalCollected) : '—'}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label"><span className="summary-mark">%</span>Collection rate</span>
              <span className="summary-number">{metrics.length ? collectionRate : '—'}</span>
            </div>
            <div className="summary-row">
              <span className="summary-label"><span className="summary-mark">◷</span>Reporting dates</span>
              <span className="summary-number">{metrics.length.toLocaleString('en-GH')}</span>
            </div>
          </div>
          <div className="summary-footer">
            Values summarize the reporting records returned by the service; they are not live bank or gateway balances.
          </div>
        </section>
      </div>

      {metrics.length > 0 && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent reporting dates</h2>
              <p>Daily operational figures received by the dashboard</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Total billed</th><th>Total collected</th><th>Properties verified</th></tr>
              </thead>
              <tbody>
                {metrics.slice(-7).reverse().map((metric) => (
                  <tr key={metric.id}>
                    <td>{formatDate(metric.date)}</td>
                    <td>{amount(Number(metric.totalBilled) || 0)}</td>
                    <td>{amount(Number(metric.totalCollected) || 0)}</td>
                    <td>{(Number(metric.propertiesVerified) || 0).toLocaleString('en-GH')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
