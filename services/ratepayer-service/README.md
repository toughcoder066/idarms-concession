# ratepayer-service

iDARMS microservice. Owned database: `idarms_ratepayer_db` (HTTP port `3020`).

## Routes

- `GET /v1/ratepayers` — list (`ratepayer:read`)
- `GET /v1/ratepayers/:id` — fetch one (`ratepayer:read`)

## Consumed events

["ratepayer.registered.v1"]

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
