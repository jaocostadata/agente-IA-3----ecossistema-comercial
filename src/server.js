// Servidor da demo: simulador de WhatsApp + API + webhook Evolution.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, escritorio } from './config.js';
import * as store from './store.js';
import * as clock from './clock.js';
import { handleMessage, runFollowups } from './agent/flow.js';
import { dashboard, enviarRelatorio } from './report.js';
import { providerInfo } from './llm/index.js';
import { parseWebhook, sendText } from './channels/evolution.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

// "Cron" interno: a cada minuto verifica follow-ups vencidos e o relatório das 8h.
let ultimoRelatorio = null;
function tick() {
  const followups = runFollowups();
  const t = clock.now();
  const chave = t.toDateString();
  let relatorio = null;
  if (t.getHours() >= 8 && ultimoRelatorio !== chave && store.allLeads().length) { ultimoRelatorio = chave; relatorio = enviarRelatorio(t); }
  return { followups, relatorio };
}

const json = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((ok, fail) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { fail(e); } });
});

function state() {
  const db = store.getDb();
  return {
    escritorio, tz: process.env.TZ, now: clock.now().toISOString(), ia: providerInfo(),
    leads: store.allLeads().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    lawyerInbox: db.lawyerInbox, appointments: db.appointments, dashboard: dashboard(),
  };
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { phone, text, pushName } = await readBody(req);
        if (!phone || !text) return json(res, 400, { error: 'phone e text são obrigatórios' });
        const r = await handleMessage(String(phone).replace(/\D/g, ''), text, { pushName });
        return json(res, 200, { replies: r.replies, lead: r.lead });
      }
      if (req.method === 'POST' && url.pathname === '/webhook/evolution') {
        const msg = parseWebhook(await readBody(req));
        if (!msg || !msg.text) return json(res, 200, { ignored: true });
        const r = await handleMessage(msg.phone, msg.text, { pushName: msg.pushName });
        for (const t of r.replies) await sendText(msg.phone, t, msg.instance);
        return json(res, 200, { ok: true, replies: r.replies });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, state());
      if (req.method === 'GET' && url.pathname === '/api/dashboard') return json(res, 200, dashboard());
      if (req.method === 'GET' && url.pathname === '/api/leads') return json(res, 200, store.allLeads());
      if (req.method === 'POST' && url.pathname === '/api/report') return json(res, 200, enviarRelatorio());
      if (req.method === 'POST' && url.pathname === '/api/clock') {
        const { hours, setHour } = await readBody(req);
        if (setHour != null) { const d = clock.now(); if (d.getHours() >= setHour) d.setDate(d.getDate() + 1); d.setHours(setHour, 0, 0, 0); clock.setTime(d); }
        else clock.advance(Number(hours) || 0);
        const r = tick();
        return json(res, 200, { now: clock.now(), followupsEnviados: r.followups, relatorio: r.relatorio });
      }
      if (req.method === 'POST' && url.pathname === '/api/reset') { store.resetDb(); clock.reset(); ultimoRelatorio = null; return json(res, 200, { ok: true }); }
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
