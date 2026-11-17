const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function isLockedOut(db, ip, now) {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  const [{ failures }] = await db.query(
    'select count(*)::int as failures from login_attempts where ip = $1 and attempted_at > $2',
    [ip, since],
  );
  return failures >= MAX_FAILURES;
}

export async function recordFailure(db, ip, now) {
  await db.query('insert into login_attempts (ip, attempted_at) values ($1, $2)', [ip, now.toISOString()]);
}

export async function clearFailures(db, ip) {
  await db.query('delete from login_attempts where ip = $1', [ip]);
}
