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

/**
 * What the form sends. CROIP `POST /v1/properties` @ 9be15da also needs
 * `staffRef`, which the server action adds from the session. There is no
 * code, name or assembly: CROIP assigns the code, only the owning ratepayer
 * names a property, and CROIP derives the assembly from the polygon.
 */
export interface RegisterPropertyInput {
  accountNumber?: string;
  propertyClass: string;
  buildingStatus: string;
  propertyStatus: string;
  propertyUse: string;
  tenureType: string;
  structureType: string;
  numberOfFloors?: number;
  ghanaPostGps?: string;
  polygonGeoJson: string;
  /** Generated once when the form opens and resent on every retry. */
  idempotencyKey: string;
}

export interface CroipResult {
  ok: boolean;
  status?: number;
  body?: unknown;
  message?: string;
}

// CROIP's service refuses a concession registration unless all six are set.
// They are free text there (no code list yet, O8) and stored as VarChar(50).
export const requiredPropertyFields = [
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

function isShortText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}

/** `staffRef` is the signed-in staff member's iDARMS user id, never a form value. */
export async function registerProperty(input: RegisterPropertyInput, staffRef: string): Promise<CroipResult> {
  if (
    !input ||
    !isShortText(staffRef, 100) ||
    !isShortText(input.idempotencyKey, 200) ||
    typeof input.polygonGeoJson !== 'string' ||
    requiredPropertyFields.some((field) => !isShortText(input[field], 50)) ||
    (input.accountNumber !== undefined && !isShortText(input.accountNumber, 50)) ||
    (input.ghanaPostGps !== undefined && !isShortText(input.ghanaPostGps, 50)) ||
    (input.numberOfFloors !== undefined && (!Number.isInteger(input.numberOfFloors) || input.numberOfFloors < 1))
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

  // CROIP hashes this body (minus idempotencyKey) to detect key reuse, so build
  // it in a fixed order from the same input on every retry.
  const body = {
    propertyClass: input.propertyClass.trim(),
    buildingStatus: input.buildingStatus.trim(),
    propertyStatus: input.propertyStatus.trim(),
    propertyUse: input.propertyUse.trim(),
    tenureType: input.tenureType.trim(),
    structureType: input.structureType.trim(),
    ...(input.accountNumber ? { accountNumber: input.accountNumber.trim() } : {}),
    ...(input.numberOfFloors !== undefined ? { numberOfFloors: input.numberOfFloors } : {}),
    ...(input.ghanaPostGps ? { ghanaPostGps: input.ghanaPostGps.trim() } : {}),
    polygonGeoJson: boundary,
    staffRef: staffRef.trim(),
    idempotencyKey: input.idempotencyKey.trim(),
  };
  return croipPost(appConfig.croipPropertyApiUrl, '/v1/properties', body);
}
