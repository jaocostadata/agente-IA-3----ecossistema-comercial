// Converte o HTML oficial da CLT (planalto.gov.br, del5452compilado.htm) em artigos estruturados.
// Remove o texto revogado (tachado) e as notas de redação, mantendo só o texto vigente.

const ENT = { nbsp: ' ', ordm: 'º', ordf: 'ª', sect: '§', deg: '°', quot: '"', amp: '&', lt: '<', gt: '>', ndash: '–', mdash: '—', laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', middot: '·' };

export function decodeHtmlBuffer(buf) {
  const head = Buffer.from(buf).subarray(0, 4000).toString('latin1');
  const m = head.match(/charset\s*=\s*["']?([\w-]+)/i);
  const cs = (m ? m[1] : 'windows-1252').toLowerCase();
  const enc = /utf-?8/.test(cs) ? 'utf-8' : /1252|iso-8859-1|latin/.test(cs) ? 'windows-1252' : cs;
  return new TextDecoder(enc).decode(buf);
}

export function htmlToLines(html) {
  let s = html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(strike|s|del)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')       // texto revogado
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? ENT[n] ?? m);
  // notas de redação/vigência entre parênteses
  s = s.replace(/\((?:\s*)(?:Reda[çc][ãa]o dada|Inclu[ií]d[oa]|Acrescentad[oa]|Acrescid[oa]|Renumerad[oa]|Vide|Vig[êe]ncia|Produ[çc][ãa]o de efeitos?|Regulamento|Express[ãa]o|Par[áa]grafo renumerado|Revigorad[oa])[^)]*\)/gi, ' ');
  return s.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
}

const RE_ART = /^Art\.?\s*(\d{1,4}(?:\.\d{3})?)\s*[º°o]?\s*(?:-\s*([A-Z]{1,2})\b)?\s*[.\-–—:]?\s*(.*)$/;
const RE_PAR = /^(§\s*(\d+)\s*[º°o]?|Par[áa]grafo [úu]nico)\s*[.\-–—:]?\s*(.*)$/i;
const RE_TIT = /^(T[ÍI]TULO|CAP[ÍI]TULO|SE[ÇC][ÃA]O|SUBSE[ÇC][ÃA]O)\s+([IVXLC]+(?:-[A-Z])?|[ÚU]NIC[OA])\b/i;

export function parseClt(html, { fonte = 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452compilado.htm' } = {}) {
  const lines = htmlToLines(html);
  const artigos = new Map();
  const ctx = { titulo: '', capitulo: '', secao: '' };
  let atual = null;

  const fechar = () => {
    if (!atual) return;
    atual.texto = atual.paragrafos.map((p) => p.texto).join('\n');
    const revogado = /^\(?\s*(revogad[oa]|vetad[oa])/i.test(atual.resto) && atual.texto.length < 120;
    delete atual.resto;
    if (!revogado && atual.texto.length > 3) artigos.set(atual.numero, atual); // última versão vigente prevalece
    atual = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const t = l.match(RE_TIT);
    if (t && l.length < 60) {
      fechar();
      const nivel = t[1].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      const nome = (lines[i + 1] && !RE_ART.test(lines[i + 1]) && !RE_TIT.test(lines[i + 1])) ? lines[i + 1] : '';
      const rotulo = `${l}${nome ? ' — ' + nome : ''}`;
      if (nivel === 'TITULO') { ctx.titulo = rotulo; ctx.capitulo = ''; ctx.secao = ''; }
      else if (nivel === 'CAPITULO') { ctx.capitulo = rotulo; ctx.secao = ''; }
      else ctx.secao = rotulo;
      if (nome) i++;
      continue;
    }
    const a = l.match(RE_ART);
    if (a) {
      fechar();
      const numero = a[1].replace('.', '') + (a[2] ? '-' + a[2] : '');
      atual = { numero, titulo: ctx.titulo, capitulo: ctx.capitulo, secao: ctx.secao, resto: a[3], paragrafos: [{ id: 'caput', texto: `Art. ${numero}. ${a[3]}`.trim() }] };
      continue;
    }
    if (!atual) continue;
    const p = l.match(RE_PAR);
    if (p) atual.paragrafos.push({ id: p[2] ? '§' + p[2] : 'pu', texto: l });
    else atual.paragrafos.at(-1).texto += '\n' + l; // incisos, alíneas, continuação
  }
  fechar();

  const lista = [...artigos.values()].sort((x, y) => parseInt(x.numero) - parseInt(y.numero) || x.numero.localeCompare(y.numero));
  return { fonte, nome: 'Consolidação das Leis do Trabalho (Decreto-Lei nº 5.452/1943)', importadoEm: new Date().toISOString(), totalArtigos: lista.length, artigos: lista };
}
