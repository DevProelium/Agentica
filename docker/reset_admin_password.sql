-- Reset admin password to 'admin123' (bcrypt 12)
-- Run with: Get-Content .\docker\reset_admin_password.sql | docker exec -i agentica_db psql -U agentica -d agentica_inventory

-- Ensure admin user exists with correct tenant
DO $$
DECLARE
    default_tenant_id UUID := '00000000-0000-0000-0000-000000000001';
    admin_user_id UUID;
BEGIN
    -- Check if admin user exists
    SELECT id INTO admin_user_id FROM users WHERE username = 'admin' AND tenant_id = default_tenant_id;
    
    IF admin_user_id IS NULL THEN
        -- Create admin user if missing
        INSERT INTO users (id, username, password_hash, role, tenant_id, branch_id)
        VALUES (
            gen_random_uuid(),
            'admin',
            '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', -- 'admin123'
            'admin',
            default_tenant_id,
            NULL -- branch_id NULL for tenant admin
        )
        ON CONFLICT (tenant_id, username) DO UPDATE SET
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role;
        RAISE NOTICE 'Admin user created (or updated)';
    ELSE
        -- Update password for existing admin
        UPDATE users 
        SET password_hash = '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'
        WHERE id = admin_user_id;
        RAISE NOTICE 'Admin password reset to admin123';
    END IF;
END $$;

-- Verify
SELECT username, role, tenant_id, branch_id FROM users WHERE username = 'admin';