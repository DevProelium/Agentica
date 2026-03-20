-- Reset all user passwords to 'admin123' (bcrypt hash)
-- This will allow login with any user using password 'admin123'
-- Run with: Get-Content .\docker\reset_all_passwords.sql | docker exec -i agentica_db psql -U agentica -d agentica_inventory

-- Hash for 'admin123' (bcrypt 12)
\set admin_hash '\$2b\$12\$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW'

UPDATE users 
SET password_hash = :'admin_hash'
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND username IN ('admin', 'Aegis', 'Proelium');

-- Verify
SELECT username, SUBSTRING(password_hash, 1, 30) || '...' AS hash_prefix FROM users ORDER BY username;

\echo '\nAll passwords reset to admin123'
\echo 'You can now login with:'
\echo '  admin / admin123'
\echo '  Aegis / admin123'
\echo '  Proelium / admin123'