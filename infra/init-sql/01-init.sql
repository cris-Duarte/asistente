-- Productivity Assistant - Database Initialization
-- This runs automatically when Postgres container starts

-- Create user for ElectricSQL with REPLICATION role
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'electric') THEN
        CREATE ROLE electric WITH LOGIN REPLICATION PASSWORD 'electric';
    END IF;
END
$$;

-- Grant permissions to electric user
GRANT ALL PRIVILEGES ON DATABASE productivity TO electric;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO electric;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO electric;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO electric;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO electric;

-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Set timezone
SET timezone = 'UTC';

-- The actual schema will be created by Drizzle migrations
-- This file just ensures the electric user exists with proper permissions