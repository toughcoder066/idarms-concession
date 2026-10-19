
+---.claude
+---.github
|   \---ISSUE_TEMPLATE
+---apps
|   \---croip-portal
|       +---public
|       |   \---images
|       |       +---avatars
|       |       +---brands
|       |       +---datatable
|       |       +---flags
|       |       \---widgets
|       \---src
|           +---app
|           |   +---(blank)
|           |   |   +---login
|           |   |   \---pages
|           |   |       +---auth
|           |   |       |   +---forgot-password
|           |   |       |   +---login
|           |   |       |   +---register
|           |   |       |   +---reset-password
|           |   |       |   +---two-steps
|           |   |       |   \---verify-email
|           |   |       \---misc
|           |   |           \---error-page
|           |   +---(pages)
|           |   |   +---apps
|           |   |   |   +---calendar
|           |   |   |   +---mail
|           |   |   |   \---users
|           |   |   |       +---list
|           |   |   |       +---profile
|           |   |   |       |   \---[id]
|           |   |   |       \---view
|           |   |   +---concessions
|           |   |   |   +---api-clients
|           |   |   |   +---contracts
|           |   |   |   +---personnel
|           |   |   |   +---sync-batches
|           |   |   |   \---[id]
|           |   |   +---configuration
|           |   |   |   +---assemblies
|           |   |   |   +---gateways
|           |   |   |   +---regions
|           |   |   |   +---system
|           |   |   |   \---zones
|           |   |   +---dashboard
|           |   |   |   \---orders
|           |   |   +---datatable
|           |   |   +---forms
|           |   |   |   +---form-layouts
|           |   |   |   |   +---horizontal
|           |   |   |   |   \---vertical
|           |   |   |   \---form-validation
|           |   |   +---pages
|           |   |   |   +---user-profile
|           |   |   |   \---user-settings
|           |   |   +---profile
|           |   |   +---properties
|           |   |   |   +---bills
|           |   |   |   |   \---[billNumber]
|           |   |   |   +---cadastral-map
|           |   |   |   +---valuation-lists
|           |   |   |   \---[id]
|           |   |   +---ratepayers
|           |   |   |   +---disputes
|           |   |   |   +---verifications
|           |   |   |   \---[id]
|           |   |   +---settings
|           |   |   \---users
|           |   |       +---roles
|           |   |       \---security
|           |   +---api
|           |   |   +---auth
|           |   |   |   +---logout
|           |   |   |   +---me
|           |   |   |   \---oauth
|           |   |   |       \---zitadel
|           |   |   |           +---callback
|           |   |   |           +---link
|           |   |   |           |   \---[provider]
|           |   |   |           \---login
|           |   |   +---billing
|           |   |   |   +---bills
|           |   |   |   |   \---[billNumber]
|           |   |   |   \---payments
|           |   |   +---concessions
|           |   |   |   \---[id]
|           |   |   |       +---api-clients
|           |   |   |       +---assemblies
|           |   |   |       \---personnel
|           |   |   +---configuration
|           |   |   +---dashboard
|           |   |   |   \---metrics
|           |   |   +---disputes
|           |   |   |   \---[code]
|           |   |   |       \---status
|           |   |   +---geo
|           |   |   |   +---assemblies
|           |   |   |   |   \---[id]
|           |   |   |   |       \---boundary
|           |   |   |   +---detect-zone
|           |   |   |   \---regions
|           |   |   |       \---[id]
|           |   |   |           \---boundary
|           |   |   +---nav-apps
|           |   |   +---properties
|           |   |   |   +---valuations
|           |   |   |   \---[id]
|           |   |   |       \---verifications
|           |   |   +---ratepayers
|           |   |   |   +---directory
|           |   |   |   \---[id]
|           |   |   |       +---properties
|           |   |   |       \---verifications
|           |   |   |           \---[verificationId]
|           |   |   +---rbac
|           |   |   +---reference
|           |   |   |   \---countries
|           |   |   +---uploads
|           |   |   |   \---avatars
|           |   |   |       \---[filename]
|           |   |   +---user
|           |   |   |   +---2fa
|           |   |   |   +---activities
|           |   |   |   +---avatar
|           |   |   |   +---profile
|           |   |   |   \---social-connections
|           |   |   +---users
|           |   |   |   +---security
|           |   |   |   \---[id]
|           |   |   \---verifications
|           |   |       \---[id]
|           |   |           \---review
|           |   \---server
|           +---assets
|           |   +---data
|           |   \---svg
|           +---components
|           |   +---forms
|           |   +---icons
|           |   +---layout
|           |   +---shared
|           |   \---ui
|           +---configs
|           +---fake-db
|           |   +---apps
|           |   \---pages
|           +---hooks
|           +---lib
|           +---types
|           |   +---apps
|           |   \---pages
|           +---utils
|           \---views
|               +---apps
|               |   +---calendar
|               |   +---mail
|               |   |   \---mail-display
|               |   \---users
|               |       +---dialogs
|               |       +---list
|               |       +---profile
|               |       \---view
|               |           \---tabs
|               +---billing
|               +---concessions
|               +---configuration
|               |   \---zones
|               +---dashboards
|               |   +---charts
|               |   +---statistics
|               |   \---widgets
|               +---datatables
|               |   +---basic
|               |   +---filters
|               |   \---pinnable-columns
|               +---disputes
|               +---forms
|               |   +---form-layouts
|               |   |   +---horizontal
|               |   |   \---vertical
|               |   \---form-validation
|               +---pages
|               |   +---auth
|               |   |   +---forgot-password
|               |   |   +---login
|               |   |   +---register
|               |   |   +---reset-password
|               |   |   +---two-steps
|               |   |   \---verify-email
|               |   +---misc
|               |   |   \---error-page
|               |   +---user-profile
|               |   |   +---connections
|               |   |   \---profile
|               |   \---user-settings
|               |       +---general
|               |       +---security
|               |       \---workspace
|               +---properties
|               +---ratepayers
|               \---users
|                   +---roles
|                   \---security
+---docker
|   \---postgres
+---packages
|   +---contracts
|   |   \---src
|   |       +---concession
|   |       +---iam
|   |       \---property
|   \---tsconfig
+---scripts
\---services
    +---audit-assurance-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---assurance
    |   |   |   \---health
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---billing-payments-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       +---20261017042030_init
    |   |       \---20261017210111_add_issued_by_personnel
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---billing
    |   |   |   \---health
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---dispute-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---20261017042040_init
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---disputes
    |   |   |   \---health
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---event-processing-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---health
    |   |   |   \---processing
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---independent-evidence-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---evidence
    |   |   |   \---health
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---oversight-reconciliation-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---health
    |   |   |   \---reconciliation
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---platform-governance-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       +---202610100001_initial
    |   |       \---20261017080853_add_user_invite_flow
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---governance
    |   |   |   +---health
    |   |   |   \---rbac
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---property-registry-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       +---202610100001_initial
    |   |       \---20261017035747_add_property_verification
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---health
    |   |   |   \---properties
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---ratepayer-service
    |   +---docs
    |   +---prisma
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---health
    |   |   |   \---ratepayers
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    +---reporting-gateway-service
    |   +---docs
    |   +---prisma
    |   |   +---client
    |   |   |   \---runtime
    |   |   \---migrations
    |   |       \---202610100001_initial
    |   +---src
    |   |   +---events
    |   |   +---generated
    |   |   |   \---prisma-client
    |   |   |       \---runtime
    |   |   +---lib
    |   |   +---modules
    |   |   |   +---health
    |   |   |   \---ingestions
    |   |   +---plugins
    |   |   +---types
    |   |   \---workers
    |   \---test
    \---shared-services
        +---docs
        +---prisma
        |   \---migrations
        |       +---202610100001_initial
        |       \---20261017080258_add_regions_assemblies
        +---src
        |   +---events
        |   +---generated
        |   |   \---prisma-client
        |   |       \---runtime
        |   +---lib
        |   +---modules
        |   |   +---geo
        |   |   +---health
        |   |   \---shared
        |   +---plugins
        |   +---types
        |   \---workers
        \---test