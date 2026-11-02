import { z } from 'zod';
import type { Prisma } from '../../generated/prisma';
import type { EventEnvelope } from '../messaging/events';

const propertyRegisteredSchema = z.object({
  id: z.string().uuid().optional(),
  croipPropertyId: z.string().uuid().optional(),
  externalPropertyId: z.string().min(1).optional(),
  reference: z.string().min(1).optional(),
  ratepayerId: z.string().uuid().optional(),
  ratepayerRef: z.string().uuid().optional(),
  propertyType: z.string().optional(),
  propertyUsage: z.string().optional(),
  digitalAddress: z.string().optional(),
  zoneCode: z.string().optional(),
  blockCode: z.string().optional(),
  addressText: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  gpsCoordinates: z.string().nullable().optional(),
  status: z.string().optional(),
  registrationSource: z.string().optional(),
  registeredBy: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
});

const billIssuedSchema = z.object({ propertyId: z.string().uuid() });

const PROPERTY_TYPES = [
  'UNCLASSIFIED',
  'RESIDENTIAL',
  'COMMERCIAL',
  'INDUSTRIAL',
  'MIXED_USE',
  'GOVERNMENTAL',
  'AGRICULTURAL',
] as const;

const PROPERTY_USAGES = [
  'GENERAL',
  'SHOP',
  'OFFICE',
  'APARTMENT',
  'SINGLE_FAMILY_HOUSE',
  'WAREHOUSE',
  'FACTORY',
  'HOTEL_LODGING',
  'EDUCATIONAL',
  'FILLING_STATION',
] as const;

const PROPERTY_STATUSES = ['SUBMITTED', 'VERIFIED', 'DISPUTED', 'ARCHIVED'] as const;
const REGISTRATION_SOURCES = ['WALK_IN_DESK', 'MOBILE_FIELD_APP', 'BULK_IMPORT', 'CROIP_SYNC'] as const;

type PropertyTypeCode = (typeof PROPERTY_TYPES)[number];
type PropertyUsageCode = (typeof PROPERTY_USAGES)[number];
type PropertyStatusCode = (typeof PROPERTY_STATUSES)[number];
type RegistrationSourceCode = (typeof REGISTRATION_SOURCES)[number];

function normalizeEnum(value: string | undefined): string | undefined {
  return value?.trim().toUpperCase().replace(/[-\s]+/g, '_');
}

function asPropertyType(value?: string): PropertyTypeCode {
  const normalized = normalizeEnum(value);
  return (PROPERTY_TYPES as readonly string[]).includes(normalized ?? '')
    ? (normalized as PropertyTypeCode)
    : 'UNCLASSIFIED';
}

function asPropertyUsage(value?: string): PropertyUsageCode {
  const normalized = normalizeEnum(value);
  return (PROPERTY_USAGES as readonly string[]).includes(normalized ?? '')
    ? (normalized as PropertyUsageCode)
    : 'GENERAL';
}

function asPropertyStatus(value?: string): PropertyStatusCode {
  const normalized = normalizeEnum(value);
  if (normalized === 'PENDING_VERIFICATION' || normalized === 'PENDING') return 'SUBMITTED';
  return (PROPERTY_STATUSES as readonly string[]).includes(normalized ?? '')
    ? (normalized as PropertyStatusCode)
    : 'SUBMITTED';
}

function asRegistrationSource(value?: string): RegistrationSourceCode {
  const normalized = normalizeEnum(value);
  return (REGISTRATION_SOURCES as readonly string[]).includes(normalized ?? '')
    ? (normalized as RegistrationSourceCode)
    : 'CROIP_SYNC';
}

interface Coordinates {
  latitude: number | null;
  longitude: number | null;
}

function parseCoordinates(value: string | null | undefined): Coordinates {
  if (!value?.trim()) return { latitude: null, longitude: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }

  if (Array.isArray(parsed) && parsed.length >= 2) {
    const [longitude, latitude] = parsed;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      return { latitude, longitude };
    }
  }

  if (parsed && typeof parsed === 'object' && 'coordinates' in parsed) {
    const coordinates = (parsed as { coordinates?: unknown }).coordinates;
    if (Array.isArray(coordinates) && coordinates.length >= 2) {
      const [longitude, latitude] = coordinates;
      if (typeof latitude === 'number' && typeof longitude === 'number') {
        return { latitude, longitude };
      }
    }
  }

  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length === 2 && parts.every(Number.isFinite)) {
    return { latitude: parts[0], longitude: parts[1] };
  }

  return { latitude: null, longitude: null };
}

/**
 * Downstream sync: CROIP registered a property, the bridge re-published the
 * event onto idarms.events, and this service upserts its local replica.
 *
 * Legacy CROIP payloads (`reference`, `ratepayerId`, `gpsCoordinates`) remain
 * accepted so the existing bridge contract keeps working.
 */
export async function upsertProperty(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = propertyRegisteredSchema.parse(event.payload);
  const id = payload.id ?? event.aggregateId;
  const croipPropertyId = payload.croipPropertyId ?? payload.id ?? event.aggregateId;
  const externalPropertyId = payload.externalPropertyId ?? payload.reference ?? id;
  const coordinates = parseCoordinates(payload.gpsCoordinates);
  const lastSyncedAt = new Date();

  const data = {
    croipPropertyId,
    externalPropertyId,
    concessionId: event.concessionId,
    assemblyId: event.assemblyId,
    ratepayerRef: payload.ratepayerRef ?? payload.ratepayerId ?? null,
    digitalAddress: payload.digitalAddress ?? null,
    zoneCode: payload.zoneCode ?? null,
    blockCode: payload.blockCode ?? null,
    addressText: payload.addressText ?? null,
    latitude: payload.latitude ?? coordinates.latitude,
    longitude: payload.longitude ?? coordinates.longitude,
    propertyType: asPropertyType(payload.propertyType),
    propertyUsage: asPropertyUsage(payload.propertyUsage),
    status: asPropertyStatus(payload.status),
    registrationSource: asRegistrationSource(payload.registrationSource),
    registeredBy: payload.registeredBy ?? '00000000-0000-0000-0000-000000000000',
    documentIds: payload.documentIds ?? [],
    lastSyncedAt,
  };

  const existing = await tx.property.findFirst({
    where: { OR: [{ croipPropertyId }, { id }] },
  });

  if (existing) {
    await tx.property.update({
      where: { id: existing.id },
      data: { ...data, version: { increment: 1 } },
    });
    return;
  }

  await tx.property.create({ data: { id, ...data } });
}

/**
 * Billing owns bill generation; this flag is only a local read-model cache used
 * by property screens and never a source of financial truth.
 */
export async function markBillGenerated(tx: Prisma.TransactionClient, event: EventEnvelope): Promise<void> {
  const payload = billIssuedSchema.parse(event.payload);
  await tx.property.updateMany({
    where: { id: payload.propertyId },
    data: { isBillGenerated: true },
  });
}
