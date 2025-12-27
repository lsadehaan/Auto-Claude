import bcrypt from 'bcrypt';
import { createInterface } from 'readline';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('');
  console.log('='.repeat(50));
  console.log('  Auto-Claude Web Server Password Setup');
  console.log('='.repeat(50));
  console.log('');

  const password = await question('Enter password: ');

  if (!password || password.length < 4) {
    console.error('Password must be at least 4 characters');
    process.exit(1);
  }

  const confirmPassword = await question('Confirm password: ');

  if (password !== confirmPassword) {
    console.error('Passwords do not match');
    process.exit(1);
  }

  // Hash the password
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  console.log('');
  console.log('Password hash generated.');

  // Update or create .env file
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');

    // Replace existing password hash if present
    if (envContent.includes('AUTO_CLAUDE_PASSWORD_HASH=')) {
      envContent = envContent.replace(
        /AUTO_CLAUDE_PASSWORD_HASH=.*/,
        `AUTO_CLAUDE_PASSWORD_HASH=${hash}`
      );
    } else {
      envContent += `\nAUTO_CLAUDE_PASSWORD_HASH=${hash}\n`;
    }
  } else {
    envContent = `# Auto-Claude Web Server Configuration
AUTO_CLAUDE_PASSWORD_HASH=${hash}

# Copy other settings from .env.example
`;
  }

  writeFileSync(envPath, envContent);

  console.log(`Updated: ${envPath}`);
  console.log('');
  console.log('Password setup complete!');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
