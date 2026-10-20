export const appConfig = {
  /**
   * Optional shared gateway (e.g. Envoy at http://localhost:8080/api/v1).
   * When set, all reads go through it. When unset, reads go directly to each
   * service's own base URL below — the supported local-development mode.
   */
  gatewayUrl: process.env.NEXT_PUBLIC_IDARMS_API_URL ?? '',
  croipApiUrl:
    process.env.NEXT_PUBLIC_CROIP_API_URL ?? 'https://api.croip.gov.gh',
  serviceBaseUrls: {
    ratepayers: process.env.NEXT_PUBLIC_RATEPAYER_API_URL ?? 'http://localhost:3020/v1',
    properties: process.env.NEXT_PUBLIC_PROPERTY_API_URL ?? 'http://localhost:3010/v1',
    documents: process.env.NEXT_PUBLIC_DOCUMENT_API_URL ?? 'http://localhost:3050/v1',
    valuations: process.env.NEXT_PUBLIC_VALUATION_API_URL ?? 'http://localhost:3060/v1',
    bills: process.env.NEXT_PUBLIC_BILLING_API_URL ?? 'http://localhost:3030/v1',
    payments: process.env.NEXT_PUBLIC_PAYMENT_API_URL ?? 'http://localhost:3040/v1',
    discrepancies: process.env.NEXT_PUBLIC_RECONCILIATION_API_URL ?? 'http://localhost:3070/v1',
    dashboard: process.env.NEXT_PUBLIC_REPORTING_API_URL ?? 'http://localhost:3080/v1',
  },
} as const;

export type IdarmsResource = keyof typeof appConfig.serviceBaseUrls;
