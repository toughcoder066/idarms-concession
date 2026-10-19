# __SERVICE_NAME__

iDARMS microservice. Owned database: `__DB_NAME__` (HTTP port `__PORT__`).

## Routes

- `GET __ROUTE_PREFIX__` — list (`__READ_PERMISSION__`)
- `GET __ROUTE_PREFIX__/:id` — fetch one (`__READ_PERMISSION__`)

## Consumed events

__CONSUMED_ROUTING_KEYS__

## Published events

__PUBLISHED_EVENTS__

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
