// Briefing entregue ao advogado (slide 4, etapa 06): nome, problema, urgência, histórico. Zero retrabalho.
import { PROBLEMAS } from './extract.js';
import { classify } from './classify.js';
import { dicaConversao } from './nurture.js';
import { complete } from '../llm/index.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { formatar } from '../calendar.js';

const EMOJI = { quente: '🔥', morno: '🌤️', frio: '❄️' };
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export const fmtMeses = (m) => {
  if (m == null) return 'não informado';
  if (m < 1) return 'menos de 1 mês';
  m = Math.round(m);
  if (m < 12) return `${m} ${m === 1 ? 'mês' : 'meses'}`;
  const a = Math.floor(m / 12), r = m % 12;
  return `${a} ${a === 1 ? 'ano' : 'anos'}${r ? ` e ${r} ${r === 1 ? 'mês' : 'meses'}` : ''}`;
};

export const problemasTxt = (d) =>
  (d.problemas || []).map((p) => PROBLEMAS[p]?.label || 'Outro assunto trabalhista').join('; ') || 'a esclarecer';

export function situacaoTxt(d, c = classify(d)) {
  if (d.situacao === 'empregado') return 'Ainda trabalha na empresa';
  if (d.situacao !== 'desligado') return 'Não informado';
  let s = `Desligado há ${fmtMeses(d.mesesDesdeSaida)}`;
  if (c.prescricao?.status === 'prescrito') s += ' — ⚠️ possivelmente prescrito (> 2 anos)';
  else if (c.prescricao) s += ` — prazo prescricional: ~${fmtMeses(c.prescricao.mesesRestantes)} restantes`;
  return s;
}

export async function gerarBriefing(lead, { motivo = 'Consulta agendada' } = {}) {
  const d = lead.data;
  const c = lead.classificacao || classify(d);
  const ap = lead.appointment;
  const relato = (d.relato || []).join(' / ').slice(0, 400);
  const linhas = [
    `📋 *BRIEFING — LEAD ${c.temperatura.toUpperCase()}* ${EMOJI[c.temperatura]}${c.urgente ? '  🚨 *URGENTE*' : ''}`,
    `_${motivo}_`,
    '',
    `👤 *Nome:* ${d.nome || lead.pushName || 'não informado'}`,
    `📱 *WhatsApp:* +${lead.phone}`,
    `⚖️ *Problema jurídico:* ${problemasTxt(d)}`,
    `🏢 *Situação:* ${situacaoTxt(d, c)}`,
    `⏳ *Tempo de empresa:* ${fmtMeses(d.tempoVinculoMeses)}${d.carteira === false ? ' · *sem carteira assinada*' : d.carteira === true ? ' · carteira assinada' : ''}`,
    `📎 *Provas:* ${d.provas === true ? 'possui (' + (d.provasDetalhe || 'informou ter') + ')' : d.provas === false ? 'não possui no momento' : 'não informado'}`,
    `📊 *Score:* ${c.score}/100 · honorários potenciais ${brl(c.valorPotencial.min)}–${brl(c.valorPotencial.max)}`,
    `🔎 *Por quê:* ${c.motivos.join('; ')}`,
  ];
  if (ap) linhas.push(`📅 *Consulta:* ${formatar(ap.inicio)} com ${ap.advogado} — ${ap.modalidade}`);
  if (relato) linhas.push('', `💬 *Relato do cliente:* "${relato}"`);

  const resumoIA = await complete({
    tier: 'pro',
    system: SYSTEM_PROMPT + '\n\nAgora você escreve para o ADVOGADO, não para o cliente.',
    prompt: `Com base na conversa abaixo, escreva em até 3 linhas: (1) resumo técnico do caso com possíveis pedidos ` +
      `(ex.: verbas rescisórias, multa do 477, horas extras, danos morais) e (2) o que confirmar na consulta. Sem markdown pesado.\n\n` +
      lead.messages.map((m) => `${m.from === 'lead' ? 'Cliente' : 'Agente'}: ${m.text}`).join('\n'),
    maxTokens: 400,
  });
  if (resumoIA) linhas.push('', `🧠 *Análise da IA:* ${resumoIA}`);

  linhas.push('', `💡 *Dica de conversão:* ${dicaConversao({ ...lead, classificacao: c })}`);
  linhas.push(`🗂️ Histórico completo: ${lead.messages.length} mensagens no painel.`);
  return linhas.join('\n');
}

export function alertaUrgente(lead) {
  const d = lead.data, c = lead.classificacao || classify(d);
  return [
    '🚨 *ALERTA DE URGÊNCIA* 🚨',
    `${d.nome || 'Novo lead'} (+${lead.phone}) — ${problemasTxt(d)}`,
    c.prescricao?.status === 'critico' ? `⏳ Prazo prescricional acaba em ~${fmtMeses(c.prescricao.mesesRestantes)}.` : 'Caso sensível: recomenda-se contato humano prioritário.',
    'O agente segue qualificando; o briefing completo chega em seguida.',
  ].join('\n');
}
