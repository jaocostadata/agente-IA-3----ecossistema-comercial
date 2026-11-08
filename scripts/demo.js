// Demo no terminal: roda os cenários e mostra conversa, classificação, briefing e relatório das 8h.
import * as store from '../src/store.js';
import * as clock from '../src/clock.js';
import { handleMessage, runFollowups } from '../src/agent/flow.js';
import { enviarRelatorio, dashboard } from '../src/report.js';
import { providerInfo } from '../src/llm/index.js';
import { SCENARIOS } from '../public/scenarios.js';

const C = { g: '\x1b[32m', c: '\x1b[36m', y: '\x1b[33m', m: '\x1b[35m', d: '\x1b[2m', b: '\x1b[1m', r: '\x1b[0m' };
const ind = (t, p) => t.split('\n').map((l) => p + l).join('\n');
const only = process.argv[2];

store.load({ inMemory: true });
console.log(`${C.b}⚖️  Demo Sinapta — agente de atendimento trabalhista${C.r}  ${C.d}(IA: ${JSON.stringify(providerInfo())})${C.r}\n`);

// usa a próxima quarta-feira como "dia da demo" para mostrar horário comercial x fora do horário
let base = new Date(); base.setHours(0, 0, 0, 0);
while (base.getDay() !== 3) base.setDate(base.getDate() + 1);
for (const s of SCENARIOS.filter((x) => !only || x.id === only)) {
  const t = new Date(base); t.setHours(s.hora, 0, 0, 0); clock.setTime(t);
  console.log(`${C.b}${C.m}━━━ Cenário: ${s.titulo} — ${String(s.hora).padStart(2, '0')}h ━━━${C.r}`);
  let lead;
  for (const m of s.msgs) {
    console.log(ind(m, `${C.g}  👤 ${s.pushName}: ${C.r}`));
    const r = await handleMessage(s.phone, m, { pushName: s.pushName });
    lead = r.lead;
    r.replies.forEach((x) => console.log(ind(x, `${C.c}  🤖 ${C.r}`)));
    clock.advance(0.03);
  }
  const c = lead.classificacao;
  const ok = c.temperatura === s.esperado;
  const sufixo = s.esperado == null ? '— parcial: lead parou de responder' : ok ? '✓' : '✗ esperado ' + s.esperado;
  console.log(`${C.y}  → classificação: ${c.temperatura.toUpperCase()}${c.urgente ? ' + URGENTE' : ''} (score ${c.score}) ${sufixo}${C.r}\n`);
}

const inbox = store.getDb().lawyerInbox;
console.log(`${C.b}${C.m}━━━ WhatsApp do advogado (${inbox.length} mensagens) ━━━${C.r}`);
const briefing = inbox.find((m) => m.tipo === 'briefing');
if (briefing) console.log(ind(briefing.text, '  ') + '\n');
console.log(`  ${C.d}tipos recebidos: ${inbox.map((m) => m.tipo).join(', ')}${C.r}\n`);

const amanha8 = new Date(base.getTime() + 86400000); amanha8.setHours(8, 0, 0, 0);
clock.setTime(amanha8);
console.log(`${C.b}${C.m}━━━ Relatório diário (dia seguinte, 08:00) ━━━${C.r}`);
console.log(ind(enviarRelatorio(amanha8).text, '  '));

for (const [rotulo, h] of [['+24h', 24], ['+48h', 48], ['+7 dias', 24 * 7]]) {
  const t = new Date(base); t.setHours(23, 30, 0, 0); clock.setTime(new Date(t.getTime() + h * 3600000));
  const fu = runFollowups();
  console.log(`\n${C.b}${C.m}━━━ Follow-up automático ${rotulo}: ${fu.length} mensagem(ns) ━━━${C.r}`);
  fu.forEach((f) => console.log(ind(f.text, `  ${C.c}[${f.tipo} → +${f.phone}] ${C.r}`)));
}
console.log(`\n${C.d}dashboard: ${JSON.stringify(dashboard(amanha8))}${C.r}`);
