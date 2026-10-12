// PostToolUse (Edit|Write): corre tsc --noEmit após editar .ts/.tsx; erros voltam ao Claude (exit 2).
const { spawnSync } = require('child_process');
let raw = '';
process.stdin.on('data', d => (raw += d)).on('end', () => {
  let file = '';
  try { file = JSON.parse(raw).tool_input.file_path || ''; } catch {}
  if (!/\.(ts|tsx)$/.test(file)) process.exit(0);
  const r = spawnSync('npx tsc --noEmit --pretty false', { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(), encoding: 'utf8', shell: true });
  if (r.status !== 0) {
    process.stderr.write('tsc encontrou erros:\n' + (r.stdout || '') + (r.stderr || ''));
    process.exit(2);
  }
});
