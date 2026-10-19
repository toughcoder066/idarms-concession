# reporting-service

iDARMS microservice. Owned database: `idarms_reporting_db` (HTTP port `3080`).

## Routes

- `GET /v1/dashboard/metrics` — list (`reporting:read`)
- `GET /v1/dashboard/metrics/:id` — fetch one (`reporting:read`)

## Consumed events

["property.verified.v1","bill.issued.v1","payment.collected.v1"]

## Published events

[]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
