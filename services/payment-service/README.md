# payment-service

iDARMS microservice. Owned database: `idarms_payment_db` (HTTP port `3040`).

## Routes

- `GET /v1/payments` — list (`payment:read`)
- `GET /v1/payments/:id` — fetch one (`payment:read`)

## Consumed events

["bill.issued.v1"]

## Published events

["payment.collected.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
