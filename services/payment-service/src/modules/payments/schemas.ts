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

export const checkoutBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['billId', 'amount', 'channel'],
  properties: {
    billId: { type: 'string' },
    propertyId: { type: 'string' },
    amount: { type: 'number', minimum: 0 },
    channel: {
      type: 'string',
      enum: ['MOBILE_MONEY', 'BANK_CARD', 'POS_TERMINAL', 'CASH_DESK', 'MOMO', 'CARD'],
    },
  },
} as const;

export const webhookBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    gatewayRef: { type: 'string' },
    reference: { type: 'string' },
    status: { type: 'string', enum: ['SUCCESS', 'SUCCESSFUL', 'FAILED'] },
    amount: { type: 'number' },
  },
} as const;
