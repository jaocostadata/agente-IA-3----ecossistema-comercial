// Servidor da demo: simulador de WhatsApp + API + webhook Evolution.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, escritorio } from './config.js';
import * as store from './store.js';
import { route, tick } from './api.js';
import { providerInfo } from './llm/index.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, fail) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { fail(e); } });
});

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      const r = await route(req.method, url.pathname, req.method === 'POST' ? await readBody(req) : {});
      if (r) return json(res, r.status, r.body);
      if (req.method === 'GET') {
        const f = path.join(ROOT, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
        if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) {
          res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
          return fs.createReadStream(f).pipe(res);
        }
      }
      json(res, 404, { error: 'não encontrado' });
    } catch (e) {
      console.error(e);
      json(res, 500, { error: e.message });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  store.load();
  setInterval(tick, 60_000);
  createServer().listen(env.port, () => {
    const ia = providerInfo();
    console.log(`\n⚖️  Sinapta · Agente de Atendimento — ${escritorio.nome}`);
    console.log(`   Simulador WhatsApp:  http://localhost:${env.port}`);
    console.log(`   Webhook Evolution:   POST http://localhost:${env.port}/webhook/evolution`);
    console.log(`   IA: respostas=${ia.flash} · briefings=${ia.pro}\n`);
  });
}
