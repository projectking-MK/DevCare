import bcrypt from 'bcryptjs';

const password = process.argv[2];

if (!password) {
  console.log('Usage: npm run hash-password -- <your_password>');
  console.log('Example: npm run hash-password -- "MySecurePassword123!"');
  process.exit(1);
}

bcrypt.hash(password, 12).then((hash) => {
  console.log('\n--- GuardianLink Password Hash Generator ---');
  console.log('Password hash generated successfully:');
  console.log(hash);
  console.log('\nAdd this to your .env file:');
  console.log(`PARENT_PASSWORD_HASH="${hash}"\n`);
});
