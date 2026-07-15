import { Client } from 'ssh2';
import fs from 'fs';
const privateKey = fs.readFileSync(process.env.HOME + '/.ssh/id_ed25519', 'utf8');
const args = process.argv.slice(2);
let hostIdx = -1, host = 'git@github.com';
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('-')) { i++; continue; }
  if (args[i].includes('@')) { host = args[i]; hostIdx = i; break; }
}
const [username, hostname] = host.split('@');
const cmd = args.slice(hostIdx + 1).join(' ');
const conn = new Client();
conn.on('ready', () => {
  if (!cmd) { conn.end(); process.exit(0); }
  conn.exec(cmd, (err, stream) => {
    if (err) { process.stderr.write(err.message + '\n'); process.exit(1); }
    process.stdin.pipe(stream);
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('exit', code => { conn.end(); process.exit(code || 0); });
  });
}).on('error', err => { process.stderr.write('SSH: ' + err.message + '\n'); process.exit(1); })
.connect({ host: hostname, username, privateKey, readyTimeout: 30000 });
