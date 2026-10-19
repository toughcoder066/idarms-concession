# valuation-service

iDARMS microservice. Owned database: `idarms_valuation_db` (HTTP port `3060`).

## Routes

- `GET /v1/valuations` — list (`valuation:read`)
- `GET /v1/valuations/:id` — fetch one (`valuation:read`)

## Consumed events

["property.verified.v1"]

## Published events

["property.valuation_completed.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
