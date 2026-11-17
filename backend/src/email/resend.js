const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 8000;

export function createResendMailer(apiKey) {
  return {
    async send({ from, to, replyTo, subject, html, text }) {
      const res = await fetch(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html, text }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Resend rejected the message with status ${res.status}`);
      const { id } = await res.json();
      return { id };
    },
  };
}
