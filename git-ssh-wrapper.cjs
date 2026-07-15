// git-ssh-wrapper.cjs — بديل لأمر ssh باستخدام حزمة ssh2 (لأن ssh غير مثبّت في البيئة)
// يُستخدم عبر: GIT_SSH_COMMAND="node /home/z/my-project/git-ssh-wrapper.cjs"
const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(process.env.HOME, '.ssh', 'id_ed25519'), 'utf8');
const args = process.argv.slice(2);

// اجمع host والأمر (تخطّى خيارات ssh مثل -o)
let host = 'git@github.com';
let hostIdx = -1;
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('-')) { continue; }
  if (args[i].includes('@')) { host = args[i]; hostIdx = i; break; }
}
const [username, hostname] = host.split('@');
const cmd = args.slice(hostIdx + 1).join(' ');

const conn = new Client();
conn.on('ready', () => {
  if (!cmd) { conn.end(); process.exit(0); }
  conn.exec(cmd, (err, stream) => {
    if (err) { process.stderr.write(err.message + '\n'); process.exit(1); }
    process.stdin.pipe(stream.stdin);
    stream.stdout.pipe(process.stdout);
    stream.stderr.pipe(process.stderr);
    stream.on('exit', (code) => { conn.end(); process.exit(code || 0); });
  });
}).on('error', err => {
  process.stderr.write('SSH: ' + err.message + '\n');
  process.exit(1);
}).connect({
  host: hostname,
  port: 22,
  username,
  privateKey,
  readyTimeout: 30000,
  algorithms: {
    serverHostKey: ['ssh-ed25519', 'ecdsa-sha2-nistp256', 'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'],
  },
});
