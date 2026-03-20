-- Fix authentication and create users Aegis & Proelium
-- Run with: Get-Content .\docker\fix_auth_and_create_users.sql | docker exec -i agentica_db psql -U agentica -d agentica_inventory

-- ===========================================
-- 1. DIAGNOSTIC - Check current state
-- ===========================================
\echo '=== CURRENT USERS ==='
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

\echo '\n=== TENANTS ==='
SELECT id, name, business_type FROM tenants;

\echo '\n=== BRANCHES ==='
SELECT id, tenant_id, name, code FROM branches;

\echo '\n=== ADMIN USER DETAILS ==='
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

-- ===========================================
-- 2. ENSURE DEFAULT TENANT EXISTS
-- ===========================================
INSERT INTO tenants (id, name, business_type, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'Agentica System', 'retail', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO branches (id, tenant_id, name, code, pos_enabled)
VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Matriz', 'MATRIZ', TRUE)
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- 3. FIX ADMIN USER
-- ===========================================
DO $$
DECLARE
    default_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    admin_user_id UUID;
BEGIN
    -- Check if admin user exists
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin' AND tenant_id = default_tenant_id;
    
    IF admin_user_id IS NULL THEN
        -- Check if admin exists without tenant_id
        SELECT id INTO admin_user_id FROM users WHERE username = 'admin' AND tenant_id IS NULL;
        
        IF admin_user_id IS NOT NULL THEN
            -- Update existing admin to have correct tenant_id
            UPDATE users 
            SET tenant_id = default_tenant_id,
                branch_id = NULL,
                role = 'admin'
            WHERE id = admin_user_id;
            RAISE NOTICE 'Admin user updated with tenant_id';
        ELSE
            -- Create admin user if missing
            INSERT INTO users (id, username, password_hash, role, tenant_id, branch_id)
            VALUES (
                gen_random_uuid(),
                'admin',
                '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- 'admin123'
                'admin',
                default_tenant_id,
                NULL
            );
            RAISE NOTICE 'Admin user created';
        END IF;
    ELSE
        -- Update password for existing admin (ensure bcrypt 12 hash)
        UPDATE users 
        SET password_hash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
            role = 'admin',
            branch_id = NULL
        WHERE id = admin_user_id;
        RAISE NOTICE 'Admin password reset to admin123';
    END IF;
END $$;

-- ===========================================
-- 4. CREATE USERS AEGIS AND PROELIUM
-- ===========================================
DO $$
DECLARE
    default_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    aegis_id UUID;
    proelium_id UUID;
BEGIN
    -- User Aegis (password: AegisTech2026)
    SELECT id INTO aegis_id FROM users WHERE username = 'Aegis' AND tenant_id = default_tenant_id;
    IF aegis_id IS NULL THEN
        INSERT INTO users (id, username, password_hash, role, tenant_id, branch_id)
        VALUES (
            gen_random_uuid(),
            'Aegis',
            '$2b$12$BN0zhvZ2P/9fOswySkT4LeGZSmvSVKutgf0/YujxXILbAU/3TpltS', -- 'AegisTech2026'
            'admin',
            default_tenant_id,
            NULL
        );
        RAISE NOTICE 'User Aegis created';
    ELSE
        UPDATE users 
        SET password_hash = '$2b$12$BN0zhvZ2P/9fOswySkT4LeGZSmvSVKutgf0/YujxXILbAU/3TpltS',
            role = 'admin'
        WHERE id = aegis_id;
        RAISE NOTICE 'User Aegis password updated';
    END IF;

    -- User Proelium (password: ProeliumDev2026)
    SELECT id INTO proelium_id FROM users WHERE username = 'Proelium' AND tenant_id = default_tenant_id;
    IF proelium_id IS NULL THEN
        INSERT INTO users (id, username, password_hash, role, tenant_id, branch_id)
        VALUES (
            gen_random_uuid(),
            'Proelium',
            '$2b$12$dYgV5XqnI6kQ6pRlKzBkIevlXUD/9lSd4fhEmkUYJcGdF2E1m6QaK', -- 'ProeliumDev2026'
            'admin',
            default_tenant_id,
            NULL
        );
        RAISE NOTICE 'User Proelium created';
    ELSE
        UPDATE users 
        SET password_hash = '$2b$12$dYgV5XqnI6kQ6pRlKzBkIevlXUD/9lSd4fhEmkUYJcGdF2E1m6QaK',
            role = 'admin'
        WHERE id = proelium_id;
        RAISE NOTICE 'User Proelium password updated';
    END IF;
END $$;

-- ===========================================
-- 5. VERIFICATION
-- ===========================================
\echo '\n=== FINAL USER LIST ==='
SELECT username, role, tenant_id, branch_id FROM users ORDER BY username;

\echo '\n=== AUTHENTICATION READY ==='
\echo 'Use these credentials:'
\echo '  admin: admin123'
\echo '  Aegis: AegisTech2026'
\echo '  Proelium: ProeliumDev2026'
\echo '\nAll users have role "admin" and tenant "Agentica System".';