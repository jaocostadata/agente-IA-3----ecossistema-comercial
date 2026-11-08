// Base de conhecimento da CLT: consulta por artigo, busca textual (BM25, offline) e
// artigos de referência por tema trabalhista. Usada no briefing, nas respostas ao cliente e
// como contexto (RAG) quando há LLM configurado.
import DATA from './clt-data.js';

let base = DATA;
let idx = null;

const STOP = new Set(('a o e de da do das dos em no na nos nas um uma uns umas por para com sem que se ao aos as os ou ' +
  'e sua seu suas seus ele ela eles elas isso este esta esse essa como mais menos ja nao sim foi ser ter ha pelo pela pelos pelas ' +
  'art artigo lei paragrafo caput inciso alinea').split(' '));
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => t.slice(0, 6));

// Temas do agente -> artigos da CLT mais pertinentes (o texto vem da base importada).
export const REFERENCIAS = {
  verbas_rescisorias: [{ art: '477', par: '§6' }, { art: '477', par: '§8' }, { art: '467' }],
  horas_extras: [{ art: '58' }, { art: '59' }, { art: '71' }],
  sem_carteira: [{ art: '3' }, { art: '29' }, { art: '41' }],
  assedio: [{ art: '483' }, { art: '223-B' }, { art: '223-C' }],
  acidente_doenca: [{ art: '157' }, { art: '166' }],
  justa_causa: [{ art: '482' }],
  fgts: [{ art: '477' }],
  insalubridade: [{ art: '189' }, { art: '192' }, { art: '193' }],
  gestante: [{ art: '391-A' }, { art: '392' }],
  prescricao: [{ art: '11' }],
};

export function carregar(data) { base = data; idx = null; }
export const info = () => ({ nome: base.nome, fonte: base.fonte, importadoEm: base.importadoEm, totalArtigos: base.totalArtigos || base.artigos.length });
export const disponivel = () => base.artigos.length > 0;

function indice() {
  if (idx) return idx;
  const docs = base.artigos.map((a) => {
    const tf = new Map();
    const toks = tokens(a.texto + ' ' + (a.capitulo || '') + ' ' + (a.secao || ''));
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    return { a, tf, len: toks.length };
  });
  const df = new Map();
  docs.forEach((d) => d.tf.forEach((_, t) => df.set(t, (df.get(t) || 0) + 1)));
  const avg = docs.reduce((s, d) => s + d.len, 0) / (docs.length || 1);
  const porNumero = new Map(base.artigos.map((a) => [a.numero.toUpperCase(), a]));
  return (idx = { docs, df, avg, porNumero });
}

export function artigo(numero) {
  return indice().porNumero.get(String(numero).toUpperCase().replace(/\s+/g, '')) || null;
}

export function trecho(ref, max = 260) {
  const a = artigo(ref.art);
  if (!a) return null;
  const p = ref.par ? a.paragrafos.find((x) => x.id === ref.par) : a.paragrafos[0];
  if (!p) return null;
  let t = p.texto.replace(/\s+/g, ' ').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return { rotulo: `Art. ${a.numero}${ref.par ? (ref.par === 'pu' ? ', parágrafo único' : ', ' + ref.par.replace('§', '§ ') + 'º') : ''}`, texto: t, artigo: a.numero };
}

export function buscar(consulta, k = 3) {
  if (!disponivel()) return [];
  const { docs, df, avg } = indice();
  const q = [...new Set(tokens(consulta))];
  const N = docs.length, k1 = 1.4, b = 0.75;
  return docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t); if (!f) continue;
      const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));
      s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avg));
    }
    return { a: d.a, s };
  }).filter((x) => x.s > 0).sort((x, y) => y.s - x.s).slice(0, k).map((x) => x.a);
}

// Fundamentos para um lead: referências do tema + prescrição (se desligado), só o que existe na base.
export function fundamentos(problemas = [], { desligado = false, max = 4 } = {}) {
  if (!disponivel()) return [];
  const refs = problemas.flatMap((p) => REFERENCIAS[p] || []);
  if (desligado) refs.push(...REFERENCIAS.prescricao);
  const vistos = new Set();
  return refs.filter((r) => { const k = r.art + (r.par || ''); if (vistos.has(k)) return false; vistos.add(k); return true; })
    .map((r) => trecho(r)).filter(Boolean).slice(0, max);
}

// Contexto para o LLM (RAG): artigos completos relevantes, limitados em tamanho.
export function contextoLLM(problemas = [], pergunta = '', maxChars = 6000) {
  if (!disponivel()) return '';
  const nums = new Set(problemas.flatMap((p) => (REFERENCIAS[p] || []).map((r) => r.art)));
  const arts = [...[...nums].map(artigo).filter(Boolean), ...(pergunta ? buscar(pergunta, 3) : [])];
  let out = '', vistos = new Set();
  for (const a of arts) {
    if (vistos.has(a.numero)) continue; vistos.add(a.numero);
    const bloco = `\n[CLT ${a.numero}] ${a.texto}\n`;
    if (out.length + bloco.length > maxChars) break;
    out += bloco;
  }
  return out ? `TRECHOS DA CLT (texto oficial vigente, ${base.fonte || 'planalto.gov.br'}):${out}` : '';
}
