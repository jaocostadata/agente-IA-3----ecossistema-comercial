// Extração de informações a partir do texto livre do lead (motor offline, sem LLM).
// Quando há LLM configurado, ela complementa esta extração (ver llm/index.js).

export const norm = (s = '') =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const PROBLEMAS = {
  verbas_rescisorias: { label: 'Verbas rescisórias não pagas', peso: 25,
    re: /(rescis|verbas|nao (me )?pag(ou|aram)|nao recebi|aviso previo|multa (de|dos)? ?40|acerto|nao fizeram (o )?acerto|saldo de salario)/ },
  horas_extras: { label: 'Horas extras não pagas', peso: 20,
    re: /(hora(s)? extra|horas a mais|trabalhava (ate|alem)|alem do horario|sem intervalo|intervalo de almoco|banco de horas|jornada|domingo(s)? e feriado|feriados?)/ },
  sem_carteira: { label: 'Vínculo sem carteira assinada', peso: 25,
    re: /(sem carteira|nao (assinou|assinaram)|carteira (nao|nunca) (foi )?assinada|sem registro|informal|clt nao|nunca assin|por fora|pj (obrigado|forcado)|pejotiza)/ },
  assedio: { label: 'Assédio moral/sexual', peso: 25,
    re: /(assedi|humilha|xing|gritava|constrang|abuso|perseguic|perseguia|ameac|racis|discrimin)/ },
  acidente_doenca: { label: 'Acidente de trabalho / doença ocupacional', peso: 30,
    re: /(acidente|machuc|lesao|ler\b|dort|tendinit|hernia|coluna|afastad|inss|auxilio.doenca|burnout|depressao|doenca ocupacional|cai (da|do|no)|quebrei|cortei|amput)/ },
  justa_causa: { label: 'Demissão por justa causa (reversão)', peso: 20,
    re: /(justa causa)/ },
  fgts: { label: 'FGTS não depositado', peso: 15, re: /(fgts|fundo de garantia)/ },
  insalubridade: { label: 'Insalubridade/periculosidade', peso: 15, re: /(insalubr|pericul|produto quimico|barulho|ruido)/ },
  gestante: { label: 'Estabilidade gestante', peso: 25, re: /(gravida|gestante|gravidez|licenca maternidade)/ },
};

export function extractProblemas(t) {
  const n = norm(t);
  return Object.entries(PROBLEMAS).filter(([, p]) => p.re.test(n)).map(([k]) => k);
}

export function extractSituacao(t) {
  const n = norm(t);
  if (/(ainda trabalho|continuo trabalhando|to trabalhando|estou trabalhando|ainda estou (na|no)|trabalho (la|ainda)|sigo trabalhando|ainda (to|estou) empregad)/.test(n)) return 'empregado';
  if (/(fui demitid|me demitiram|me mandaram embora|mandado embora|mandada embora|fui dispensad|desligad|pedi demissao|pedi (as )?contas|sai da empresa|sai do emprego|fui mandad|nao trabalho mais|ex.?(patrao|empresa|chefe)|justa causa|fui despedid|me despediram|rescisao)/.test(n)) return 'desligado';
  if (/^(sim|s|ainda sim|to sim|estou)$/.test(n)) return null;
  return null;
}

const NUM = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, trinta: 30 };
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const toNum = (s) => (/^\d+([.,]\d+)?$/.test(s) ? Number(s.replace(',', '.')) : NUM[s] ?? null);

// Converte expressões de duração ("2 anos e meio", "8 meses", "uns 15 dias") em meses.
export function parseDurationMonths(t) {
  const n = norm(t);
  let total = 0, found = false;
  const re = /(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta)\s*(anos?|mes(?:es)?|semanas?|dias?)/g;
  let m;
  while ((m = re.exec(n))) {
    const v = toNum(m[1]); if (v == null) continue;
    found = true;
    if (m[2].startsWith('ano')) total += v * 12;
    else if (m[2].startsWith('mes')) total += v;
    else if (m[2].startsWith('semana')) total += v / 4.3;
    else total += v / 30;
  }
  if (/\be meio\b/.test(n) && found) total += /anos?\s+e meio/.test(n) ? 6 : 0.5;
  if (!found && /\b(meio ano)\b/.test(n)) { total = 6; found = true; }
  if (!found && /\b(um ano|1 ano)\b/.test(n)) { total = 12; found = true; }
  return found ? Math.round(total * 10) / 10 : null;
}

// Há quantos meses o lead saiu da empresa (para cálculo do prazo prescricional de 2 anos).
export function extractMesesDesdeSaida(t, ref = new Date()) {
  const n = norm(t);
  if (/\b(mes passado|mes retrasado)\b/.test(n)) return /retrasado/.test(n) ? 2 : 1;
  if (/\b(hoje|ontem|anteontem|essa semana|esta semana|semana passada|outro dia)\b/.test(n)) return 0.2;
  if (/\b(ano passado)\b/.test(n)) return 12;
  const rel = n.match(/(?:ha|faz|tem|hai|uns|umas|cerca de|quase|mais de)\s+(.*)/);
  if (rel) { const d = parseDurationMonths(rel[1].split(/[,.;!?]| trabalh| fiquei| e eu | la /)[0]); if (d != null) return d; }
  const d = parseDurationMonths(n);
  if (d != null && /(atras|que sai|que fui|que me|desde)/.test(n)) return d;
  // datas: 03/2025, 15/03/2025, "em março", "março de 2025"
  const dm = n.match(/\b(?:(\d{1,2})\/)?(\d{1,2})\/(\d{2,4})\b/);
  if (dm) {
    const y = Number(dm[3].length === 2 ? '20' + dm[3] : dm[3]);
    const date = new Date(y, Number(dm[2]) - 1, Number(dm[1] || 15));
    return Math.max(0, Math.round(((ref - date) / (30.4 * 86400000)) * 10) / 10);
  }
  const mi = MESES.findIndex((mes) => new RegExp(`\\b${mes}\\b`).test(n));
  if (mi >= 0) {
    const ym = n.match(/\b(20\d{2})\b/);
    let y = ym ? Number(ym[1]) : ref.getFullYear();
    let date = new Date(y, mi, 15);
    if (!ym && date > ref) date = new Date(y - 1, mi, 15);
    return Math.max(0, Math.round(((ref - date) / (30.4 * 86400000)) * 10) / 10);
  }
  if (d != null) return d;
  return null;
}

// Tempo de vínculo mencionado espontaneamente ("trabalhei 3 anos lá", "fiquei 8 meses").
export function extractTempoVinculo(t) {
  const n = norm(t);
  const m = n.match(/(trabalhei|trabalho|trabalhava|fiquei|tenho|completei|foram|durante)\s+(?:la\s+|nela\s+|na empresa\s+|ha\s+|por\s+|uns\s+|quase\s+|mais de\s+)*((?:\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte)\s*(?:anos?|mes(?:es)?)(?:\s+e\s+(?:meio|\d+\s*mes(?:es)?))?)/);
  return m ? parseDurationMonths(m[2]) : null;
}

export function extractCarteira(t) {
  const n = norm(t);
  if (PROBLEMAS.sem_carteira.re.test(n) || /\b(nao|nunca)\b.*\bassinad/.test(n)) return false;
  if (/(carteira assinada|era assinada|com carteira|registrad|clt\b|assinada sim|sim,? assinada|tinha carteira)/.test(n)) return true;
  return null;
}

export function extractProvas(t) {
  const n = norm(t);
  if (/^(nao|n|nenhum|nenhuma|nada|nao tenho|acho que nao)\b/.test(n) || /(nao tenho (prova|nada|documento)|sem prova)/.test(n)) return false;
  if (/(print|conversa|mensage|whats|audio|holerite|contracheque|contra.cheque|recibo|ponto|foto|video|testemunha|colega|documento|email|e-mail|atestado|laudo|cat\b|exame|tenho sim|^sim\b|tenho)/.test(n)) return true;
  return null;
}

export function extractNome(t) {
  const raw = t.trim();
  const m = raw.match(/(?:meu nome (?:e|é)|me chamo|sou (?:o|a)|aqui (?:e|é) (?:o|a)?|pode me chamar de)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i);
  let nome = m ? m[1] : null;
  if (!nome && /^[A-Za-zÀ-ÿ]+(\s+[A-Za-zÀ-ÿ]+){0,3}[.!]?$/.test(raw) && raw.length <= 40) {
    const words = norm(raw).replace(/[.!]$/, '').split(' ');
    if (!words.some((w) => NAO_NOME.has(w))) nome = raw.replace(/[.!]$/, '');
  }
  if (!nome) return null;
  nome = nome.split(/\s+/).filter((w) => !/^(e|tudo|bem|aqui)$/i.test(w)).slice(0, 3)
    .map((w) => (/^(da|de|do|dos|das)$/i.test(w) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  return nome || null;
}

const NAO_NOME = new Set(('oi ola bom boa dia tarde noite sim nao ok tudo bem obrigado obrigada quero preciso sai fui ' +
  'trabalhei trabalho em no na la empresa demitido demitida carteira hora horas tenho nada nenhum ainda ' +
  'pode claro isso certo beleza duvida advogado advogada ajuda socorro tchau valeu').split(' '));

export const INTENCOES = {
  humano: /(falar com (o |a |um |uma )?(advogad|doutor|doutora|dr|dra|atendente|humano|pessoa)|atendente humano|quero um humano|pessoa de verdade|e robo|voce e um robo)/,
  preco: /(quanto custa|quanto (e|fica|cobra)|valor da consulta|honorario|preco|cobram|consulta e paga|e gratis|gratuit|pagar (a|pela) consulta)/,
  promessa: /(vou ganhar|tenho chance|tenho direito|ganho a causa|quanto (eu )?vou receber|quanto posso receber|da pra ganhar)/,
  endereco: /(endereco|onde fica|onde voces ficam|localizacao|atende(m)? online|tem atendimento online)/,
  agendar: /(agendar|marcar|quero (uma |a )?consulta|quero contratar|contratar|quero entrar com|processar|entrar na justica|quero (abrir|mover) (um )?processo)/,
  urgencia: /(urgente|urgencia|o quanto antes|rapido|hoje mesmo|desesper|socorro)/,
  duvida: /(so uma duvida|so queria saber|curiosidade|so pra saber|pergunta rapida|so tirar uma duvida)/,
  sair: /(nao quero mais|pare de|para de mandar|sair da lista|descadastr|nao tenho interesse|nao me mande)/,
  lei: /(o que (diz|fala) a lei|qual (e )?(o )?artigo|que artigo|base legal|a lei (diz|fala|garante)|segundo a (lei|clt)|\bclt\b.*(diz|fala)|esta na (lei|clt)|tem lei)/,
  sim: /^(sim|s|isso|claro|quero|pode ser|pode|ok|beleza|bora|com certeza|aham|uhum|quero sim|sim quero|tenho interesse)\b/,
  nao: /^(nao|n|agora nao|depois|mais tarde|talvez depois|ainda nao)\b/,
};

export function intencoes(t) {
  const n = norm(t);
  return Object.entries(INTENCOES).filter(([, re]) => re.test(n)).map(([k]) => k);
}

// Extrai tudo o que conseguir de uma mensagem.
export function extractAll(t, ref) {
  return {
    nome: extractNome(t),
    problemas: extractProblemas(t),
    situacao: extractSituacao(t),
    mesesDesdeSaida: extractMesesDesdeSaida(t, ref),
    tempoVinculoMeses: extractTempoVinculo(t),
    duracao: parseDurationMonths(t),
    carteira: extractCarteira(t),
    provas: extractProvas(t),
    intencoes: intencoes(t),
  };
}
