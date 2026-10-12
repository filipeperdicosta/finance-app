// PreToolUse (Bash, if git push*): tsc --noEmit antes do push; falha bloqueia (exit 2).
const { spawnSync } = require('child_process');
const r = spawnSync('npx tsc --noEmit --pretty false', { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', shell: true });
if (r.status !== 0) {
  process.stderr.write('Push bloqueado: tsc tem erros (a Vercel falharia o build):\n' + (r.stdout || '') + (r.stderr || ''));
  process.exit(2);
}
