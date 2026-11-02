import 'server-only';

import { appConfig } from './config';
import { getMachineToken } from './m2m';

export interface RegisterRatepayerInput {
  ratepayerType: 'INDIVIDUAL' | 'ORGANIZATION';
  legalName: string;
  phone: string;
  email?: string;
  regionId: string;
  assemblyId: string;
  latitude: number;
  longitude: number;
}

export interface RegisterPropertyInput {
  code: string;
  accountNumber?: string;
  propertyName?: string;
  propertyClass?: string;
  buildingStatus?: string;
  propertyStatus?: string;
  propertyUse?: string;
  tenureType?: string;
  structureType?: string;
  polygonGeoJson: string;
}

export interface CroipResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  message?: string;
}

const optionalPropertyFields = [
  'accountNumber',
  'propertyName',
  'propertyClass',
  'buildingStatus',
  'propertyStatus',
  'propertyUse',
  'tenureType',
  'structureType',
] as const;

async function croipPost(baseUrl: string, path: string, body: unknown): Promise<CroipResult> {
  const token = await getMachineToken();
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(appConfig.croipRequestTimeoutMs),
  });

  const responseBody = await response.json().catch(() => undefined);
  const message = responseBody && typeof responseBody === 'object' && 'title' in responseBody
    ? String(responseBody.title)
    : undefined;
  return { ok: response.ok, status: response.status, body: responseBody, message };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function registerRatepayer(input: RegisterRatepayerInput): Promise<CroipResult> {
  if (
    !input ||
    typeof input.legalName !== 'string' ||
    typeof input.phone !== 'string' ||
    typeof input.regionId !== 'string' ||
    typeof input.assemblyId !== 'string' ||
    (input.email !== undefined && typeof input.email !== 'string') ||
    !['INDIVIDUAL', 'ORGANIZATION'].includes(input.ratepayerType) ||
    input.legalName.trim().length < 2 ||
    input.legalName.trim().length > 200 ||
    input.phone.trim().length < 9 ||
    input.phone.trim().length > 30 ||
    !isUuid(input.regionId) ||
    !isUuid(input.assemblyId) ||
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180 ||
    (input.email !== undefined && input.email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
  ) {
    return { ok: false, status: 400, body: 'Invalid ratepayer registration details', message: 'Invalid ratepayer registration details' };
  }

  const body = {
    ratepayerType: input.ratepayerType,
    legalName: input.legalName.trim(),
    phone: input.phone.trim(),
    ...(input.email ? { email: input.email.trim() } : {}),
    regionId: input.regionId,
    assemblyId: input.assemblyId,
    locationGeo: { type: 'Point', coordinates: [input.longitude, input.latitude] },
  };
  return croipPost(appConfig.croipRatepayerApiUrl, '/v1/ratepayers', body);
}

export async function registerProperty(input: RegisterPropertyInput): Promise<CroipResult> {
  if (
    !input ||
    typeof input.code !== 'string' ||
    typeof input.polygonGeoJson !== 'string' ||
    optionalPropertyFields.some((field) => {
      const value = input[field];
      return value !== undefined && typeof value !== 'string';
    })
  ) {
    return { ok: false, status: 400, body: 'Invalid property registration details', message: 'Invalid property registration details' };
  }

  let boundary: unknown;
  try {
    boundary = JSON.parse(input.polygonGeoJson);
  } catch {
    return { ok: false, status: 400, body: 'Property boundary must be valid GeoJSON', message: 'Property boundary must be valid GeoJSON' };
  }

  if (
    input.code.trim().length < 3 ||
    input.code.trim().length > 50 ||
    (input.accountNumber !== undefined && input.accountNumber.length > 50) ||
    (input.propertyName !== undefined && input.propertyName.length > 150) ||
    !boundary ||
    typeof boundary !== 'object' ||
    Array.isArray(boundary) ||
    !('type' in boundary) ||
    boundary.type !== 'Polygon' ||
    !('coordinates' in boundary) ||
    !Array.isArray(boundary.coordinates)
  ) {
    return { ok: false, status: 400, body: 'Invalid property registration details', message: 'Invalid property registration details' };
  }

  const body = {
    code: input.code.trim(),
    ...(input.accountNumber ? { accountNumber: input.accountNumber.trim() } : {}),
    ...(input.propertyName ? { propertyName: input.propertyName.trim() } : {}),
    ...(input.propertyClass ? { propertyClass: input.propertyClass } : {}),
    ...(input.buildingStatus ? { buildingStatus: input.buildingStatus } : {}),
    ...(input.propertyStatus ? { propertyStatus: input.propertyStatus } : {}),
    ...(input.propertyUse ? { propertyUse: input.propertyUse } : {}),
    ...(input.tenureType ? { tenureType: input.tenureType } : {}),
    ...(input.structureType ? { structureType: input.structureType } : {}),
    registrationSource: 'CONCESSION',
    polygonGeoJson: boundary,
  };
  return croipPost(appConfig.croipPropertyApiUrl, '/v1/properties', body);
}
