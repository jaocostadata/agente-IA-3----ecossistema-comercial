// Adaptador Evolution API (ponte com o WhatsApp Business).
// Entrada: webhook "messages.upsert". Saída: POST /message/sendText/{instance}.
// Sem EVOLUTION_API_URL configurada, apenas registra no console (modo demo).
import { env } from '../config.js';

export function parseWebhook(body) {
  const evt = body?.event || body?.type;
  if (evt && !/messages[._]upsert/i.test(evt)) return null;
  const data = Array.isArray(body?.data) ? body.data[0] : body?.data;
  if (!data?.key || data.key.fromMe) return null;
  const jid = data.key.remoteJid || '';
  if (jid.endsWith('@g.us')) return null; // ignora grupos
  const m = data.message || {};
  const text = m.conversation || m.extendedTextMessage?.text || m.imageMessage?.caption || m.buttonsResponseMessage?.selectedDisplayText || '';
  const audio = !!m.audioMessage;
  return { phone: jid.split('@')[0], pushName: data.pushName || null, text: text || (audio ? '[áudio]' : ''), audio, instance: body.instance };
}

export async function sendText(phone, text, instance = env.evolutionInstance) {
  if (!env.evolutionUrl) { console.log(`[evolution:demo] -> ${phone}: ${text.split('\n')[0].slice(0, 80)}…`); return { demo: true }; }
  const res = await fetch(`${env.evolutionUrl.replace(/\/$/, '')}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: env.evolutionKey },
    body: JSON.stringify({ number: phone, text, delay: 1200 }),
  });
  if (!res.ok) throw new Error(`Evolution HTTP ${res.status}`);
  return res.json();
}
