import { createContactSession } from './contact.js';

const SENDING = 'Sending…';
const THANKS = 'Thanks. Your message is on its way.';

export function setupContactForm(form) {
  const status = form.querySelector('#contactStatus');
  const submit = form.querySelector('button[type="submit"]');
  const idleLabel = submit.textContent;
  const session = createContactSession();

  // The server times the form from a token it issues on first focus.
  form.addEventListener('focusin', () => session.begin());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    submit.disabled = true;
    submit.textContent = SENDING;
    status.textContent = '';

    const result = await session.submit({
      name: data.get('name'),
      email: data.get('email'),
      company: data.get('company'),
      message: data.get('message'),
      website: data.get('website'),
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
