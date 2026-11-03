export const appConfig = {
  /**
   * Optional shared gateway (e.g. Envoy at http://localhost:8080/api/v1).
   * When set, all reads go through it. When unset, reads go directly to each
   * service's own base URL below — the supported local-development mode.
   */
  gatewayUrl: process.env.NEXT_PUBLIC_IDARMS_API_URL ?? '',
  croipRatepayerApiUrl:
    process.env.CROIP_RATEPAYER_API_URL ??
    process.env.CROIP_API_URL ??
    process.env.NEXT_PUBLIC_CROIP_API_URL ??
    'http://localhost:3030',
  croipPropertyApiUrl:
    process.env.CROIP_PROPERTY_API_URL ??
    process.env.CROIP_API_URL ??
    process.env.NEXT_PUBLIC_CROIP_API_URL ??
    'http://localhost:3020',
  croipRequestTimeoutMs: Number(process.env.CROIP_REQUEST_TIMEOUT_MS ?? 10000),
  /** Opt-in only: forward the dev identity headers below when there is no access token. */
  devHeaderAuth: process.env.IDARMS_DEV_HEADER_AUTH === 'true',
  devConcessionId: process.env.IDARMS_CONCESSION_ID ?? '11111111-1111-1111-1111-111111111111',
  devAssemblyId: process.env.IDARMS_ASSEMBLY_ID ?? '',
  devOrgId: process.env.IDARMS_ORG_ID ?? '',
  devAuthorizedOrgIds: process.env.IDARMS_AUTHORIZED_ORG_IDS ?? '',
  devRoles: process.env.IDARMS_DEV_ROLES ?? '',
  devScopeLevel: process.env.IDARMS_SCOPE_LEVEL ?? 'PORTFOLIO',
  devActorId: process.env.IDARMS_ACTOR_ID ?? 'dev-actor',
  serviceBaseUrls: {
    ratepayers: process.env.NEXT_PUBLIC_RATEPAYER_API_URL ?? 'http://localhost:3020/v1',
    properties: process.env.NEXT_PUBLIC_PROPERTY_API_URL ?? 'http://localhost:3010/v1',
    documents: process.env.NEXT_PUBLIC_DOCUMENT_API_URL ?? 'http://localhost:3050/v1',
    valuations: process.env.NEXT_PUBLIC_VALUATION_API_URL ?? 'http://localhost:3060/v1',
    bills: process.env.NEXT_PUBLIC_BILLING_API_URL ?? 'http://localhost:3030/v1',
    payments: process.env.NEXT_PUBLIC_PAYMENT_API_URL ?? 'http://localhost:3040/v1',
    discrepancies: process.env.NEXT_PUBLIC_RECONCILIATION_API_URL ?? 'http://localhost:3070/v1',
    dashboard: process.env.NEXT_PUBLIC_REPORTING_API_URL ?? 'http://localhost:3080/v1',
    sync: process.env.NEXT_PUBLIC_CROIP_INTEGRATION_API_URL ?? 'http://localhost:3090/v1',
    concessions: process.env.NEXT_PUBLIC_CONCESSIONS_API_URL ?? 'http://localhost:3100/v1',
    gis: process.env.NEXT_PUBLIC_GIS_API_URL ?? 'http://localhost:3110/v1',
  },
} as const;

export type IdarmsResource = keyof typeof appConfig.serviceBaseUrls;
