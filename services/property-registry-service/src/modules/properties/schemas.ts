export const listQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 200 },
    offset: { type: 'integer', minimum: 0 },
  },
} as const;

export const byIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string' },
  },
} as const;

export const verifyBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['APPROVED', 'REJECTED'] },
    notes: { type: 'string' },
    photoUrl: { type: 'string' },
  },
} as const;
