const DAY = 86_400_000;

export function activityWindows(asOf = new Date()) {
  const to = new Date(asOf);
  if (!Number.isFinite(to.getTime())) throw new Error('Invalid --as-of timestamp.');
  return {
    to: to.toISOString(),
    from30: new Date(to.getTime() - 30 * DAY).toISOString(),
    from365: new Date(to.getTime() - 365 * DAY).toISOString(),
  };
}

export function validateSnapshot(snapshot) {
  if (snapshot && snapshot.version !== 4) throw new Error('Obsolete activity snapshot. Recollect version-4 yearly profile contributions and recent commit counts.');
  if (!snapshot || !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(snapshot.username ?? ''))
    throw new Error('Invalid activity snapshot or username.');
  for (const key of ['commits30d', 'contributions365d'])
    if (!Number.isSafeInteger(snapshot[key]) || snapshot[key] < 0) throw new Error(`Invalid ${key}.`);
  if (snapshot.commits30d > snapshot.contributions365d) throw new Error('30-day commits exceed 365-day contributions.');
  const expected = activityWindows(snapshot.windows?.to);
  if (!snapshot.windows || Object.keys(expected).some(key => expected[key] !== snapshot.windows[key]))
    throw new Error('Snapshot windows must be rolling 30 and 365 days with a shared endpoint.');
  if (snapshot.scope !== 'yearly-profile-contributions-and-recent-commits') throw new Error('Invalid snapshot scope.');
  return snapshot;
}

export async function collectActivity(username, {
  token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
  asOf = new Date(), fetchImpl = fetch,
} = {}) {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username ?? '')) throw new Error('Invalid GitHub username.');
  if (!token) throw new Error('Set GH_TOKEN or GITHUB_TOKEN. GitHub GraphQL requires authentication. Never pass a token as a CLI argument.');
  const windows = activityWindows(asOf);
  const query = `query GitCubeActivity($login: String!, $from30: DateTime!, $from365: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      recent: contributionsCollection(from: $from30, to: $to) { totalCommitContributions }
      yearly: contributionsCollection(from: $from365, to: $to) { contributionCalendar { totalContributions } }
    }
  }`;
  const response = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'git-cube/0.1.0' },
    body: JSON.stringify({ query, variables: { login: username, ...windows } }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`GitHub API returned HTTP ${response.status}. Check token access and rate limits.`);
  const result = await response.json();
  // Do not log API response bodies or headers: they can expose private information.
  if (result.errors?.length) throw new Error('GitHub GraphQL rejected the activity query. Check username, token permissions, and rate limits.');
  const user = result.data?.user;
  if (!user) throw new Error(`GitHub user ${username} was not found.`);
  return validateSnapshot({
    version: 4, username: user.login, windows,
    commits30d: user.recent?.totalCommitContributions,
    // The calendar already includes visible private activity. Do not add
    // restrictedContributionsCount again or treat those anonymous events as commits.
    contributions365d: user.yearly?.contributionCalendar?.totalContributions,
    scope: 'yearly-profile-contributions-and-recent-commits',
  });
}
