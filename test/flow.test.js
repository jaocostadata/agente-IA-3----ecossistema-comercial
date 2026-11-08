import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../src/store.js';
import * as clock from '../src/clock.js';
import { handleMessage, runFollowups } from '../src/agent/flow.js';
import { relatorioDiario } from '../src/report.js';
import { parseWebhook } from '../src/channels/evolution.js';
import { SCENARIOS } from '../public/scenarios.js';

beforeEach(() => { store.load({ inMemory: true }); clock.setTime(new Date('2026-11-11T22:00:00')); });

async function run(s) {
  let r;
  for (const m of s.msgs) { r = await handleMessage(s.phone, m, { pushName: s.pushName }); clock.advance(0.02); }
  return r.lead;
}

for (const s of SCENARIOS.filter((x) => x.esperado)) {
  test(`cenário "${s.titulo}" termina como ${s.esperado}`, async () => {
    const lead = await run(s);
    assert.equal(lead.classificacao.temperatura, s.esperado);
  });
}

test('agendamento gera briefing para o advogado com nome, problema e consulta', async () => {
  const lead = await run(SCENARIOS.find((s) => s.id === 'rescisao'));
  assert.equal(lead.stage, 'agendado');
  const b = store.getDb().lawyerInbox.find((m) => m.tipo === 'briefing');
  assert.match(b.text, /Carlos Eduardo/);
  assert.match(b.text, /Verbas rescisórias/);
  assert.match(b.text, /Consulta:/);
});

test('urgência avisa o advogado imediatamente', async () => {
  await handleMessage('5583900000001', 'sofri um acidente na fábrica e estou afastado');
  assert.ok(store.getDb().lawyerInbox.some((m) => m.tipo === 'urgente'));
});

test('follow-ups 24h/48h/7d e cancelamento quando o lead responde', async () => {
  await handleMessage('5583900000002', 'oi');
  await handleMessage('5583900000002', 'Rita');
  clock.advance(25);
  assert.equal(runFollowups().length, 1);
  await handleMessage('5583900000002', 'trabalho sem carteira assinada');
  clock.advance(1);
  assert.equal(runFollowups().length, 0);
  clock.advance(24 * 8);
  assert.deepEqual(runFollowups().map((f) => f.tipo), ['24h', '48h', '7d']);
});

test('opt-out encerra e não agenda follow-up', async () => {
  await handleMessage('5583900000003', 'oi');
  const r = await handleMessage('5583900000003', 'não quero mais receber mensagens');
  assert.equal(r.lead.stage, 'encerrado');
  clock.advance(24 * 8);
  assert.equal(runFollowups().length, 0);
});

test('relatório diário lista leads quentes', async () => {
  await run(SCENARIOS.find((s) => s.id === 'rescisao'));
  clock.setTime(new Date('2026-11-12T08:00:00'));
  const r = relatorioDiario(clock.now());
  assert.match(r, /Quentes: 1/);
  assert.match(r, /Carlos Eduardo/);
});

test('webhook Evolution: parse de messages.upsert', () => {
  const m = parseWebhook({ event: 'messages.upsert', instance: 'esc', data: { key: { remoteJid: '5583999990000@s.whatsapp.net', fromMe: false }, pushName: 'Lia', message: { conversation: 'oi' } } });
  assert.deepEqual([m.phone, m.text, m.pushName], ['5583999990000', 'oi', 'Lia']);
  assert.equal(parseWebhook({ event: 'messages.upsert', data: { key: { remoteJid: 'x@s.whatsapp.net', fromMe: true }, message: { conversation: 'oi' } } }), null);
});
