// PreToolUse (Edit|Write): bloqueia .env* e package-lock.json.
let raw = '';
process.stdin.on('data', d => (raw += d)).on('end', () => {
  let file = '';
  try { file = JSON.parse(raw).tool_input.file_path || ''; } catch {}
  const base = require('path').win32.basename(file);
  if (/^\.env(\..*)?$/.test(base) || base === 'package-lock.json') {
    process.stderr.write(`Bloqueado: ${base} é protegido (segredos / ficheiro gerado). Edita manualmente se for mesmo preciso.`);
    process.exit(2);
  }
});
