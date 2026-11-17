// Sends a sample contact-form notification through Resend so the template can be checked in a real inbox.
// Usage: RESEND_API_KEY=... node development/scripts/send-test-email.js recipient@example.com

import { readFileSync } from 'node:fs';
import { renderContactNotification } from '../../backend/src/email/contact-notification.js';

async function main() {
  const to = process.argv[2];
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    console.error('Usage: RESEND_API_KEY=... node development/scripts/send-test-email.js recipient@example.com');
    process.exit(1);
  }

  const { subject, html, text } = renderContactNotification({
    name: 'Portfolio test',
    email: 'clay.net@proton.me',
    company: 'Optimus Technica',
    message: 'This is a sample message to preview the contact form email.\n\nReplying to it goes to the visitor’s address.',
  }, 'cid:clay-wordmark');

  const logo = readFileSync(new URL('../../backend/src/email/clay-wordmark.png', import.meta.url)).toString('base64');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Clay <contact@aungkaungkhant.work>',
      to: [to],
      reply_to: 'clay.net@proton.me',
      subject,
      html,
      text,
      attachments: [{ filename: 'clay-wordmark.png', content: logo, content_id: 'clay-wordmark' }],
    }),
  });
  const body = await response.json();
  if (!response.ok) {
    console.error('Resend rejected the email:', body);
    process.exit(1);
  }
  console.log('Sent:', body.id);
}

main();
