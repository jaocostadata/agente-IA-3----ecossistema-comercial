// Classificação automática do lead: quente / morno / frio (+ flag de urgência).
import { PROBLEMAS } from './extract.js';

export const PRAZO_PRESCRICIONAL_MESES = 24; // art. 7º, XXIX, CF: 2 anos após a extinção do contrato

export function classify(d) {
  const motivos = [];
  let score = 0;

  const probs = d.problemas || [];
  const pesoProb = probs.reduce((s, p) => s + (PROBLEMAS[p]?.peso || 5), 0);
  score += Math.min(pesoProb, 45);
  if (probs.length) motivos.push(`${probs.length} tema(s) trabalhista(s): ${probs.map((p) => PROBLEMAS[p].label).join(', ')}`);
  else { score += 5; motivos.push('problema ainda não identificado'); }

  let prescricao = null;
  if (d.situacao === 'desligado' && d.mesesDesdeSaida != null) {
    const m = d.mesesDesdeSaida;
    const restante = PRAZO_PRESCRICIONAL_MESES - m;
    prescricao = { mesesDesdeSaida: m, mesesRestantes: Math.max(0, Math.round(restante * 10) / 10) };
    if (m > PRAZO_PRESCRICIONAL_MESES) { score -= 40; prescricao.status = 'prescrito'; motivos.push('saída há mais de 2 anos — provável prescrição'); }
    else if (restante <= 4) { score += 25; prescricao.status = 'critico'; motivos.push(`prazo prescricional acaba em ~${Math.ceil(restante)} mês(es)`); }
    else if (m <= 6) { score += 20; prescricao.status = 'ok'; motivos.push('desligamento recente (até 6 meses)'); }
    else { score += 10; prescricao.status = 'ok'; motivos.push('dentro do prazo de 2 anos'); }
  } else if (d.situacao === 'empregado') {
    score += 5; motivos.push('ainda empregado (avaliar rescisão indireta)');
  }

  if ((d.tempoVinculoMeses || 0) >= 12) { score += 10; motivos.push('vínculo de 1 ano ou mais'); }
  if (d.carteira === false && !probs.includes('sem_carteira')) { score += 10; motivos.push('sem carteira assinada'); }
  if (d.provas === true) { score += 15; motivos.push('possui provas/testemunhas'); }
  if (d.provas === false) { score -= 5; }
  if (d.querAgendar) { score += 15; motivos.push('demonstrou intenção de contratar/agendar'); }
  if (d.apenasDuvida) { score -= 10; motivos.push('declarou ser apenas uma dúvida'); }

  const urgente =
    probs.includes('acidente_doenca') || probs.includes('assedio') || probs.includes('gestante') ||
    prescricao?.status === 'critico' || !!d.pediuUrgencia;

  let temperatura = score >= 60 ? 'quente' : score >= 35 ? 'morno' : 'frio';
  if (prescricao?.status === 'prescrito') temperatura = 'frio';

  return {
    score: Math.max(0, Math.min(100, score)),
    temperatura,
    urgente,
    prescricao,
    motivos,
    valorPotencial: estimativaHonorarios(probs, temperatura),
  };
}

// Slide 2: um caso trabalhista vale R$ 3.000 a R$ 8.000 em honorários.
export function estimativaHonorarios(probs, temperatura) {
  if (temperatura === 'frio' || !probs.length) return { min: 0, max: 3000 };
  const forte = probs.some((p) => ['acidente_doenca', 'assedio', 'sem_carteira', 'gestante'].includes(p)) || probs.length >= 2;
  return forte ? { min: 5000, max: 8000 } : { min: 3000, max: 5000 };
}
