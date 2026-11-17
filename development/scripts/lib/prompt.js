// Reads one line from the terminal without echoing it. Prompts go to stderr so stdout carries
// only the generated values.
export function promptHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY) return Promise.reject(new Error('A terminal is required to enter the password without echo.'));

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (settle, result) => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
      output.write('\n');
      settle(result);
    };
    const onData = (chunk) => {
      if (chunk.startsWith('\u001b')) return;
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish(resolve, value);
        if (char === '\u0003') return finish(reject, new Error('Cancelled.'));
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };

    output.write(question);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}
