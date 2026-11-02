# property-service

iDARMS microservice. Owned database: `idarms_property_db` (HTTP port `3010`).

## Routes

- `GET /v1/properties` — list (`property:read`)
- `GET /v1/properties/:id` — fetch one (`property:read`)

## Consumed events

["property.registered.v1"]

## Published events

["property.verified.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
