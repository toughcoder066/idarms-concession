export const ROUTING_KEYS = {
  ratepayerRegistered: 'ratepayer.registered.v1',
  propertyRegistered: 'property.registered.v1',
  propertyVerified: 'property.verified.v1',
  valuationCompleted: 'property.valuation_completed.v1',
  billIssued: 'bill.issued.v1',
  paymentCollected: 'payment.collected.v1',
  documentUploaded: 'document.uploaded.v1',
  feeFixingPublished: 'fee_fixing.published.v1',
  discrepancyDetected: 'reconciliation.discrepancy_detected.v1',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];
