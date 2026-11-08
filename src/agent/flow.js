// Fluxo do agente (slide 4): lead chega → boas-vindas → qualificação → classificação →
// nutrição → briefing ao advogado → follow-up. Funciona como o "workflow n8n" da demo.
import { escritorio } from '../config.js';
import { now, HOUR, DAY } from '../clock.js';
import { getLead, upsertLead, pushLawyer, logEvent, allLeads } from '../store.js';
import { extractAll, norm, PROBLEMAS, extractProvas } from './extract.js';
import { classify } from './classify.js';
import { CONTEUDO, CITACAO, checklist } from './nurture.js';
import { gerarBriefing, alertaUrgente, problemasTxt, fmtMeses } from './briefing.js';
import { proximosHorarios, agendar, formatar } from '../calendar.js';
import { complete, completeJson } from '../llm/index.js';
import { SYSTEM_PROMPT } from './prompt.js';
import { fundamentos, buscar, trecho, disponivel as cltDisponivel, contextoLLM } from '../knowledge/clt.js';

// System prompt + trechos da CLT relevantes para o lead (RAG)
const sistema = (lead, pergunta = '') => SYSTEM_PROMPT + '\n\n' + contextoLLM(lead.data.problemas, pergunta);

const QUALIFICACAO = ['nome', 'problema', 'situacao', 'saida', 'vinculo', 'carteira', 'provas'];
const SEM_FOLLOWUP = new Set(['agendado', 'encerrado']);

export function newLead(phone, pushName) {
  const t = now().toISOString();
  return {
    phone, pushName: pushName || null, canal: 'whatsapp', createdAt: t, updatedAt: t,
    stage: 'novo', retries: {},
    data: { nome: null, problemas: [], relato: [], situacao: null, mesesDesdeSaida: null,
      tempoVinculoMeses: null, carteira: null, provas: null, provasDetalhe: null,
      querAgendar: false, apenasDuvida: false, pediuUrgencia: false },
    classificacao: null, messages: [], slots: [], appointment: null, followups: [],
    optOut: false, handoff: null, alertaEnviado: false, responseTimesMs: [],
  };
}

const primeiroNome = (lead) => (lead.data.nome || '').split(' ')[0];
const dentroDoExpediente = (d = now()) => [1, 2, 3, 4, 5].includes(d.getDay()) && d.getHours() >= 8 && d.getHours() < 18;
const saudacao = (d = now()) => (d.getHours() < 5 ? 'Boa noite' : d.getHours() < 12 ? 'Bom dia' : d.getHours() < 18 ? 'Boa tarde' : 'Boa noite');
const advResponsavel = (lead) => lead.appointment?.advogado || escritorio.advogados[0].nome;

// ---------- perguntas ----------
function pergunta(stage, lead) {
  const nome = primeiroNome(lead);
  switch (stage) {
    case 'nome': return 'Pra começar, como posso te chamar? 😊';
    case 'problema': return `Prazer, ${nome}! Me conta com suas palavras: o que aconteceu no seu trabalho?`;
    case 'situacao': return 'E você ainda está trabalhando nessa empresa?';
    case 'saida': return 'Há quanto tempo você saiu de lá? Pode ser aproximado (ex.: "3 meses" ou "em março").';
    case 'vinculo': return 'Quanto tempo você trabalhou (ou trabalha) nessa empresa?';
    case 'carteira': return lead.data.situacao === 'empregado' ? 'Sua carteira de trabalho é assinada?' : 'Sua carteira de trabalho era assinada?';
    case 'provas': return 'Última pergunta 🙂 Você tem alguma prova do que aconteceu? Ex.: prints, áudios, contracheques, cartões de ponto, atestados ou colegas que possam testemunhar.';
    default: return '';
  }
}

function proximaEtapa(lead) {
  const d = lead.data;
  if (!d.nome) return 'nome';
  if (!d.problemas.length) return 'problema';
  if (!d.situacao) return 'situacao';
  if (d.situacao === 'desligado' && d.mesesDesdeSaida == null && !lead.retries.saidaPulada) return 'saida';
  if (d.tempoVinculoMeses == null && !lead.retries.vinculoPulado) return 'vinculo';
  if (d.carteira == null) return 'carteira';
  if (d.provas == null) return 'provas';
  return 'completo';
}

// ---------- extração contextual ----------
function mesclar(lead, ex, text) {
  const d = lead.data, st = lead.stage;
  ex.problemas.forEach((p) => !d.problemas.includes(p) && d.problemas.push(p));
  d.problemas.sort((a, b) => (PROBLEMAS[b]?.peso || 0) - (PROBLEMAS[a]?.peso || 0));
  if (ex.problemas.length || st === 'problema' || st === 'novo') {
    if (text.length > 12 && !d.relato.includes(text)) d.relato.push(text);
  }
  if (ex.situacao) d.situacao = ex.situacao;
  if (d.situacao === 'desligado' && ex.mesesDesdeSaida != null && (st === 'saida' || ex.situacao === 'desligado')) d.mesesDesdeSaida = ex.mesesDesdeSaida;
  if (ex.tempoVinculoMeses != null) d.tempoVinculoMeses = ex.tempoVinculoMeses;
  if (ex.carteira != null && d.carteira == null) d.carteira = ex.carteira;
  if (d.problemas.includes('sem_carteira')) d.carteira = false;
  if (st === 'nome' && ex.nome) d.nome = ex.nome;
  else if (!d.nome && /(meu nome|me chamo|pode me chamar)/i.test(text) && ex.nome) d.nome = ex.nome;
  const i = ex.intencoes;
  if (i.includes('agendar')) d.querAgendar = true;
  if (i.includes('urgencia')) d.pediuUrgencia = true;
  if (i.includes('duvida')) d.apenasDuvida = true;
}

// Resposta da etapa atual. Retorna { ok } ou { ok:false, retry:"texto" }.
async function responderEtapa(lead, text, ex) {
  const d = lead.data, n = norm(text), st = lead.stage;
  const sim = ex.intencoes.includes('sim'), nao = ex.intencoes.includes('nao');
  const tentar = (key, msg, onGiveUp) => {
    lead.retries[key] = (lead.retries[key] || 0) + 1;
    if (lead.retries[key] > 1) { onGiveUp?.(); return { ok: true }; }
    return { ok: false, retry: msg };
  };
  const viaIA = async (campo, descricao) => {
    const r = await completeJson({ tier: 'flash', system: SYSTEM_PROMPT,
      prompt: `Extraia o campo "${campo}" (${descricao}) da mensagem do cliente e responda só JSON {"${campo}": valor|null}.\nMensagem: "${text}"` });
    return r?.[campo] ?? null;
  };

  switch (st) {
    case 'nome':
      if (d.nome) return { ok: true };
      { const v = await viaIA('nome', 'primeiro nome da pessoa'); if (v) { d.nome = String(v); return { ok: true }; } }
      return tentar('nome', 'Desculpa, não consegui entender seu nome 😅 Pode me dizer só como gostaria de ser chamado(a)?',
        () => { d.nome = lead.pushName || 'cliente'; });
    case 'problema':
      if (d.problemas.length) return { ok: true };
      return tentar('problema', 'Entendi. Pode me dar um pouco mais de detalhe? Por exemplo: foi demissão, salário ou rescisão não pagos, horas extras, falta de carteira assinada, assédio, acidente...',
        () => { d.problemas.push('outros'); });
    case 'situacao':
      if (d.situacao) return { ok: true };
      if (sim || /\b(ainda|continuo|sigo)\b/.test(n)) { d.situacao = 'empregado'; return { ok: true }; }
      if (nao || /\b(sai|saí)\b/.test(n)) { d.situacao = 'desligado'; return { ok: true }; }
      return tentar('situacao', 'Só pra eu confirmar: você *ainda trabalha* lá ou *já saiu* da empresa?', () => { d.situacao = 'desligado'; });
    case 'saida':
      if (d.mesesDesdeSaida != null) return { ok: true };
      if (ex.mesesDesdeSaida != null) { d.mesesDesdeSaida = ex.mesesDesdeSaida; return { ok: true }; }
      { const v = await viaIA('meses', 'há quantos meses a pessoa saiu da empresa, número'); if (typeof v === 'number') { d.mesesDesdeSaida = v; return { ok: true }; } }
      return tentar('saida', 'Pode ser bem aproximado: foi há poucos meses, uns 6 meses, mais de 1 ano...?', () => { lead.retries.saidaPulada = true; });
    case 'vinculo':
      if (d.tempoVinculoMeses != null) return { ok: true };
      if (ex.duracao != null) { d.tempoVinculoMeses = ex.duracao; return { ok: true }; }
      return tentar('vinculo', 'Aproximadamente, quantos meses ou anos você ficou lá?', () => { lead.retries.vinculoPulado = true; });
    case 'carteira':
      if (d.carteira != null) return { ok: true };
      if (sim) { d.carteira = true; return { ok: true }; }
      if (nao) { d.carteira = false; return { ok: true }; }
      return tentar('carteira', 'Era com carteira assinada (CLT)? Responde com *sim* ou *não* 🙂', () => { d.carteira = 'nao_informado'; });
    case 'provas': {
      const p = extractProvas(text);
      if (p != null) { d.provas = p; if (p) d.provasDetalhe = text.slice(0, 120); return { ok: true }; }
      if (sim) { d.provas = true; return { ok: true }; }
      if (nao) { d.provas = false; return { ok: true }; }
      return tentar('provas', 'Você tem algum print, documento ou testemunha? Pode responder *sim* ou *não*.', () => { d.provas = false; });
    }
    default:
      return { ok: true };
  }
}

// ---------- respostas de FAQ (valem em qualquer etapa) ----------
function faq(lead, ex) {
  const out = [];
  if (ex.intencoes.includes('preco'))
    out.push('Sobre valores: a consulta serve para o advogado entender seu caso, e as condições de honorários são explicadas por ele com total transparência nesse momento. Nada é cobrado por aqui 😉');
  if (ex.intencoes.includes('promessa'))
    out.push('Eu não consigo te dizer se você vai ganhar ou quanto vai receber — isso depende da análise do advogado com seus documentos (e nenhum advogado sério promete resultado). Mas posso adiantar tudo para que ele avalie seu caso rapidinho.');
  if (ex.intencoes.includes('lei')) {
    if (!cltDisponivel()) out.push('O advogado vai te explicar com calma a base legal do seu caso na consulta 🙂');
    else {
      let fs = fundamentos(lead.data.problemas, { max: 2 });
      if (!fs.length) fs = buscar(ex.textoOriginal || '', 2).map((a) => trecho({ art: a.numero })).filter(Boolean);
      if (fs.length) out.push(['📖 O que diz a CLT:', ...fs.map((f) => `*${f.rotulo}:* “${f.texto}”`), '', '_Texto informativo — o advogado avalia como isso se aplica ao seu caso._'].join('\n'));
      else out.push('Me conta um pouco mais do seu caso que eu te mostro o que a CLT diz sobre isso 🙂');
    }
  }
  if (ex.intencoes.includes('endereco'))
    out.push(`Atendemos online (videochamada) e presencialmente em: ${escritorio.endereco}.`);
  return out;
}

// ---------- finalização da qualificação: classificação + nutrição + oferta ----------
function finalizar(lead) {
  const d = lead.data;
  const c = (lead.classificacao = classify(d));
  const out = [];
  const nome = primeiroNome(lead);
  const resumo = [
    `Obrigada, ${nome}! Deixa eu ver se entendi:`,
    `• *Assunto:* ${problemasTxt(d)}`,
    `• *Situação:* ${d.situacao === 'empregado' ? 'ainda trabalha na empresa' : `saiu há ${fmtMeses(d.mesesDesdeSaida)}`}`,
    d.tempoVinculoMeses != null ? `• *Tempo de empresa:* ${fmtMeses(d.tempoVinculoMeses)}${d.carteira === false ? ' (sem carteira)' : ''}` : null,
    `• *Provas:* ${d.provas ? 'sim' : 'por enquanto não'}`,
  ].filter(Boolean).join('\n');
  out.push(resumo);

  const p = d.problemas.find((x) => CONTEUDO[x]) || 'outros';
  if (c.prescricao?.status === 'prescrito') {
    out.push('Preciso ser transparente com você: a lei dá *2 anos após a saída* para entrar com a ação. Pelo que você contou, esse prazo pode ter passado — mas existem exceções (como FGTS e algumas situações específicas), e só o advogado consegue confirmar.');
  } else if (c.prescricao?.status === 'critico') {
    out.push(`⚠️ *Atenção:* a lei dá 2 anos após a saída para entrar com a ação, e no seu caso restam cerca de *${fmtMeses(c.prescricao.mesesRestantes)}*. Por isso vou priorizar o seu atendimento.`);
  } else {
    const f = CITACAO[p] ? trecho(CITACAO[p]) : null;
    out.push(`💡 Uma informação importante: ${CONTEUDO[p]}${f ? `\n📖 Base legal: ${f.rotulo.replace('Art.', 'art.')} da CLT.` : ''}`);
  }
  if (!d.provas && c.temperatura !== 'frio') out.push('Dica: se puder, comece a reunir prints, contracheques e nomes de colegas que viram o que aconteceu. Isso ajuda muito na análise.');

  if (c.temperatura === 'frio' && !d.querAgendar) {
    out.push(`Se quiser, posso agendar uma conversa com ${escritorio.advogados[0].nome} para avaliar com mais detalhes. Quer que eu veja um horário pra você?`);
    lead.stage = 'oferta';
  } else {
    out.push(oferecerHorarios(lead, c.temperatura === 'quente'
      ? `Pelo seu relato, é um caso que ${escritorio.advogados[0].nome} precisa analisar com prioridade. Tenho estes horários para uma consulta:`
      : 'Vale muito a pena uma consulta para o advogado analisar seus documentos. Tenho estes horários:'));
  }
  return out;
}

function oferecerHorarios(lead, intro, depoisDe) {
  lead.slots = proximosHorarios(3, depoisDe ? new Date(new Date(depoisDe).getTime() + HOUR) : now());
  lead.stage = 'escolha_horario';
  const nums = ['1️⃣', '2️⃣', '3️⃣'];
  return [intro, ...lead.slots.map((s, i) => `${nums[i]} ${s.label} — ${s.advogado}`),
    '', 'É só responder com o número 🙂 (a consulta pode ser online ou presencial)'].join('\n');
}

function escolherSlot(lead, n) {
  const slots = lead.slots || [];
  const dias = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  const num = n.match(/^\D*([1-3])\b/);
  if (num && slots[Number(num[1]) - 1]) return slots[Number(num[1]) - 1];
  if (/\bprimeir/.test(n)) return slots[0];
  if (/\b(segundo|segunda opcao)\b/.test(n)) return slots[1];
  if (/\bterceir|ultim/.test(n)) return slots[2];
  const hora = n.match(/\b(\d{1,2})\s*(h|horas?|:00)\b/);
  const cand = slots.filter((s) => {
    const dt = new Date(s.inicio);
    const okDia = n.includes(dias[dt.getDay()]);
    const okHora = hora && Number(hora[1]) === dt.getHours();
    return hora ? okHora && (okDia || !dias.some((x) => n.includes(x))) : okDia;
  });
  return cand.length === 1 ? cand[0] : null;
}

async function confirmarAgendamento(lead, slot, n) {
  const modalidade = /presencial|pessoalmente|escritorio/.test(n) ? 'presencial' : 'online (videochamada)';
  lead.appointment = agendar(lead, slot, modalidade);
  lead.stage = 'agendado';
  const docs = checklist(lead.data.problemas).map((x) => `• ${x}`).join('\n');
  const local = modalidade === 'presencial' ? `📍 ${escritorio.endereco}` : '💻 Online por videochamada — o link chega aqui 1h antes.';
  const msg = [
    `✅ Pronto, ${primeiroNome(lead)}! Sua consulta está agendada:`,
    `📅 ${formatar(slot.inicio)}`, `👩‍⚖️ ${slot.advogado}`, local, '',
    'Para aproveitar melhor a consulta, separe (se tiver):', docs, '',
    'O advogado já vai chegar sabendo de tudo que você me contou — não vai precisar repetir. Qualquer dúvida, é só me chamar aqui 💙',
  ].join('\n');
  pushLawyer({ tipo: 'briefing', leadPhone: lead.phone, at: now().toISOString(), text: await gerarBriefing(lead) });
  logEvent('agendamento', { leadPhone: lead.phone, at: now().toISOString() });
  return msg;
}

// ---------- follow-up automático (24h, 48h, 7 dias) ----------
function agendarFollowups(lead) {
  lead.followups = lead.followups.filter((f) => f.sent);
  if (SEM_FOLLOWUP.has(lead.stage) || lead.optOut) return;
  const base = now().getTime();
  // quem recusou a consulta (nutrição) recebe só o contato de 7 dias, para não ser invasivo
  const etapas = lead.stage === 'nutricao' ? [['7d', 7 * DAY]] : [['24h', DAY], ['48h', 2 * DAY], ['7d', 7 * DAY]];
  etapas.forEach(([tipo, ms]) =>
    lead.followups.push({ tipo, dueAt: new Date(base + ms).toISOString(), sent: false, stage: lead.stage }));
}

export function mensagemFollowup(lead, tipo) {
  const nome = primeiroNome(lead) || 'tudo bem';
  const st = lead.stage;
  if (tipo === '24h') {
    if (st === 'escolha_horario') return `Oi, ${nome}! 😊 Os horários que separei para sua consulta ainda estão disponíveis:\n${lead.slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}\nQuer que eu reserve algum?`;
    if (QUALIFICACAO.includes(st)) return `Oi, ${nome}! Vi que nossa conversa ficou pela metade. ${pergunta(st, lead)}`;
    return `Oi, ${nome}! Passando para saber se ficou alguma dúvida. Posso ajudar a agendar sua consulta?`;
  }
  if (tipo === '48h')
    return `${nome}, lembrete importante: em questões trabalhistas existe *prazo de 2 anos* após a saída da empresa para buscar seus direitos. Se quiser, o advogado pode analisar seu caso sem compromisso — é só responder aqui.`;
  return `Oi, ${nome}! Esta é minha última mensagem por aqui, pra não te incomodar. Se precisar de ajuda com seus direitos trabalhistas, é só mandar um "oi" a qualquer hora — eu atendo 24h. 💙`;
}

export function runFollowups() {
  const enviados = [];
  const t = now().getTime();
  for (const lead of allLeads()) {
    for (const f of lead.followups) {
      if (f.sent || new Date(f.dueAt).getTime() > t) continue;
      f.sent = true; f.sentAt = now().toISOString();
      const text = mensagemFollowup(lead, f.tipo);
      lead.messages.push({ from: 'agente', text, at: f.sentAt, followup: f.tipo });
      upsertLead(lead);
      enviados.push({ phone: lead.phone, tipo: f.tipo, text });
    }
  }
  return enviados;
}

// ---------- entrada principal ----------
export async function handleMessage(phone, text, { pushName } = {}) {
  const t0 = Date.now();
  const lead = getLead(phone) || newLead(phone, pushName);
  const at = now();
  text = String(text || '').trim();
  lead.messages.push({ from: 'lead', text, at: at.toISOString() });
  lead.lastInboundAt = at.toISOString();
  lead.followups = lead.followups.filter((f) => f.sent); // lead respondeu: cancela follow-ups pendentes

  if (text === '[áudio]') {
    // Produção: transcrever o áudio (ex.: Gemini/Whisper) e seguir o fluxo normalmente.
    return finish(lead, ['Recebi seu áudio! 🎧 Por enquanto consigo te atender melhor por texto — pode me escrever, por favor?'], t0);
  }

  const ex = extractAll(text, at);
  ex.textoOriginal = text;
  const n = norm(text);
  const out = [];
  const primeiraVez = lead.stage === 'novo';

  if (ex.intencoes.includes('sair')) {
    lead.optOut = true; lead.stage = 'encerrado';
    out.push(`Tudo bem${lead.data.nome ? ', ' + primeiroNome(lead) : ''}! Não vou mais te enviar mensagens. Se precisar, é só mandar um "oi" 💙`);
    return finish(lead, out, t0);
  }
  if (lead.stage === 'encerrado') { lead.optOut = false; lead.stage = proximaEtapa(lead) === 'completo' ? 'oferta' : proximaEtapa(lead); }

  mesclar(lead, ex, text);
  if (primeiraVez) {
    const fora = !dentroDoExpediente(at);
    out.push(`${saudacao(at)}! 👋 Aqui é a ${escritorio.agenteNome}, assistente virtual do *${escritorio.nome}*, especialista em Direito do Trabalho.` +
      (fora ? ' Mesmo fora do horário comercial, eu já adianto seu atendimento — estou aqui 24h.' : ''));
    lead.stage = 'nome';
  }
  out.push(...faq(lead, ex));

  // urgência detectada → avisa o advogado na hora (sem esperar o fim da qualificação)
  const cPrev = classify(lead.data);
  if (cPrev.urgente && !lead.alertaEnviado && lead.data.problemas.length) {
    lead.alertaEnviado = true;
    lead.classificacao = cPrev;
    pushLawyer({ tipo: 'urgente', leadPhone: phone, at: at.toISOString(), text: alertaUrgente(lead) });
    if (lead.data.problemas.some((p) => ['acidente_doenca', 'assedio'].includes(p)))
      out.push('Sinto muito que você esteja passando por isso. 💙 Já sinalizei seu caso como prioridade para o advogado.');
  }

  if (ex.intencoes.includes('humano') && !lead.handoff) {
    lead.handoff = { at: at.toISOString(), motivo: 'Cliente pediu atendimento humano' };
    lead.classificacao = classify(lead.data);
    pushLawyer({ tipo: 'humano', leadPhone: phone, at: at.toISOString(), text: await gerarBriefing(lead, { motivo: '🙋 Cliente pediu para falar com o advogado' }) });
    out.push(dentroDoExpediente(at)
      ? `Claro! Já avisei ${escritorio.advogados[0].nome}, que vai assumir esta conversa em instantes.`
      : `Claro! Já deixei avisado ${escritorio.advogados[0].nome}. O atendimento humano é ${escritorio.horarioAtendimentoHumano}, e ela vai te chamar logo cedo.`);
    if (QUALIFICACAO.includes(lead.stage) && proximaEtapa(lead) !== 'completo') out.push('Enquanto isso, posso adiantar algumas informações para ela já chegar sabendo do seu caso.');
  }

  // ----- máquina de estados -----
  if (QUALIFICACAO.includes(lead.stage)) {
    if (!primeiraVez) {
      const r = await responderEtapa(lead, text, ex);
      if (!r.ok) {
        const ia = await complete({ tier: 'flash', system: sistema(lead, text),
          prompt: `Conversa:\n${lead.messages.slice(-6).map((m) => `${m.from}: ${m.text}`).join('\n')}\n\nResponda à última mensagem do cliente em até 2 frases e repita, com gentileza, esta pergunta: "${pergunta(lead.stage, lead)}"` });
        out.push(ia || r.retry);
        return finish(lead, out, t0);
      }
    }
    const prox = proximaEtapa(lead);
    if (prox === 'completo') out.push(...finalizar(lead));
    else {
      if (prox !== 'problema' && lead.stage === 'problema' && lead.data.problemas.length) {
        const label = PROBLEMAS[lead.data.problemas[0]]?.label;
        if (label && !lead.alertaEnviado) out.push(`Entendi, ${primeiroNome(lead)}. Situações de *${label.toLowerCase()}* são bem comuns, e a lei protege o trabalhador nesses casos.`);
      }
      const ask = pergunta(prox, lead);
      out.push(!primeiraVez && lead.stage === 'nome' && lead.data.nome && prox !== 'problema' ? `Prazer, ${primeiroNome(lead)}! ${ask}` : ask);
      lead.stage = prox;
    }
  } else if (lead.stage === 'oferta') {
    if (ex.intencoes.includes('sim') || lead.data.querAgendar) out.push(oferecerHorarios(lead, 'Ótimo! Tenho estes horários:'));
    else if (ex.intencoes.includes('nao')) { lead.stage = 'nutricao'; out.push('Sem problemas! Fico à disposição. Se mudar de ideia, é só me chamar por aqui 😉'); }
    else if (!out.length) out.push('Quer que eu agende uma conversa com o advogado? Responde com *sim* ou *não* 🙂');
  } else if (lead.stage === 'escolha_horario') {
    const slot = escolherSlot(lead, n);
    if (slot) out.push(await confirmarAgendamento(lead, slot, n));
    else if (/(nenhum|outro|outros|nao posso|nao da|nao consigo|mais tarde|outra data|outro dia)/.test(n))
      out.push(oferecerHorarios(lead, 'Sem problema! Veja outras opções:', lead.slots.at(-1)?.inicio));
    else if (ex.intencoes.includes('nao')) { lead.stage = 'nutricao'; out.push('Tudo bem! Quando quiser agendar, é só me chamar aqui 😉'); }
    else if (!out.length) out.push('Qual desses horários fica melhor pra você? Responde com *1*, *2* ou *3* — ou me diga se prefere outro dia.');
  } else if (lead.stage === 'nutricao') {
    if (ex.intencoes.includes('sim') || ex.intencoes.includes('agendar')) out.push(oferecerHorarios(lead, 'Claro! Tenho estes horários:'));
    else if (!out.length) out.push((await complete({ tier: 'flash', system: sistema(lead, text), prompt: `Cliente: ${text}\nResponda brevemente.` })) ||
      'Anotado! Se quiser que o advogado analise seu caso, posso agendar uma consulta — é só pedir 🙂');
  } else if (lead.stage === 'agendado') {
    if (!out.length) {
      pushLawyer({ tipo: 'nota', leadPhone: phone, at: at.toISOString(), text: `📝 ${lead.data.nome} (consulta ${formatar(lead.appointment.inicio)}) enviou: "${text}"` });
      out.push((await complete({ tier: 'flash', system: sistema(lead, text), prompt: `O cliente já tem consulta agendada em ${formatar(lead.appointment.inicio)}. Ele escreveu: "${text}". Responda brevemente.` })) ||
        `Anotado, ${primeiroNome(lead)}! Já repassei para ${advResponsavel(lead)}. Sua consulta continua confirmada para ${formatar(lead.appointment.inicio)} ✅`);
    }
  }

  return finish(lead, out, t0);
}

function finish(lead, out, t0) {
  const at = now().toISOString();
  out.filter(Boolean).forEach((text) => lead.messages.push({ from: 'agente', text, at }));
  lead.lastOutboundAt = at;
  lead.updatedAt = at;
  lead.classificacao = lead.stage === 'novo' ? null : classify(lead.data);
  lead.responseTimesMs.push(Date.now() - t0);
  agendarFollowups(lead);
  upsertLead(lead);
  return { replies: out.filter(Boolean), lead };
}
