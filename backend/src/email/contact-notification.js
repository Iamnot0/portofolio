// Email sent to Clay when a visitor submits the portfolio contact form.
// Every visitor-supplied value is escaped; layout uses tables and inline styles for email clients.

const COLORS = {
  page: '#ece6dc',
  card: '#f6f1ea',
  ink: '#1c1814',
  muted: '#5f564d',
  line: '#ddd5c9',
};
const SERIF = "Fraunces, Georgia, 'Times New Roman', serif";
const SANS = "'Schibsted Grotesk', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const SITE = 'https://www.aungkaungkhant.work';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function singleLine(value, max) {
  return String(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function formatReceived(date) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Yangon',
  }).format(date) + ' (Yangon)';
}

function detailRow(label, valueHtml) {
  return `
          <tr>
            <td style="padding:6px 0;width:96px;vertical-align:top;font:500 13px/1.5 ${SANS};color:${COLORS.muted};">${label}</td>
            <td style="padding:6px 0;vertical-align:top;font:400 15px/1.5 ${SANS};color:${COLORS.ink};">${valueHtml}</td>
          </tr>`;
}

/**
 * @param {object} submission
 * @param {string} submission.name
 * @param {string} submission.email
 * @param {string} [submission.company]
 * @param {string} submission.message
 * @param {Date} [submission.receivedAt]
 * @param {string} logoSrc URL (or cid:) of the Clay wordmark image
 * @returns {{ subject: string, html: string, text: string }}
 */
function renderContactNotification({ name, email, company = '', message, receivedAt = new Date() }, logoSrc) {
  const cleanName = singleLine(name, 120);
  const cleanEmail = singleLine(email, 254);
  const cleanCompany = singleLine(company, 120);
  const received = formatReceived(receivedAt);
  const firstName = cleanName.split(' ')[0] || cleanName;
  const replyHref = `mailto:${encodeURIComponent(cleanEmail)}?subject=${encodeURIComponent('Re: your message to Clay')}`;
  const messageHtml = escapeHtml(message.trim()).replace(/\r?\n/g, '<br>');

  const subject = `New message from ${cleanName}`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(`${cleanName} wrote through your portfolio.`)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.page};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:${COLORS.card};border:1px solid ${COLORS.line};border-radius:10px;">
          <tr>
            <td style="padding:32px 36px 8px;">
              <img src="${logoSrc}" width="74" height="47" alt="Clay" style="display:block;border:0;width:74px;height:47px;">
            </td>
          </tr>
          <tr>
            <td style="padding:16px 36px 4px;">
              <h1 style="margin:0;font:400 28px/1.15 ${SERIF};letter-spacing:-0.02em;color:${COLORS.ink};">New message from your portfolio</h1>
              <p style="margin:8px 0 0;font:400 14px/1.5 ${SANS};color:${COLORS.muted};">Received ${escapeHtml(received)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 4px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid ${COLORS.line};border-bottom:1px solid ${COLORS.line};">
                <tr><td style="height:8px;" colspan="2"></td></tr>${detailRow('Name', escapeHtml(cleanName))}${detailRow('Email', `<a href="mailto:${escapeHtml(cleanEmail)}" style="color:${COLORS.ink};text-decoration:none;">${escapeHtml(cleanEmail)}</a>`)}${cleanCompany ? detailRow('Company', escapeHtml(cleanCompany)) : ''}
                <tr><td style="height:8px;" colspan="2"></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 8px;">
              <div style="padding:18px 20px;background:${COLORS.page};border-radius:8px;font:400 16px/1.6 ${SANS};color:${COLORS.ink};">${messageHtml}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 32px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:${COLORS.ink};border-radius:6px;">
                    <a href="${replyHref}" style="display:inline-block;padding:12px 20px;font:500 15px/1 ${SANS};color:${COLORS.card};text-decoration:none;">Reply to ${escapeHtml(firstName)}</a>
                  </td>
                </tr>
              </table>
              <p style="margin:12px 0 0;font:400 13px/1.5 ${SANS};color:${COLORS.muted};">Or just hit reply: it goes straight to ${escapeHtml(cleanEmail)}.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 32px;border-top:1px solid ${COLORS.line};">
              <img src="${logoSrc}" width="44" height="28" alt="Clay" style="display:block;border:0;width:44px;height:28px;">
              <p style="margin:10px 0 0;font:500 14px/1.5 ${SANS};color:${COLORS.ink};">Aung Kaung Khant</p>
              <p style="margin:0;font:400 13px/1.5 ${SANS};color:${COLORS.muted};">Full Stack Engineer · Founder of MR ROBOT · Yangon</p>
              <p style="margin:8px 0 0;font:400 13px/1.5 ${SANS};">
                <a href="${SITE}" style="color:${COLORS.ink};text-decoration:none;">aungkaungkhant.work</a>
                <span style="color:${COLORS.muted};">&nbsp;·&nbsp;</span>
                <a href="https://www.linkedin.com/in/akkhant/" style="color:${COLORS.ink};text-decoration:none;">LinkedIn</a>
                <span style="color:${COLORS.muted};">&nbsp;·&nbsp;</span>
                <a href="https://optimustechnica.com/" style="color:${COLORS.ink};text-decoration:none;">Optimus Technica</a>
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font:400 12px/1.5 ${SANS};color:${COLORS.muted};">Sent by the contact form on aungkaungkhant.work</p>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    'New message from your portfolio',
    `Received ${received}`,
    '',
    `Name: ${cleanName}`,
    `Email: ${cleanEmail}`,
    ...(cleanCompany ? [`Company: ${cleanCompany}`] : []),
    '',
    message.trim(),
    '',
    `Reply to this email to answer ${firstName} directly.`,
    '',
    '--',
    'Aung Kaung Khant (Clay)',
    'Full Stack Engineer · Founder of MR ROBOT · Yangon',
    'aungkaungkhant.work',
  ].join('\n');

  return { subject, html, text };
}

export { renderContactNotification, escapeHtml };
