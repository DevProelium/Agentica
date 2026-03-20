const bcrypt = require('bcryptjs');

const users = [
  { username: 'admin', password: 'admin123' },
  { username: 'Aegis', password: 'AegisTech2026' },
  { username: 'Proelium', password: 'ProeliumDev2026' }
];

async function generateHashes() {
  console.log('Generating real bcrypt hashes...\n');
  
  for (const user of users) {
    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(user.password, salt);
    
    console.log(`Username: ${user.username}`);
    console.log(`Password: ${user.password}`);
    console.log(`Hash: ${hash}`);
    console.log(`SQL: UPDATE users SET password_hash = '${hash}' WHERE username = '${user.username}' AND tenant_id = '00000000-0000-0000-0000-000000000001';`);
    console.log('---\n');
  }
}

generateHashes().catch(console.error);