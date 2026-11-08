// Rotas da demo, independentes de HTTP: usadas pelo servidor Node e pela versão standalone (navegador).
import { escritorio } from './config.js';
import * as store from './store.js';
import * as clock from './clock.js';
import { handleMessage, runFollowups } from './agent/flow.js';
import { dashboard, enviarRelatorio } from './report.js';
import { providerInfo } from './llm/index.js';
import { parseWebhook, sendText } from './channels/evolution.js';

let ultimoRelatorio = null;

// "Cron": follow-ups vencidos e relatório das 8h.
export function tick() {
  const followups = runFollowups();
  const t = clock.now();
  const chave = t.toDateString();
  let relatorio = null;
  if (t.getHours() >= 8 && ultimoRelatorio !== chave && store.allLeads().length) { ultimoRelatorio = chave; relatorio = enviarRelatorio(t); }
  return { followups, relatorio };
}

export function state(tz = process.env.TZ) {
  const db = store.getDb();
  return {
    escritorio, tz, now: clock.now().toISOString(), ia: providerInfo(),
    leads: store.allLeads().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    lawyerInbox: db.lawyerInbox, appointments: db.appointments, dashboard: dashboard(),
  };
}

// Retorna { status, body } ou null se a rota não existir.
export async function route(method, pathname, body = {}, opts = {}) {
  const ok = (b) => ({ status: 200, body: b });
  if (method === 'POST' && pathname === '/api/chat') {
    const { phone, text, pushName } = body;
    if (!phone || !text) return { status: 400, body: { error: 'phone e text são obrigatórios' } };
    const r = await handleMessage(String(phone).replace(/\D/g, ''), text, { pushName });
    return ok({ replies: r.replies, lead: r.lead });
  }
  if (method === 'POST' && pathname === '/webhook/evolution') {
    const msg = parseWebhook(body);
    if (!msg || !msg.text) return ok({ ignored: true });
    const r = await handleMessage(msg.phone, msg.text, { pushName: msg.pushName });
    for (const t of r.replies) await sendText(msg.phone, t, msg.instance);
    return ok({ ok: true, replies: r.replies });
  }
  if (method === 'GET' && pathname === '/api/state') return ok(state(opts.tz));
  if (method === 'GET' && pathname === '/api/dashboard') return ok(dashboard());
  if (method === 'GET' && pathname === '/api/leads') return ok(store.allLeads());
  if (method === 'POST' && pathname === '/api/report') return ok(enviarRelatorio());
  if (method === 'POST' && pathname === '/api/clock') {
    const { hours, setHour } = body;
    if (setHour != null) { const d = clock.now(); if (d.getHours() >= setHour) d.setDate(d.getDate() + 1); d.setHours(setHour, 0, 0, 0); clock.setTime(d); }
    else clock.advance(Number(hours) || 0);
    const r = tick();
    return ok({ now: clock.now(), followupsEnviados: r.followups, relatorio: r.relatorio });
  }
  if (method === 'POST' && pathname === '/api/reset') { store.resetDb(); clock.reset(); ultimoRelatorio = null; return ok({ ok: true }); }
  return null;
}
