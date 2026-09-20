ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" text;
UPDATE "users" SET "name" = split_part("email", '@', 1) WHERE "name" IS NULL;
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "owner_slot" integer DEFAULT 1 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" text DEFAULT 'America/Asuncion' NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
ALTER TABLE "users" DROP COLUMN IF EXISTS "passkey_credential_id";
ALTER TABLE "users" DROP COLUMN IF EXISTS "public_key";
CREATE UNIQUE INDEX IF NOT EXISTS "users_single_owner_idx" ON "users" ("owner_slot");
DO $$ BEGIN
  ALTER TABLE "users" ADD CONSTRAINT "users_owner_slot_check" CHECK ("owner_slot" = 1);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "passkey_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "credential_id" text NOT NULL UNIQUE,
  "public_key" text NOT NULL,
  "counter" integer DEFAULT 0 NOT NULL,
  "transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "device_type" text,
  "backed_up" boolean DEFAULT false NOT NULL,
  "name" text DEFAULT 'Passkey' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_used_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "passkey_credentials_user_idx" ON "passkey_credentials" ("user_id");

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "user_agent" text,
  "ip_address" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "absolute_expires_at" timestamptz NOT NULL,
  "recovery_required" boolean DEFAULT false NOT NULL,
  "revoked_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "recovery_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "code_hash" text NOT NULL UNIQUE,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "used_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "recovery_codes_user_idx" ON "recovery_codes" ("user_id");

CREATE TABLE IF NOT EXISTS "setup_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "used_at" timestamptz
);

CREATE TABLE IF NOT EXISTS "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "hardware_id" text NOT NULL UNIQUE,
  "token_hash" text UNIQUE,
  "scopes" jsonb DEFAULT '["tasks:read","tasks:write","timer:read","timer:write"]'::jsonb NOT NULL,
  "firmware_version" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "paired_at" timestamptz,
  "last_seen_at" timestamptz,
  "revoked_at" timestamptz
);
CREATE INDEX IF NOT EXISTS "devices_user_idx" ON "devices" ("user_id");

CREATE TABLE IF NOT EXISTS "device_pairings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "code_hash" text NOT NULL UNIQUE,
  "polling_token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamptz NOT NULL,
  "confirmed_at" timestamptz,
  "claimed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "last_write_id" text;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "last_write_id" text;
ALTER TABLE "time_entries" DROP COLUMN IF EXISTS "duration_seconds";
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "updated_at" timestamptz DEFAULT now() NOT NULL;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "last_write_id" text;
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_single_active_idx" ON "time_entries" ("user_id") WHERE "ended_at" IS NULL AND "deleted_at" IS NULL;

CREATE TABLE IF NOT EXISTS "mutation_receipts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "idempotency_key" text NOT NULL,
  "method" text NOT NULL,
  "path" text NOT NULL,
  "status_code" integer NOT NULL,
  "response" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "mutation_receipts_user_key_idx" ON "mutation_receipts" ("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "mutation_receipts_created_idx" ON "mutation_receipts" ("created_at");
