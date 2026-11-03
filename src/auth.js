import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);

export async function githubToken({ useGitCredential = false } = {}) {
  const environment = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (environment) return environment;
  try {
    const { stdout } = await execute('gh', ['auth', 'token', '--hostname', 'github.com'], { windowsHide: true, timeout: 10_000 });
    if (stdout.trim()) return stdout.trim();
  } catch { /* The CLI may not be installed or authenticated. */ }
  if (useGitCredential) {
    // Explicit opt-in. Disable all interactive prompts; request github.com only.
    try {
      const credential = await new Promise((resolve, reject) => {
        const child = execFile('git', ['credential', 'fill'], {
          windowsHide: true, timeout: 15_000,
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
        }, (error, stdout) => error ? reject(new Error('No stored GitHub credential is available.')) : resolve(stdout));
        child.stdin.end('protocol=https\nhost=github.com\n\n');
      });
      const password = credential.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
      if (password) return password;
    } catch { /* Return a safe, credential-free error from collection. */ }
  }
  return undefined;
}
