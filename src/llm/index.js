// Roteador de IA. Sem chaves configuradas => modo "regras" (offline, determinístico), retorna null
// e o agente usa os templates próprios. Com chaves, usa:
//   tier "flash" -> Gemini Flash (ou Claude se só houver Claude)
//   tier "pro"   -> Claude (briefings/casos complexos) ou Gemini Pro
import * as claude from './claude.js';
import * as gemini from './gemini.js';

export function providerInfo() {
  return {
    flash: gemini.available() ? 'gemini-flash' : claude.available() ? 'claude' : 'regras (offline)',
    pro: claude.available() ? 'claude' : gemini.available() ? 'gemini-pro' : 'regras (offline)',
  };
}

export async function complete({ tier = 'flash', ...opts }) {
  const order = tier === 'pro' ? [claude, gemini] : [gemini, claude];
  for (const p of order) {
    if (!p.available()) continue;
    try { return await p.complete({ tier, ...opts }); }
    catch (e) { console.warn('[llm] falha, tentando próximo provedor:', e.message); }
  }
  return null; // modo offline / contingência (slide 10: "IA cai -> mensagem de contingência")
}

export async function completeJson(opts) {
  const txt = await complete({ ...opts, json: true });
  if (!txt) return null;
  try { return JSON.parse(txt.replace(/^```(json)?|```$/g, '').trim()); } catch { return null; }
}
