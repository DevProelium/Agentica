-- Quick verification of users
SELECT 
    username, 
    role,
    tenant_id,
    branch_id,
    SUBSTRING(password_hash, 1, 30) || '...' AS hash_prefix,
    LENGTH(password_hash) AS hash_len,
    CASE 
        WHEN password_hash LIKE '$2b$12$%' THEN 'bcrypt 12'
        WHEN password_hash LIKE '$2a$12$%' THEN 'bcrypt 12 (2a)'
        WHEN password_hash LIKE '$2b$10$%' THEN 'bcrypt 10'
        ELSE 'other'
    END AS hash_type
FROM users 
ORDER BY username;