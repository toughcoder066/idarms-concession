export const appConfig = {
  idarmsApiUrl:
    process.env.NEXT_PUBLIC_IDARMS_API_URL ?? 'http://localhost:8080/api/v1',
  croipApiUrl:
    process.env.NEXT_PUBLIC_CROIP_API_URL ?? 'https://api.croip.gov.gh',
  croipApiToken: process.env.CROIP_API_TOKEN ?? '',
} as const;
