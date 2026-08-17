#!/usr/bin/env node
/**
 * Zero-dependency static server for local development.
 *
 *   node server.js                 -> http://localhost:8080
 *   node server.js --https         -> https://localhost:8443 (self-signed)
 *   node server.js --port 3000
 *
 * Use --https when you want to test the camera overlay from a phone on the
 * same network: getUserMedia only works on https:// or localhost.
 */

import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const useHttps = args.includes('--https');
const portArg = args.indexOf('--port');
const port = Number(portArg > -1 ? args[portArg + 1] : useHttps ? 8443 : 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.join(root, rel);

  // Never serve anything outside the project directory.
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(file, (err, stat) => {
    const target = !err && stat.isDirectory() ? path.join(file, 'index.html') : file;
    fs.readFile(target, (readErr, data) => {
      if (readErr) {
        res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(target)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(data);
    });
  });
}

function selfSignedCert() {
  const dir = path.join(root, '.certs');
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  if (!fs.existsSync(key) || !fs.existsSync(cert)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log('Generating a self-signed certificate in .certs/ …');
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', key, '-out', cert,
      '-days', '365', '-subj', '/CN=image-graph.local',
    ], { stdio: 'inherit' });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

const server = useHttps ? https.createServer(selfSignedCert(), handler) : http.createServer(handler);

server.listen(port, () => {
  const scheme = useHttps ? 'https' : 'http';
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `  ${scheme}://${i.address}:${port}`);
  console.log(`Image Graph running:\n  ${scheme}://localhost:${port}`);
  if (addresses.length) console.log(addresses.join('\n'));
  if (!useHttps) console.log('\nFor camera access from a phone, run: node server.js --https');
});
