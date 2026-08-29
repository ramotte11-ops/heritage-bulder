-- Mission 002: extensions required by the schema.
--
-- pgcrypto provides gen_random_uuid(), used as the default for every
-- primary key in this schema. Supabase projects have it available by
-- default; this statement is here so the schema is reproducible on any
-- vanilla PostgreSQL 13+ instance too (see supabase/README.md).
create extension if not exists pgcrypto;
