// Conteúdo de nutrição por perfil/problema, checklist de documentos e dicas de conversão.
// Informativo e geral — sem promessa de resultado (Código de Ética da OAB).

export const CONTEUDO = {
  verbas_rescisorias: 'A empresa tem até 10 dias após o fim do contrato para pagar a rescisão (art. 477 da CLT). Se atrasar, pode caber multa equivalente a um salário.',
  horas_extras: 'Hora extra deve ser paga com adicional de no mínimo 50% (100% em domingos e feriados, em regra), e reflete em férias, 13º e FGTS.',
  sem_carteira: 'Trabalhar sem carteira não tira seus direitos: é possível pedir o reconhecimento do vínculo, com FGTS, férias, 13º e INSS do período.',
  assedio: 'Situações de humilhação ou constrangimento no trabalho podem gerar indenização por danos morais. Guardar prints, áudios e nomes de testemunhas ajuda muito.',
  acidente_doenca: 'Em acidente ou doença ligada ao trabalho pode haver estabilidade de 12 meses após o retorno do INSS e, dependendo do caso, indenização.',
  justa_causa: 'A justa causa precisa ser comprovada pela empresa. Quando é revertida na Justiça, você pode receber as verbas de uma dispensa sem justa causa.',
  fgts: 'Você pode consultar os depósitos do FGTS pelo app FGTS. Depósitos faltando podem ser cobrados da empresa.',
  insalubridade: 'Quem trabalha exposto a agentes nocivos pode ter direito a adicional de insalubridade (10% a 40%) ou periculosidade (30%).',
  gestante: 'A gestante tem estabilidade desde a confirmação da gravidez até 5 meses após o parto, mesmo que a empresa não soubesse.',
  outros: 'Cada caso trabalhista tem detalhes que fazem diferença — por isso a análise do advogado é importante.',
};

export const DOCUMENTOS = {
  base: ['RG/CPF', 'Carteira de Trabalho (física ou digital)', 'Últimos contracheques'],
  verbas_rescisorias: ['Termo de rescisão (TRCT), se tiver'],
  horas_extras: ['Cartões de ponto ou anotações de horário', 'Mensagens com horários de trabalho'],
  sem_carteira: ['Prints de conversas com o patrão', 'Comprovantes de pagamento (Pix/recibos)', 'Nomes de colegas que podem testemunhar'],
  assedio: ['Prints, áudios ou e-mails', 'Nomes de testemunhas'],
  acidente_doenca: ['Atestados e laudos médicos', 'CAT (Comunicação de Acidente de Trabalho), se houver', 'Documentos do INSS'],
  justa_causa: ['Carta/comunicado de justa causa', 'Advertências e suspensões recebidas'],
  fgts: ['Extrato do FGTS (app FGTS)'],
  insalubridade: ['Fotos do ambiente de trabalho', 'Comprovantes de EPI recebidos'],
  gestante: ['Exames/ultrassom com a data da gravidez'],
};

export function checklist(problemas = []) {
  const set = new Set(DOCUMENTOS.base);
  problemas.forEach((p) => (DOCUMENTOS[p] || []).forEach((d) => set.add(d)));
  return [...set];
}

export function dicaConversao(lead) {
  const c = lead.classificacao || {};
  const d = lead.data;
  if (c.prescricao?.status === 'critico') return 'O prazo de 2 anos está acabando: abra a consulta mostrando a data-limite e já proponha a assinatura do contrato no mesmo dia.';
  if (d.problemas?.includes('acidente_doenca')) return 'Comece pela saúde e acolhimento; explique estabilidade e indenização de forma simples. Peça laudos antes da consulta.';
  if (d.problemas?.includes('assedio')) return 'Lead emocionalmente fragilizado: escuta ativa nos 10 primeiros minutos e reforce o sigilo.';
  if (d.problemas?.includes('sem_carteira')) return 'Mostre que o vínculo pode ser reconhecido e liste com ele as testemunhas possíveis — isso dá segurança para contratar.';
  if (c.temperatura === 'quente') return 'Lead pronto para contratar: tenha o contrato de honorários e a procuração prontos para assinatura digital na própria consulta.';
  if (c.temperatura === 'morno') return 'Reforce o prazo prescricional e os direitos envolvidos; ofereça retorno em 48h com a análise dos documentos.';
  return 'Lead em fase de pesquisa: envie conteúdo educativo e mantenha o follow-up de 7 dias.';
}

export const DICAS_SEMANA = [
  'Responda o lead quente em até 1h após o briefing: a taxa de fechamento cai pela metade depois de 24h.',
  'Peça os documentos antes da consulta — o lead que envia documentos já está 80% decidido.',
  'Use áudio curto de boas-vindas do advogado após o agendamento: aumenta o comparecimento.',
  'Leads de horas extras costumam ter colegas na mesma situação: pergunte se conhece outros casos (com ética e sem captação ativa).',
];
