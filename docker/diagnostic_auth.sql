-- Diagnostic SQL for authentication issues
-- Run with: docker exec -i agentica_db psql -U agentica -d agentica_inventory -f /docker-entrypoint-initdb.d/diagnostic_auth.sql
-- Or pipe: Get-Content .\docker\diagnostic_auth.sql | docker exec -i agentica_db psql -U agentica -d agentica_inventory

-- 1. Check users table
SELECT 
    id,
    username,
    role,
    tenant_id,
    branch_id,
    LENGTH(password_hash) AS hash_length,
    CASE 
        WHEN password_hash LIKE '$2b$12$%' THEN 'bcrypt 12'
        WHEN password_hash LIKE '$2a$12$%' THEN 'bcrypt 12 (2a)'
        WHEN password_hash LIKE '$2b$10$%' THEN 'bcrypt 10'
        ELSE 'other'
    END AS hash_type
FROM users 
ORDER BY username;

-- 2. Check tenants (should have Agentica System)
SELECT id, name, business_type, pos_enabled FROM tenants;

-- 3. Check branches
SELECT id, tenant_id, name, code FROM branches;

-- 4. Verify admin user has correct tenant_id
SELECT 
    u.username,
    u.tenant_id,
    t.name AS tenant_name,
    u.branch_id,
    b.name AS branch_name
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
LEFT JOIN branches b ON u.branch_id = b.id
WHERE u.username = 'admin';

-- 5. Check if there are multiple admin users (should be unique per tenant)
SELECT tenant_id, COUNT(*) AS count 
FROM users 
WHERE username = 'admin' 
GROUP BY tenant_id;

-- 6. Test bcrypt hash manually (optional, requires plpgsql extension)
-- DO $$
-- DECLARE
--   hash TEXT;
--   valid BOOLEAN;
-- BEGIN
--   SELECT password_hash INTO hash FROM users WHERE username = 'admin';
--   SELECT crypt('admin123', hash) = hash INTO valid;
--   RAISE NOTICE 'Hash for admin123 matches: %', valid;
-- END $$;