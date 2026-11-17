// Generates the admin password hash and a new TOTP secret to paste into Vercel environment variables.
// Usage: node development/scripts/admin-credentials.js
import QRCode from 'qrcode';
import { runCli } from './lib/cli.js';
import { createCredentials, passwordProblem } from './lib/admin-credentials.js';
import { promptHidden } from './lib/prompt.js';

await runCli(async () => {
  const password = await promptHidden('Admin password: ');
  const confirmation = await promptHidden('Repeat password: ');
  const problem = passwordProblem(password, confirmation);
  if (problem) throw new Error(problem);

  const { passwordHash, totpSecret, totpUri } = await createCredentials(password);
  console.log(`ADMIN_PASSWORD_HASH=${passwordHash}`);
  console.log(`ADMIN_TOTP_SECRET=${totpSecret}`);
  console.log(`\nScan with an authenticator app:\n${await QRCode.toString(totpUri, { type: 'terminal', small: true })}`);
});
