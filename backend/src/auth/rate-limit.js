const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Every attempt is recorded before its credentials are checked, so a burst of parallel guesses
// cannot slip past the cap. A successful sign-in clears the rows again.
export async function registerAttempt(db, ip, now) {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  return db.transaction(async (query) => {
    // Serialises concurrent attempts from one IP so each count sees the others' rows.
    await query('select pg_advisory_xact_lock(hashtext($1))', [ip]);
    await query('delete from login_attempts where ip = $1 and attempted_at <= $2', [ip, since]);
    await query('insert into login_attempts (ip, attempted_at) values ($1, $2)', [ip, now.toISOString()]);
    const [{ attempts }] = await query('select count(*)::int as attempts from login_attempts where ip = $1', [ip]);
    return { locked: attempts > MAX_ATTEMPTS };
  });
}

export const clearAttempts = (query, ip) => query('delete from login_attempts where ip = $1', [ip]);
