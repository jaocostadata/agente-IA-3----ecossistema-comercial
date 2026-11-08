// Relatório diário (todo dia às 8h no WhatsApp do advogado) e métricas do dashboard.
import { allLeads, getDb, pushLawyer } from './store.js';
import { now, DAY } from './clock.js';
import { DICAS_SEMANA } from './agent/nurture.js';
import { problemasTxt } from './agent/briefing.js';
import { formatar } from './calendar.js';
import { escritorio } from './config.js';

const within = (iso, from, to) => { const t = new Date(iso).getTime(); return t >= from && t < to; };
const temp = (l) => l.classificacao?.temperatura || 'frio';

export function dashboard(ref = now()) {
  const leads = allLeads().filter((l) => l.stage !== 'novo');
  const hoje0 = new Date(ref); hoje0.setHours(0, 0, 0, 0);
  const h = hoje0.getTime();
  const hoje = leads.filter((l) => within(l.createdAt, h, h + DAY));
  const ontem = leads.filter((l) => within(l.createdAt, h - DAY, h));
  const semana = leads.filter((l) => within(l.createdAt, h - 6 * DAY, h + DAY));
  const semanaAnt = leads.filter((l) => within(l.createdAt, h - 13 * DAY, h - 6 * DAY));
  const conv = (arr) => { const q = arr.filter((l) => l.classificacao && l.stage !== 'nome' && l.stage !== 'problema'); return q.length ? Math.round((arr.filter((l) => l.appointment).length / q.length) * 100) : 0; };
  const tempos = leads.flatMap((l) => l.responseTimesMs || []);
  const respondidos = leads.filter((l) => l.messages.some((m) => m.from === 'agente')).length;
  return {
    leadsHoje: hoje.length,
    variacaoVsOntem: ontem.length ? Math.round(((hoje.length - ontem.length) / ontem.length) * 100) : null,
    quentesAtivos: leads.filter((l) => temp(l) === 'quente' && l.stage !== 'encerrado').length,
    porTemperatura: ['quente', 'morno', 'frio'].reduce((o, t) => ({ ...o, [t]: leads.filter((l) => l.classificacao && temp(l) === t).length }), {}),
    urgentes: leads.filter((l) => l.classificacao?.urgente).length,
    taxaResposta: leads.length ? Math.round((respondidos / leads.length) * 100) : 100,
    tempoMedioRespostaMs: tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0,
    taxaConversao: conv(semana),
    taxaConversaoSemanaAnterior: conv(semanaAnt),
    consultasAgendadas: getDb().appointments.length,
    totalLeads: leads.length,
    honorariosPotenciais: leads.filter((l) => temp(l) !== 'frio').reduce((s, l) => s + (l.classificacao?.valorPotencial?.min || 0), 0),
  };
}

export function relatorioDiario(ref = now()) {
  const fim = new Date(ref); fim.setHours(0, 0, 0, 0);
  const ini = fim.getTime() - DAY;
  let leads = allLeads().filter((l) => l.stage !== 'novo' && within(l.createdAt, ini, fim.getTime()));
  let periodo = 'ontem';
  if (!leads.length) { leads = allLeads().filter((l) => l.stage !== 'novo' && within(l.createdAt, ref - DAY, ref.getTime() + 1)); periodo = 'nas últimas 24h'; }
  const by = (t) => leads.filter((l) => temp(l) === t);
  const pend = leads.filter((l) => !l.appointment && temp(l) !== 'frio' && !l.optOut);
  const ag = getDb().appointments.filter((a) => new Date(a.inicio) >= ref).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 5);
  const dica = DICAS_SEMANA[Math.floor(ref.getTime() / (7 * DAY)) % DICAS_SEMANA.length];
  const linha = (l) => `• ${l.data.nome || '+' + l.phone} — ${problemasTxt(l.data)}${l.classificacao?.urgente ? ' 🚨' : ''}${l.appointment ? ' ✅ agendado' : ''}`;
  const d = dashboard(ref);
  return [
    `☀️ *Bom dia! Relatório Sinapta — ${escritorio.nome}*`,
    `_${ref.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })}_`,
    '',
    `📥 *Leads recebidos ${periodo}:* ${leads.length}`,
    `🔥 Quentes: ${by('quente').length}   🌤️ Mornos: ${by('morno').length}   ❄️ Frios: ${by('frio').length}`,
    ...(by('quente').length ? ['', '*Quentes:*', ...by('quente').map(linha)] : []),
    ...(by('morno').length ? ['', '*Mornos:*', ...by('morno').map(linha)] : []),
    '',
    `⏳ *Pendentes de ação (sem consulta marcada):* ${pend.length}`,
    ...pend.map((l) => `• ${l.data.nome || '+' + l.phone} — ${l.stage === 'escolha_horario' ? 'recebeu horários, não escolheu' : 'qualificação em andamento'}`),
    '',
    `📅 *Próximas consultas:* ${ag.length ? '' : 'nenhuma'}`,
    ...ag.map((a) => `• ${formatar(a.inicio)} — ${a.leadNome} (${a.advogado})`),
    '',
    `📊 Taxa de resposta ${d.taxaResposta}% · tempo médio ${(d.tempoMedioRespostaMs / 1000).toFixed(1)}s · conversão da semana ${d.taxaConversao}%`,
    '',
    `💡 *Dica de conversão da semana:* ${dica}`,
  ].join('\n');
}

export function enviarRelatorio(ref = now()) {
  return pushLawyer({ tipo: 'relatorio', at: ref.toISOString(), text: relatorioDiario(ref) });
}
