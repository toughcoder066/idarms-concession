# billing-service

iDARMS microservice. Owned database: `idarms_billing_db` (HTTP port `3030`).

## Routes

- `GET /v1/bills` — list (`bill:read`)
- `GET /v1/bills/:id` — fetch one (`bill:read`)

## Consumed events

["property.valuation_completed.v1"]

## Published events

["bill.issued.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
