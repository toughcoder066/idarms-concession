# reconciliation-service

iDARMS microservice. Owned database: `idarms_reconciliation_db` (HTTP port `3070`).

## Routes

- `GET /v1/discrepancies` — list (`reconciliation:read`)
- `GET /v1/discrepancies/:id` — fetch one (`reconciliation:read`)

## Consumed events

["payment.collected.v1"]

## Published events

["reconciliation.discrepancy_detected.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
