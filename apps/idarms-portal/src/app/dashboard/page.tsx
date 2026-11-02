import Link from 'next/link';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  Banknote,
  Building2,
  CircleAlert,
  CreditCard,
  FileText,
  Landmark,
  Map,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import { idarmsGet } from '@/lib/api';

interface DashboardMetric {
  id: string;
  date: string;
  totalBilled: string | number;
  totalCollected: string | number;
  propertiesVerified: number;
}

interface PropertyRecord {
  id: string;
  status: string;
  externalPropertyId?: string;
  reference?: string;
  latitude?: number | null;
  longitude?: number | null;
  gpsCoordinates?: string | null;
}

interface RatepayerRecord { id: string }
interface BillRecord { id: string }
interface PaymentRecord { id: string; amount: string; channel: string; status: string; billId: string }
interface DiscrepancyRecord { id: string; resolved: boolean; reason: string }
interface ValuationRecord { id: string }
interface DocumentRecord { id: string }
interface SyncRecord { id: string; status: string }
interface ConcessionAssemblyRecord { id: string; status: string; rateCount: number; totalCombinations: number; agentCount: number; target: unknown }
interface ConcessionApprovalRecord { id: string; status: string }

function amount(value: number) {
  return new Intl.NumberFormat('en-GH', {
    style: 'currency',
    currency: 'GHS',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function CollectionChart({ metrics }: { metrics: DashboardMetric[] }) {
  if (metrics.length === 0) {
    return <div className="dashboard-chart-empty">Collection history will appear as soon as reporting records are available.</div>;
  }

  const width = 620;
  const height = 190;
  const values = metrics.map((metric) => Number(metric.totalCollected) || 0);
  const maximum = Math.max(...values, 1);
  const points = values.map((value, index) => {
    const x = 12 + (index / Math.max(values.length - 1, 1)) * (width - 24);
    const y = height - 17 - (value / maximum) * (height - 34);
    return [x, y] as const;
  });
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const area = `${line} L ${points.at(-1)?.[0]} ${height - 17} L ${points[0][0]} ${height - 17} Z`;
  const labels = metrics.length > 1 ? [metrics[0], metrics[Math.floor((metrics.length - 1) / 2)], metrics.at(-1)!] : [metrics[0]];

  return (
    <div className="dashboard-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Reported collections over time">
        <defs>
          <linearGradient id="collection-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#247a70" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#247a70" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.2, 0.45, 0.7, 0.95].map((position) => <line key={position} x1="0" x2={width} y1={height * position} y2={height * position} stroke="#edf1f5" strokeDasharray="4 6" />)}
        <path d={area} fill="url(#collection-fill)" />
        <path d={line} fill="none" stroke="#247a70" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], index) => <circle key={`${x}-${y}`} cx={x} cy={y} r={values.length < 12 ? 4 : 2.5} fill="#fff" stroke="#247a70" strokeWidth="2" />)}
      </svg>
      <div className="dashboard-chart-labels">{labels.map((metric) => <span key={metric.id}>{formatDate(metric.date)}</span>)}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const [
    reportPayload,
    propertyPayload,
    ratepayerPayload,
    billPayload,
    paymentPayload,
    discrepancyPayload,
    valuationPayload,
    documentPayload,
    syncPayload,
    concessionPayload,
    approvalPayload,
  ] = await Promise.all([
    idarmsGet<{ data: DashboardMetric[] }>('dashboard', '/dashboard/metrics'),
    idarmsGet<{ data: PropertyRecord[] }>('properties', '/properties'),
    idarmsGet<{ data: RatepayerRecord[] }>('ratepayers', '/ratepayers'),
    idarmsGet<{ data: BillRecord[] }>('bills', '/bills'),
    idarmsGet<{ data: PaymentRecord[] }>('payments', '/payments'),
    idarmsGet<{ data: DiscrepancyRecord[] }>('discrepancies', '/discrepancies'),
    idarmsGet<{ data: ValuationRecord[] }>('valuations', '/valuations'),
    idarmsGet<{ data: DocumentRecord[] }>('documents', '/documents'),
    idarmsGet<{ data: SyncRecord[] }>('sync', '/sync'),
    idarmsGet<{ data: ConcessionAssemblyRecord[] }>('concessions', '/assemblies'),
    idarmsGet<{ data: ConcessionApprovalRecord[] }>('concessions', '/approvals?status=PENDING'),
  ]);

  const metrics = (reportPayload?.data ?? []).slice().sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const properties = propertyPayload?.data ?? [];
  const ratepayers = ratepayerPayload?.data ?? [];
  const bills = billPayload?.data ?? [];
  const payments = paymentPayload?.data ?? [];
  const discrepancies = discrepancyPayload?.data ?? [];
  const valuations = valuationPayload?.data ?? [];
  const documents = documentPayload?.data ?? [];
  const syncRecords = syncPayload?.data ?? [];
  const concessionAssemblies = concessionPayload?.data ?? [];
  const pendingConcessions = (approvalPayload?.data ?? []).filter((approval) => approval.status === 'PENDING');
  const totalBilled = metrics.reduce((total, metric) => total + (Number(metric.totalBilled) || 0), 0);
  const totalCollected = metrics.reduce((total, metric) => total + (Number(metric.totalCollected) || 0), 0);
  const propertiesVerified = properties.filter((property) => property.status === 'VERIFIED').length;
  const openDiscrepancies = discrepancies.filter((item) => !item.resolved).length;
  const syncFailures = syncRecords.filter((record) => record.status === 'FAILED').length;
  const currency = (value: number, available: boolean) => available ? amount(value) : '—';

  const metricsCards = [
    { label: 'Properties registered', value: propertyPayload ? properties.length.toLocaleString('en-GH') : '—', note: propertyPayload ? `${propertiesVerified.toLocaleString('en-GH')} verified in this register` : 'Property service unavailable', icon: Building2, tone: 'blue' },
    { label: 'Ratepayer accounts', value: ratepayerPayload ? ratepayers.length.toLocaleString('en-GH') : '—', note: ratepayerPayload ? 'Accounts in this workspace' : 'Ratepayer service unavailable', icon: UsersRound, tone: 'teal' },
    { label: 'Billed · reported', value: currency(totalBilled, Boolean(reportPayload)), note: reportPayload ? `${metrics.length.toLocaleString('en-GH')} reporting periods` : 'Reporting data unavailable', icon: Banknote, tone: 'amber' },
    { label: 'Collected · reported', value: currency(totalCollected, Boolean(reportPayload)), note: reportPayload ? 'Across reported periods' : 'Reporting data unavailable', icon: CreditCard, tone: 'violet' },
  ];
  const modules = [
    { href: '/properties', title: 'Property register', description: 'Property records and verification', value: propertyPayload ? `${properties.length} records` : 'Service unavailable', icon: Building2 },
    { href: '/ratepayers', title: 'Ratepayer directory', description: 'People, accounts and contacts', value: ratepayerPayload ? `${ratepayers.length} records` : 'Service unavailable', icon: UsersRound },
    { href: '/gis', title: 'GIS & mapping', description: 'Property locations and map links', value: `${properties.filter((property) => (property.latitude != null && property.longitude != null) || property.gpsCoordinates).length} located`, icon: Map },
    { href: '/billing', title: 'Billing', description: 'Issued bills and balances', value: billPayload ? `${bills.length} bills` : 'Service unavailable', icon: FileText },
    { href: '/payments', title: 'Payments', description: 'Collections and payment status', value: paymentPayload ? `${payments.length} payments` : 'Service unavailable', icon: CreditCard },
    { href: '/reconciliation', title: 'Reconciliation', description: 'Review payment discrepancies', value: discrepancyPayload ? `${openDiscrepancies} open` : 'Service unavailable', icon: ArrowDownLeft },
    { href: '/documents', title: 'Documents', description: 'Ratepayer and property files', value: documentPayload ? `${documents.length} documents` : 'Service unavailable', icon: FileText },
    { href: '/valuations', title: 'Valuations', description: 'Property assessments and values', value: valuationPayload ? `${valuations.length} valuations` : 'Service unavailable', icon: Banknote },
    { href: '/sync', title: 'CROIP integration', description: 'Upstream and downstream sync', value: syncPayload ? `${syncFailures} failed` : 'Service unavailable', icon: RefreshCw },
    { href: '/reporting', title: 'Reporting', description: 'Revenue and operations metrics', value: reportPayload ? `${metrics.length} periods` : 'Service unavailable', icon: Activity },
    { href: '/concessions', title: 'Concession management', description: 'Assemblies, rates and approvals', value: concessionPayload ? `${concessionAssemblies.length} assemblies · ${pendingConcessions.length} pending` : 'Service unavailable', icon: Landmark },
  ];

  return (
    <section className="dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <p className="eyebrow">Operations overview</p>
          <h1>Good day. Here’s your workspace.</h1>
          <p>Revenue, property activity and service records — together in one view.</p>
        </div>
        <div className="dashboard-updated"><Activity size={16} aria-hidden="true" /><span><strong>Live service data</strong><small>Figures update from connected iDARMS services</small></span></div>
      </div>

      <div className="dashboard-metrics">
        {metricsCards.map(({ label, value, note, icon: Icon, tone }) => (
          <article className="dashboard-metric-card" key={label}>
            <div className="dashboard-metric-top"><span>{label}</span><span className={`dashboard-metric-icon ${tone}`}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /></span></div>
            <strong className="dashboard-metric-value">{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>

      <div className="dashboard-insights">
        <section className="dashboard-panel collection-panel">
          <div className="dashboard-panel-heading">
            <div><span className="dashboard-section-label">FINANCIAL PERFORMANCE</span><h2>Collections over time</h2><p>Reported totals by available reporting date</p></div>
            <Link href="/billing" className="dashboard-text-link">View billing <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
          <CollectionChart metrics={metrics} />
          <div className="collection-totals">
            <div><span>Total billed</span><strong>{currency(totalBilled, Boolean(reportPayload))}</strong></div>
            <div><span>Total collected</span><strong>{currency(totalCollected, Boolean(reportPayload))}</strong></div>
            <div><span>Outstanding</span><strong>{currency(totalBilled - totalCollected, Boolean(reportPayload))}</strong></div>
          </div>
        </section>

        <section className="dashboard-panel attention-panel">
          <div className="dashboard-panel-heading">
            <div><span className="dashboard-section-label">NEEDS ATTENTION</span><h2>Operations pulse</h2><p>Items surfaced by connected services</p></div>
            <span className="attention-icon"><CircleAlert size={17} aria-hidden="true" /></span>
          </div>
          <Link href="/properties" className="pulse-row"><span className="pulse-icon blue"><Building2 size={16} aria-hidden="true" /></span><span><strong>Properties verified</strong><small>{propertyPayload ? `${propertiesVerified} of ${properties.length} records` : 'Property service unavailable'}</small></span><b>{propertyPayload ? propertiesVerified : '—'}</b></Link>
          <Link href="/reconciliation" className="pulse-row"><span className="pulse-icon amber"><ArrowDownLeft size={16} aria-hidden="true" /></span><span><strong>Open discrepancies</strong><small>{discrepancyPayload ? 'Awaiting reconciliation' : 'Reconciliation service unavailable'}</small></span><b>{discrepancyPayload ? openDiscrepancies : '—'}</b></Link>
          <Link href="/concessions/approvals" className="pulse-row"><span className="pulse-icon amber"><Landmark size={16} aria-hidden="true" /></span><span><strong>Concession approvals</strong><small>{approvalPayload ? 'Rate matrices awaiting an Assembly decision' : 'Concessions service unavailable'}</small></span><b>{approvalPayload ? pendingConcessions.length : '—'}</b></Link>
          <Link href="/sync" className="pulse-row"><span className="pulse-icon rose"><RefreshCw size={16} aria-hidden="true" /></span><span><strong>Sync failures</strong><small>{syncPayload ? 'CROIP integration records' : 'Integration service unavailable'}</small></span><b>{syncPayload ? syncFailures : '—'}</b></Link>
          <Link href="/documents" className="pulse-row"><span className="pulse-icon violet"><FileText size={16} aria-hidden="true" /></span><span><strong>Valuations &amp; documents</strong><small>{valuationPayload && documentPayload ? 'Records available' : 'One or more services unavailable'}</small></span><b>{valuationPayload && documentPayload ? valuations.length + documents.length : '—'}</b></Link>
        </section>
      </div>

      <section className="dashboard-module-section">
        <div className="dashboard-module-heading">
          <div><span className="dashboard-section-label">YOUR IDARMS SERVICES</span><h2>All modules</h2><p>Jump directly into a service workspace.</p></div>
          <Link href="/settings" className="dashboard-text-link">Workspace settings <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <div className="dashboard-module-grid">
          {modules.map(({ href, title, description, value, icon: Icon }) => (
            <Link href={href} className="dashboard-module-card" key={href}>
              <span className="dashboard-module-icon"><Icon size={17} strokeWidth={1.8} aria-hidden="true" /></span>
              <span className="dashboard-module-copy"><strong>{title}</strong><small>{description}</small><em>{value}</em></span>
              <ArrowRight className="module-arrow" size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
