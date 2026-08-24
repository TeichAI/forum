-- Clerk public metadata is now the source of truth for global forum roles.
-- Existing staff assignments intentionally start fresh and will be restored in Clerk.
UPDATE "User"
SET "role" = 'MEMBER'
WHERE "role" <> 'MEMBER';
