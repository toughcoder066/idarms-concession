# gis-service

iDARMS microservice. Owned database: `gis_spatial_db` (HTTP port `3110`).

## Routes

- `GET /v1/zones` — list (`gis:read`)
- `GET /v1/zones/:id` — fetch one (`gis:read`)
- `GET /v1/zones/:id/blocks` — list blocks for a zone (`gis:read`)
- `POST /v1/zones` — create a zone (`gis:manage`)
- `POST /v1/zones/:id/blocks` — create a block under a zone (`gis:manage`)

A `CONCESSION_SUPER_ADMIN` signed in from the concession org (CONCESSION scope) can read
zones across the concession; assembly-scoped callers are restricted to their assembly.

## Consumed events

[]

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
