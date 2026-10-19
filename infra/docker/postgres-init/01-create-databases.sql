-- iDARMS database bootstrap
-- One isolated PostgreSQL database per microservice. Cross-service SQL joins are forbidden:
-- every service connects only to its own DATABASE_URL.

CREATE DATABASE idarms_ratepayer_db;
CREATE DATABASE idarms_property_db;
CREATE DATABASE idarms_document_db;
CREATE DATABASE idarms_valuation_db;
CREATE DATABASE idarms_billing_db;
CREATE DATABASE idarms_payment_db;
CREATE DATABASE idarms_reconciliation_db;
CREATE DATABASE idarms_reporting_db;
CREATE DATABASE idarms_integration_db;
