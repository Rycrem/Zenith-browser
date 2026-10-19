'use strict';

// Lancé par la commande « update » de dev-brows, avec le node du système.
// Attend que l'appli soit fermée (sous Windows, Electron ne peut pas être remplacé pendant qu'il tourne),
// met à jour, écrit un compte rendu, puis relance l'appli.
// Usage : node scripts/update.js <dossier de l'appli> <pid de l'appli> <app|electron> <fichier de compte rendu>

const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const [appDir, pid, mode, reportFile] = process.argv.slice(2);
const win = process.platform === 'win32';
const steps = [];

function alive(p) {
  try {
    process.kill(Number(p), 0);
    return true;
  } catch {
    return false;
  }
}

function electronVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(appDir, 'node_modules', 'electron', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: appDir, shell: win, encoding: 'utf8' });
  const ok = r.status === 0;
  const output = `${r.stdout || ''}${r.stderr || ''}`.trim().split('\n').slice(-6).join('\n');
  steps.push({ cmd: [cmd, ...args].join(' '), ok, output: r.error ? r.error.message : output });
  return ok;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

for (let i = 0; i < 60 && alive(pid); i++) sleep(500);

const before = electronVersion();
let ok = true;
if (fs.existsSync(path.join(appDir, '.git'))) ok = run('git', ['pull', '--ff-only']) && ok;
ok = run('npm', ['install']) && ok;
if (mode === 'electron') ok = run('npm', ['install', '--save-dev', 'electron@latest']) && ok;
else ok = run('npm', ['update']) && ok;
const after = electronVersion();

fs.writeFileSync(reportFile, JSON.stringify({ ok, mode, before, after, steps, time: Date.now() }, null, 2));

spawn('npm', ['start'], { cwd: appDir, detached: true, stdio: 'ignore', shell: win }).unref();
