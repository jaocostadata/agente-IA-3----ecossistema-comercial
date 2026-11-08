// Agenda (mock do Google Calendar). Na produção: Google Calendar API (events.insert) por advogado.
import { escritorio } from './config.js';
import { getDb, save } from './store.js';
import { now } from './clock.js';

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function proximosHorarios(qtd = 3, ref = now()) {
  const ocupados = new Set(getDb().appointments.map((a) => a.inicio));
  const out = [];
  const d = new Date(ref); d.setMinutes(0, 0, 0);
  for (let i = 0; i < 24 * 14 && out.length < qtd; i++) {
    d.setHours(d.getHours() + 1);
    if (d - ref < 2 * 3600_000) continue; // antecedência mínima de 2h
    if (!escritorio.agenda.dias.includes(d.getDay()) || !escritorio.agenda.horas.includes(d.getHours())) continue;
    if (ocupados.has(d.toISOString())) continue;
    // alterna advogados e espalha os horários (no máximo 1 sugestão por período)
    if (out.length && d - new Date(out.at(-1).inicio) < 3 * 3600_000) continue;
    const adv = escritorio.advogados[out.length % escritorio.advogados.length];
    out.push({ inicio: d.toISOString(), advogadoId: adv.id, advogado: adv.nome, label: formatar(d) });
  }
  return out;
}

export function formatar(d) {
  d = new Date(d);
  const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${DIAS[d.getDay()]}, ${dd}/${mm} às ${d.getHours()}h`;
}

export function agendar(lead, slot, modalidade = 'online (videochamada)') {
  const ap = {
    id: 'ag_' + Math.random().toString(36).slice(2, 8),
    leadPhone: lead.phone, leadNome: lead.data.nome, ...slot, modalidade,
    criadoEm: now().toISOString(),
  };
  getDb().appointments.push(ap); save();
  return ap;
}
