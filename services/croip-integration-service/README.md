# croip-integration-service

iDARMS microservice. Owned database: `idarms_integration_db` (HTTP port `3090`).

## Routes

- `GET /v1/sync` — list (`integration:sync`)
- `GET /v1/sync/:id` — fetch one (`integration:sync`)

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
