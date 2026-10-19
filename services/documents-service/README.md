# documents-service

iDARMS microservice. Owned database: `idarms_document_db` (HTTP port `3050`).

## Routes

- `GET /v1/documents` — list (`document:read`)
- `GET /v1/documents/:id` — fetch one (`document:read`)

## Consumed events

[]

## Published events

["document.uploaded.v1"]

## Local development

```bash
Copy-Item .env.example .env
pnpm prisma:generate
pnpm prisma:deploy
pnpm dev
```

Health: `/health/live`, `/health/ready`, `/metrics`, `/docs`.
