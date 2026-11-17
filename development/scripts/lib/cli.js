export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

// Runs a script body, reports a failure on stderr with exit code 1, and always exits explicitly:
// the Neon pool holds open sockets that would otherwise keep the process alive.
export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  }
  process.exit();
}
