// Generate bcrypt hashes for passwords
const bcrypt = require('bcryptjs');

const passwords = [
  { username: 'Aegis', password: 'Aegis' },
  { username: 'Proelium', password: 'proeliumDev' },
  { username: 'admin', password: 'admin123' }
];

(async () => {
  console.log('Generating bcrypt hashes (cost 12)...');
  for (const { username, password } of passwords) {
    const hash = await bcrypt.hash(password, 12);
    console.log(`\n${username}:`);
    console.log(`  Password: ${password}`);
    console.log(`  Hash:     ${hash}`);
    console.log(`  SQL:      UPDATE users SET password_hash = '${hash}' WHERE username = '${username}';`);
  }
})();