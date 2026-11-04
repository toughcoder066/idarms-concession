import { ApprovalQueue } from '@/components/approval-queue';
import { getConcessionAccess } from '@/lib/access';
import { currentFiscalYear, getApprovals, getRateMatrix } from '@/lib/concessions';

export default async function ApprovalsPage() {
  const access = await getConcessionAccess();
  const approvals = (await getApprovals()) ?? [];
  const pendingMatrices = await Promise.all(
    approvals
      .filter((approval) => approval.status === 'PENDING' && approval.requestType === 'RATE_MATRIX')
      .map(async (approval) => {
        const fiscalYear = approval.payload.fiscalYear ?? currentFiscalYear();
        const matrix = await getRateMatrix(approval.assemblyId, fiscalYear);
        return [approval.id, matrix] as const;
      }),
  );
  const matrixById = new Map(pendingMatrices);
  const enriched = approvals.map((approval) => {
    const matrix = matrixById.get(approval.id);
    return {
      ...approval,
      matrix: matrix ? {
        configured: matrix.summary.configured,
        total: matrix.summary.total,
        averageChangePct: matrix.summary.averageChangePct,
        movers: matrix.summary.movers,
      } : null,
    };
  });

  return (
    <section className="concession-page">
      <div className="concession-page-heading">
        <div><p className="eyebrow">Governance</p><h1>Approvals inbox</h1><p>Rate changes require an authorised Assembly decision. Concession Support can prepare drafts but cannot publish.</p></div>
      </div>
      <ApprovalQueue approvals={enriched} canApprove={access.canPublishRates} />
    </section>
  );
}
