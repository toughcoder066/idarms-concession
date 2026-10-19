iDARMS Microservice Golden Template Usage Guide
Fastify TypeScript Prisma PostgreSQL RabbitMQ and ZITADEL

Version 1.0 | Development team guide | 10 October 2026

Purpose
This guide explains how the iDARMS development team should create, configure, extend, test and deploy a microservice from the approved golden template. It uses a Property Registry Service as the worked example, but the same method applies to billing, payments, ratepayers, documents, reconciliation and other bounded services.

Required outcome
A service created from the template must run independently without Envoy, own its PostgreSQL database, validate ZITADEL access tokens, enforce concession and District Assembly boundaries, publish events through the transactional outbox and expose consistent health, documentation and observability endpoints.

Template baseline
Component	Baseline	Purpose
Runtime	Node.js 24	Supported runtime for local containers and production builds
API	Fastify 5 with TypeScript	HTTP endpoints, validation and service plugins
Data	Prisma with PostgreSQL	Service-owned schema and migrations
Identity	ZITADEL JWT and JWKS	Authentication and trusted caller context
Messaging	RabbitMQ	Commands, domain events and reliable delivery
Packaging	Docker and Docker Compose	Repeatable local and deployment environments
1. How the template is intended to be used
The template is a starting repository for one independently deployable microservice. Copy it once for each approved service boundary. Do not place unrelated domains into one copy merely because they share a release date or database table.

What every service inherits
A standard Fastify application bootstrap and error envelope.

Environment validation that prevents disabled authentication in production.

ZITADEL token verification and permission hooks.

A service-owned Prisma schema with audit, idempotency, outbox and inbox models.

A separate outbox publisher process for RabbitMQ.

OpenAPI documentation, health endpoints, metrics and structured logs.

A non-root runtime image and a Docker Compose development stack.

What must change in each service
Change	Example for Property Registry Service
Repository and package name	idarms-property-registry-service and @idarms/property-registry-service
Business module	Replace modules/example with modules/properties
Database name	property_registry
Permissions	property:read, property:create, property:verify and property:update
API contract	/v1/properties and related resources
Events	PropertySubmitted, PropertyVerified and PropertyUpdated
Owner	Named squad, product owner, primary engineer and secondary engineer
Development modes
Mode	Gateway	Use
Single service	No	Develop and test one service directly on its local port
Local integration	Optional	Run several services and their dependencies together
Shared development	Yes	Provide web and mobile teams with one stable API address
Test and production	Yes	Apply central routing, TLS, rate limits and access logging
2. Prerequisites and initial setup
Required software
Git and a code editor such as Visual Studio Code.

Node.js 24 and npm.

Docker Engine with Docker Compose v2.

Access to the development ZITADEL project when authentication is enabled.

A supported terminal environment. Windows developers should use PowerShell or WSL2 consistently for one repository.

Extract the template
bash
unzip iDARMS_Fastify_Microservice_Golden_Template_v1.0.zip
cd idarms-fastify-microservice-template
cp .env.example .env
npm install
npm run prisma:generate
On Windows PowerShell, use Copy-Item instead of cp if the shell does not provide the Unix command.

powershell
Copy-Item .env.example .env
npm install
npm run prisma:generate
Confirm the baseline
bash
npm run typecheck
npm test
npm audit --omit=dev
Do not begin domain changes until these commands pass. This provides a known baseline and makes later failures attributable to the service changes.

3. Select and document the service boundary
Before copying code, write a short service charter. The charter identifies the business capability, authoritative data, commands, events and dependencies. Architecture approval should occur before the service creates production data.

Property Registry Service charter
Question	Decision
Business responsibility	Maintain the authoritative property record and property verification state
Owned data	Property identity, location, classification, status and verified relationships
Does not own	Valuation, bill calculation, payments, receipts or settlement
Commands	Submit property, update property details, verify property and merge duplicate
Events	PropertySubmitted, PropertyUpdated, PropertyVerified and PropertyMerged
Synchronous dependencies	ZITADEL token keys and approved reference data where a current decision is required
Asynchronous consumers	Valuation, billing, reporting and CROIP integration services
Boundary test
The service can explain its purpose in one sentence.

It is the sole writer of its authoritative tables.

Other services can interact through documented APIs or events.

Its release does not require rebuilding every other service.

Its data can be restored and reconciled independently.

4. Create and rename a service repository
Copy the golden template into a new repository.

Rename the package in package.json.

Set SERVICE_NAME and the database name in the environment files.

Replace the example module with the first bounded domain module.

Update the OpenAPI title, permission names, event names and routing keys.

Record ownership and the service charter in the repository README.

Example package change
json
"name": "@idarms/property-registry-service",
"version": "0.1.0"
Example environment change
env
SERVICE_NAME=property-registry-service
SERVICE_VERSION=0.1.0
PORT=3010
DATABASE_URL=postgresql://idarms:idarms_dev_only@127.0.0.1:5433/property_registry?schema=public
Recommended source layout
text
src/
├── app.ts
├── server.ts
├── config.ts
├── modules/
│   └── properties/
│       ├── routes.ts
│       ├── schemas.ts
│       ├── service.ts
│       └── policy.ts
├── events/
├── plugins/
├── workers/
└── types/
Keep HTTP transport, business rules and persistence decisions distinct. Route handlers should validate input and call a service function. The service function should enforce business rules and complete its database transaction. It should not contain Fastify reply handling.

5. Configure the local environment
Environment groups
Group	Variables	Rule
Runtime	NODE_ENV, SERVICE_NAME, SERVICE_VERSION, HOST and PORT	Use a unique service name and local port
Database	DATABASE_URL	Point only to the service-owned database
Identity	AUTH_MODE and ZITADEL variables	Never disable authentication in production
Messaging	RABBITMQ_URL, exchange and outbox settings	Use versioned exchanges and routing keys
HTTP	CORS_ORIGINS and body limit	Allow only approved development origins
Operations	LOG_LEVEL and shutdown grace	Use info normally and debug only for investigation
Development authentication
Set AUTH_MODE to disabled only when developing locally. The configuration rejects this value when NODE_ENV is production. Development headers simulate the verified context that ZITADEL will supply.

env
AUTH_MODE=disabled
NODE_ENV=development
Start shared dependencies
bash
docker compose up -d postgres rabbitmq
npm run prisma:deploy
npm run dev
Verify service endpoints
bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3000/metrics
6. Work with Prisma and PostgreSQL
Each service owns one logical PostgreSQL database and its Prisma migrations. Another service must not read or update these tables directly, even when both databases run in the same PostgreSQL cluster.

Add a domain model
prisma
model Property {
  id           String   @id @default(uuid()) @db.Uuid
  concessionId String   @db.Uuid
  assemblyId   String   @db.Uuid
  reference    String
  status       String   @default("SUBMITTED")
  version      Int      @default(1)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([concessionId, reference])
  @@index([concessionId, assemblyId, status])
  @@map("properties")
}
Create and review a migration
bash
npm run prisma:migrate -- --name add_property
git diff -- prisma/schema.prisma prisma/migrations
npm run prisma:generate
npm run typecheck
Review generated SQL before committing it. Check column types, defaults, indexes, locking impact, backfill requirements and rollback implications. Production pipelines should run prisma migrate deploy as a separate migration job before the new application version starts.

Migration rules
Do not edit a migration that has been applied to a shared environment.

Use additive, backward-compatible changes before destructive changes.

Do not combine a large data backfill with application startup.

Back up and rehearse high-risk migrations using representative data.

Record reconciliation checks for financial or ownership data changes.

7. Implement routes schemas and business services
Route responsibilities
Declare the HTTP method, path, request schema, response schema and permission.

Read the concession and Assembly context from request.auth.

Call a domain service and translate its result into an HTTP response.

Do not perform cross-tenant searches or business calculations directly in the route.

Worked route
typescript
app.post('/', {
  preHandler: app.requirePermissions(['property:create']),
  schema: createPropertySchema
}, async (request, reply) => {
  const property = await service.submit({
    ...request.body,
    concessionId: request.auth.concessionId,
    assemblyId: request.auth.assemblyId,
    actorId: request.auth.subject,
    correlationId: request.id
  });
  return reply.code(201).send(property);
});
Business transaction
The service function should write the property, audit record and outgoing event within one PostgreSQL transaction. If any write fails, the entire transaction must roll back.

typescript
return app.prisma.$transaction(async (tx) => {
  const property = await tx.property.create({ data });
  await appendOutboxEvent(tx, 'property.submitted.v1', event);
  await tx.auditRecord.create({ data: audit });
  return property;
});
8. Configure ZITADEL authentication
Required ZITADEL objects
Object	Use
Project	Groups the iDARMS APIs and role definitions
API application	Defines the audience accepted by the service
Roles	Defines permissions such as property:read and property:create
Actions or claim mapping	Adds approved concession and Assembly context to the access token
Service users	Authenticates service-to-service operations without a human account
Expected context claim
json
{
  "urn:idarms:context": {
    "concessionId": "11111111-1111-1111-1111-111111111111",
    "assemblyId": "22222222-2222-2222-2222-222222222222"
  }
}
Production configuration
env
AUTH_MODE=zitadel
ZITADEL_ISSUER=https://auth.idarms.com
ZITADEL_AUDIENCE=<service-api-audience>
ZITADEL_JWKS_URI=https://auth.idarms.com/oauth/v2/keys
The service validates token signature, issuer, audience and lifetime. The gateway may perform the same validation later, but gateway validation does not replace service validation.

9. Enforce concession and Assembly isolation
Every business query must include the authorised concession and Assembly boundary. A valid user identifier or property identifier does not by itself authorise access.

Required query pattern
typescript
const property = await prisma.property.findFirst({
  where: {
    id: propertyId,
    concessionId: request.auth.concessionId,
    assemblyId: request.auth.assemblyId
  }
});
Patterns to reject
Using concessionId or assemblyId supplied in a normal request body without comparing it to the verified token context.

Fetching a record by its primary key and checking tenancy only after returning or modifying it.

Allowing an administrator role to bypass all tenant filters without a separately approved oversight use case.

Including unrestricted repository functions that developers can call accidentally.

Required isolation tests
Test	Expected result
Correct concession and Assembly	Resource is returned
Correct concession and wrong Assembly	404 or 403 according to the contract
Wrong concession	No resource information is disclosed
Missing permission	403 with the standard problem response
Invalid or expired token	401 before business logic executes
10. Publish domain events reliably
Do not publish directly to RabbitMQ from an API transaction. The template writes the business change and an outbox record in one database transaction. A separate worker publishes committed outbox records and marks them as published after RabbitMQ confirms receipt.

Event naming
Element	Example
Event type	PropertySubmitted
Routing key	property.submitted.v1
Aggregate type	Property
Aggregate version	1 for the first property state
Producer	property-registry-service
Event envelope requirements
A globally unique event ID.

Event type and schema version.

Producer, aggregate type, aggregate ID and aggregate version.

Concession ID and Assembly ID.

Correlation ID, causation ID when available and occurrence time.

The minimum business payload needed by authorised consumers.

Run the publisher
bash
npm run worker:outbox
The worker uses publisher confirms, row claiming with FOR UPDATE SKIP LOCKED and bounded exponential retry. The service owner must also define dead-letter alerting, replay approval and the maximum acceptable backlog age.

11. Consume events with inbox deduplication
RabbitMQ can deliver the same message more than once. A consumer must treat duplicate delivery as normal. The template's processOnce helper inserts the message ID, performs the business change and records completion within one transaction.

typescript
const result = await processOnce(
  prisma,
  'valuation-service.property-submitted.v1',
  event,
  async (tx, incoming) => {
    await tx.valuationWorkItem.create({ data: mapEvent(incoming) });
  }
);

channel.ack(message);
Consumer rules
Acknowledge only after the database transaction commits.

A duplicate event ID must not create a second business effect.

Reject malformed or unsupported events to an owned dead-letter process.

Do not assume messages arrive in aggregate order unless the contract guarantees it.

Use aggregateVersion when applying state changes for which order matters.

12. Implement idempotency and audit evidence
Idempotent commands
Require an Idempotency-Key header for payments, reversals, refunds and other commands whose retry could create a second financial or legal effect. Store the key with the concession, request hash and completed response.

Condition	Response
New key	Process the command and store the outcome
Same key and same request hash	Return the stored outcome
Same key and different request hash	Return a conflict and do not process
Concurrent request using the same key	Only one transaction may acquire the key
Audit records
Record privileged, ownership, assessment and financial actions with the actor, verified institution context, action, resource, request ID, outcome and approved metadata. Do not place passwords, access tokens, full payment credentials or unnecessary identity documents in audit metadata.

13. Test the service
Test layers
Layer	Minimum coverage
Unit	Business rules, policy decisions and mappings
Route	Schemas, status codes, permission hooks and problem responses
Database integration	Transactions, uniqueness, tenancy filters and migrations
Event contract	Envelope, schema version, routing key and consumer compatibility
Reliability	Duplicate delivery, delayed callbacks, retry and recovery
Security	Invalid tokens, wrong audience, missing roles and cross-tenant attempts
Standard commands
bash
npm run typecheck
npm test
npm audit --omit=dev
npm run build
Definition of done
A feature is complete when its business acceptance criteria, authorization tests, API and event contracts, database migration, audit evidence, metrics, documentation and operational recovery steps are complete. A successful local request alone is insufficient.

14. Run the Docker development stack
Start all containers
bash
docker compose up --build
Useful operations
bash
docker compose ps
docker compose logs -f service
docker compose logs -f outbox-worker
docker compose restart service
docker compose down
docker compose down -v  # deletes local database and RabbitMQ data
Use docker compose down -v only when deletion of local development data is intentional. It must never be part of a shared or production operating procedure.

Container responsibilities
Container	Responsibility
service	Runs the Fastify HTTP API
outbox-worker	Publishes committed events to RabbitMQ
migrate	Applies committed Prisma migrations and exits
postgres	Stores only this service's authoritative data
rabbitmq	Provides the local AMQP broker and management interface
Security of the local stack
The supplied credentials are development-only. PostgreSQL, AMQP and the RabbitMQ management interface bind to localhost. Replace every credential and use a secrets manager in shared environments.

15. Integrate several services
Once two or more services must support one user journey, add them to the shared integration environment. Keep each service's database and credentials separate even if one PostgreSQL container hosts several databases.

Integration sequence
Publish the OpenAPI and event contract for each service.

Start the required databases, RabbitMQ, ZITADEL and services.

Test synchronous calls using service DNS names rather than localhost.

Bind RabbitMQ queues using versioned routing keys.

Run contract, tenancy, duplicate-event and failure-recovery tests.

Add Envoy only when the shared environment needs one external address and central policies.

Envoy integration point
text
/api/v1/properties/*  -> property-registry-service:3010
/api/v1/ratepayers/*  -> ratepayer-service:3020
/api/v1/bills/*       -> billing-service:3030
/api/v1/payments/*    -> payment-service:3040
Services must remain callable and testable without Envoy. Envoy provides external routing, TLS, coarse token validation, limits and access logs. Business authorization remains inside each service.

16. Prepare continuous integration and deployment
Pull request checks
Check	Failure condition
Dependency installation	Lockfile and package manifest differ
Type checking	TypeScript reports an error
Automated tests	Any required test fails
Dependency audit	Unapproved high or critical vulnerability
Prisma validation	Schema or migration is invalid
Contract comparison	Breaking API or event change lacks approval
Container build	The production image cannot be built or started
Deployment order
Build, scan and sign an immutable container image.

Back up and apply forward-compatible database migrations.

Deploy the service and outbox worker using the same image version.

Wait for readiness and verify health, logs and metrics.

Run smoke tests through the shared gateway.

Monitor errors, latency, outbox backlog and reconciliation indicators.

17. Production readiness checklist
Area	Required evidence
Ownership	Named product, technical and operational owners with escalation contacts
Identity	ZITADEL issuer, audience, claims and roles tested in the target environment
Isolation	Cross-concession and cross-Assembly tests pass
Database	Migration reviewed, backup restored and retention approved
Messaging	Publisher confirm, duplicate, retry, dead-letter and replay tests pass
Security	Secrets, image scan, least privilege and independent assessment complete
Operations	Dashboards, alerts, runbook, service levels and support roster active
Recovery	Database restoration and outbox or inbox reconciliation demonstrated
Contracts	OpenAPI and event schemas versioned and published
Acceptance	Named business and technical approvers sign off
18. Troubleshooting
Symptom	Likely cause and action
Prisma cannot reach PostgreSQL	Confirm postgres is healthy, port 5433 is free and DATABASE_URL uses localhost outside Compose or postgres inside Compose
Service starts but readiness returns 503	Apply migrations and confirm database credentials and network access
JWT is rejected	Check issuer, audience, JWKS URI, expiry, system time and bearer header
Request returns 403	Inspect the configured roles claim and required permission name
Request returns another tenant's data	Stop testing and treat as a security defect; add tenant filters and regression tests
Outbox grows continuously	Check worker health, RabbitMQ connectivity, publisher confirms and lastError values
Duplicate business records appear	Use the inbox helper and enforce a unique message ID per consumer
Swagger UI is unavailable	Confirm the service started and open the documented /docs path with its trailing slash
Container cannot run migrations	Build the migration target and confirm the migrations directory is included
Escalation evidence
When escalating a defect, include the service name and version, request or correlation ID, environment, exact command, redacted log excerpt, expected result, actual result and whether data was changed. Never send access tokens, passwords or full payment credentials in tickets or chat messages.

Appendix A — Command reference
Command	Purpose
npm install	Install the locked development dependencies
npm run prisma:generate	Generate the Prisma Client
npm run prisma:migrate -- --name change_name	Create and apply a development migration
npm run prisma:deploy	Apply committed migrations without creating new ones
npm run dev	Run the API with TypeScript watch mode
npm run worker:outbox	Run the RabbitMQ publisher worker
npm run typecheck	Check TypeScript without writing build output
npm test	Run the automated test suite
npm run build	Compile production JavaScript
npm audit --omit=dev	Check production dependencies for known vulnerabilities
docker compose up --build	Build and run the complete local stack
docker compose logs -f service	Follow API logs
Standard local verification
bash
npm run prisma:generate
npm run typecheck
npm test
npm audit --omit=dev
npm run build
Appendix B — First service handover record
Complete this record for every new service and store it in the repository documentation.

Field	Entry
Service name	
Business capability	
Product owner	
Primary technical owner	
Secondary technical owner	
Owned database	
External API base path	
Published events	
Consumed events	
ZITADEL audience and roles	
Dashboard and alert links	
Runbook location	
Recovery test date	
Architecture approval