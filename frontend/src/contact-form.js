import { submitContact } from './contact.js';

const SENDING = 'Sending…';
const THANKS = 'Thanks. Your message is on its way.';

export function setupContactForm(form) {
  const status = form.querySelector('#contactStatus');
  const submit = form.querySelector('button[type="submit"]');
  const idleLabel = submit.textContent;
  let startedAt = null;

  // The server ignores submissions made too quickly to be typed, so timing starts at first focus.
  form.addEventListener('focusin', () => { startedAt ??= Date.now(); });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = SENDING;
    status.textContent = '';

    const result = await submitContact({
      name: data.get('name'),
      email: data.get('email'),
      company: data.get('company'),
      message: data.get('message'),
      website: data.get('website'),
      startedAt: startedAt ?? Date.now(),
    });

    if (result.ok) {
      const thanks = document.createElement('p');
      thanks.className = 'form-thanks';
      thanks.setAttribute('role', 'status');
      thanks.tabIndex = -1;
      thanks.textContent = THANKS;
      form.replaceWith(thanks);
      thanks.focus({ preventScroll: true });
      return;
    }
    status.textContent = result.error;
    submit.disabled = false;
    submit.textContent = idleLabel;
  });
}
