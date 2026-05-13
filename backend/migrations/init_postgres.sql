-- DataOps Control Center — PostgreSQL Init Script
-- Creates the replication user and demo data

-- Replication user for streaming replication
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'replicator') THEN
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicator123';
  END IF;
END
$$;

-- pg_hba.conf equivalent (handled via Docker environment)
-- All tables are created by SQLAlchemy on startup

-- Demo database for sample data
CREATE DATABASE dataops_demo WITH OWNER dataops;

-- Enable pg_stat_statements for query performance tracking
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
