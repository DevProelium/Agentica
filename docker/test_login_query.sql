-- Test the exact login query
SELECT u.id, u.username, u.password_hash, u.role, 
       u.tenant_id, u.branch_id,
       t.name AS tenant_name,
       b.name AS branch_name
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
LEFT JOIN branches b ON u.branch_id = b.id
WHERE u.username = 'admin';