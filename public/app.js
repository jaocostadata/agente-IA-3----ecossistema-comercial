import { SCENARIOS } from './scenarios.js';

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Na versão standalone (arquivo HTML único) a API roda dentro do próprio navegador.
const api = async (path, body) => {
  if (window.SINAPTA_API) return window.SINAPTA_API(path, body);
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};

let S = null;               // estado vindo do servidor
let current = null;         // telefone do lead selecionado
let busy = false;
const TEMP_COLOR = { quente: 'var(--hot)', morno: 'var(--warm)', frio: 'var(--cold)' };
const STAGE_LABEL = { novo: 'Novo', nome: 'Boas-vindas', problema: 'Qualificação', situacao: 'Qualificação', saida: 'Qualificação', vinculo: 'Qualificação', carteira: 'Qualificação', provas: 'Qualificação', oferta: 'Oferta de consulta', escolha_horario: 'Escolhendo horário', agendado: 'Agendado ✅', nutricao: 'Nutrição', encerrado: 'Encerrado' };
const PROB = { verbas_rescisorias: 'Rescisão', horas_extras: 'Horas extras', sem_carteira: 'Sem carteira', assedio: 'Assédio', acidente_doenca: 'Acidente/doença', justa_causa: 'Justa causa', fgts: 'FGTS', insalubridade: 'Insalubridade', gestante: 'Gestante', outros: 'Outros' };

// ---------- formatação estilo WhatsApp ----------
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const wa = (s) => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>');
// sempre no fuso do escritório (vem do servidor), independente do fuso do navegador
const TZ = () => ({ timeZone: S?.tz || 'America/Recife' });
const hhmm = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', ...TZ() });
const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', ...TZ() });

function bubble(dir, text, at, tag) {
  const d = document.createElement('div');
  d.className = `msg ${dir}`;
  d.innerHTML = (tag ? `<span class="tag ${tag.cls || ''}">${tag.label}</span>\n` : '') + wa(text) + `<span class="time">${hhmm(at)}${dir === 'out' ? ' ✓✓' : ''}</span>`;
  return d;
}

function renderChat(el, items) {
  // só redesenha quando há mudança (evita "piscar" a cada atualização automática)
  const last = items.at(-1);
  const sig = `${items.length}|${last?.at}|${last?.text.length}|${S?.tz}`;
  if (el._sig === sig && !el.querySelector('.empty')) return;
  el._sig = sig;
  el.innerHTML = '';
  let lastDay = '';
  for (const it of items) {
    const dd = dia(it.at);
    if (dd !== lastDay) { const x = document.createElement('div'); x.className = 'day'; x.textContent = dd; el.appendChild(x); lastDay = dd; }
    el.appendChild(bubble(it.dir, it.text, it.at, it.tag));
  }
  el.scrollTop = el.scrollHeight;
}

function typing(el, on) {
  el.querySelector('.typing')?.remove();
  if (on) { const t = document.createElement('div'); t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; el.appendChild(t); el.scrollTop = el.scrollHeight; }
}

// ---------- render ----------
function render() {
  if (!S) return;
  $('#escritorio').textContent = `${S.escritorio.nome} · ${S.escritorio.cidade}`;
  $('#clock').textContent = new Date(S.now).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', ...TZ() });
  $('#ia').textContent = `IA: ${S.ia.flash === S.ia.pro ? S.ia.flash : S.ia.flash + ' / ' + S.ia.pro}`;
  $('#lawyerStatus').textContent = `para ${S.escritorio.advogados.map((a) => a.nome).join(' e ')}`;

  // seletor de conversas
  const sel = $('#leadSelect');
  sel.innerHTML = `<option value="">+ Novo lead</option>` + S.leads.map((l) => `<option value="${l.phone}">${l.data.nome || l.pushName || '+' + l.phone}</option>`).join('');
  sel.value = current || '';

  const lead = S.leads.find((l) => l.phone === current);
  $('#leadChatName').textContent = S.escritorio.nome;
  $('#leadStatus').textContent = lead ? `conversa com ${lead.data.nome || lead.pushName || '+' + lead.phone} · ${STAGE_LABEL[lead.stage] || lead.stage}` : 'online · responde 24h';
  if (!busy) {
    if (lead) renderChat($('#leadChat'), lead.messages.map((m) => ({ dir: m.from === 'lead' ? 'out' : 'in', text: m.text, at: m.at, tag: m.followup ? { label: `Follow-up automático ${m.followup}`, cls: 'followup' } : null })));
    else { $('#leadChat')._sig = null; $('#leadChat').innerHTML = '<div class="empty">Escreva uma mensagem como se fosse um trabalhador procurando o escritório — ou clique em um <b>cenário</b> acima para ver uma conversa completa.</div>'; }
  }

  // WhatsApp do advogado
  const TAG = { briefing: { label: '📋 Briefing', cls: '' }, urgente: { label: '🚨 Urgente', cls: 'urgente' }, humano: { label: '🙋 Transferência', cls: 'urgente' }, relatorio: { label: '☀️ Relatório diário', cls: 'relatorio' }, nota: { label: '📝 Recado do cliente', cls: '' } };
  if (S.lawyerInbox.length) renderChat($('#lawyerChat'), S.lawyerInbox.map((m) => ({ dir: 'in', text: m.text, at: m.at, tag: TAG[m.tipo] })));
  else { $('#lawyerChat')._sig = null; $('#lawyerChat').innerHTML = '<div class="empty">Aqui chegam os <b>briefings</b> dos leads qualificados, <b>alertas de urgência</b> e o <b>relatório diário das 8h</b>.</div>'; }

  // dashboard
  const d = S.dashboard;
  const vs = d.variacaoVsOntem == null ? 'primeiro dia' : `${d.variacaoVsOntem >= 0 ? '↑' : '↓'} ${Math.abs(d.variacaoVsOntem)}% vs ontem`;
  const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  $('#kpis').innerHTML = [
    [d.leadsHoje, 'Leads recebidos hoje', vs],
    [d.quentesAtivos, 'Leads quentes ativos', `${d.urgentes} urgente(s)`],
    [d.taxaResposta + '%', 'Taxa de resposta', `tempo médio ${(d.tempoMedioRespostaMs / 1000).toFixed(1)}s (< 30s)`],
    [d.taxaConversao + '%', 'Taxa de conversão', `${d.consultasAgendadas} consulta(s) · ${brl(d.honorariosPotenciais)} em potencial`],
  ].map(([v, l, s]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div><div class="s">${s}</div></div>`).join('');

  const tot = Object.values(d.porTemperatura).reduce((a, b) => a + b, 0);
  $('#tempbar').innerHTML = tot ? ['quente', 'morno', 'frio'].filter((t) => d.porTemperatura[t]).map((t) =>
    `<div class="t-${t}" style="width:${(d.porTemperatura[t] / tot) * 100}%">${d.porTemperatura[t]} ${t}</div>`).join('') : '<div style="width:100%;color:#94a3b8">sem leads classificados</div>';

  $('#leadsTable').innerHTML = S.leads.map((l) => {
    const c = l.classificacao;
    const b = c ? `<span class="badge" style="background:${TEMP_COLOR[c.temperatura]}">${c.temperatura} ${c.score}</span>${c.urgente ? '<span class="badge urg">urgente</span>' : ''}` : '—';
    return `<tr data-phone="${l.phone}" class="${l.phone === current ? 'sel' : ''}"><td><b>${l.data.nome || l.pushName || '—'}</b><div class="small">+${l.phone}</div></td>
      <td>${(l.data.problemas || []).map((p) => PROB[p] || p).join(', ') || '—'}</td><td>${b}</td><td>${STAGE_LABEL[l.stage] || l.stage}${l.handoff ? '<div class="small">🙋 pediu humano</div>' : ''}</td></tr>`;
  }).join('') || '<tr><td colspan="4" class="small">Nenhum lead ainda.</td></tr>';
  document.querySelectorAll('#leadsTable tr[data-phone]').forEach((tr) => tr.onclick = () => { current = tr.dataset.phone; render(); });

  $('#agenda').innerHTML = S.appointments.slice().sort((a, b) => a.inicio.localeCompare(b.inicio)).map((a) =>
    `<li><span><b>${a.label}</b> · ${a.leadNome}</span><span class="small">${a.advogado} · ${a.modalidade.split(' ')[0]}</span></li>`).join('') || '<li class="small">Nenhuma consulta agendada.</li>';

  // etapa do fluxo do lead atual
  const map = { novo: 0, nome: 1, problema: 2, situacao: 2, saida: 2, vinculo: 2, carteira: 2, provas: 2, oferta: 4, escolha_horario: 4, nutricao: 6, agendado: 5, encerrado: 6 };
  const idx = lead ? map[lead.stage] ?? 0 : -1;
  document.querySelectorAll('#flowSteps li').forEach((li, i) => { li.className = i < idx ? 'done' : i === idx ? 'on' : ''; });
}

async function refresh() { S = await api('/api/state'); render(); }

// ---------- envio de mensagens ----------
async function send(text, phone = current, pushName) {
  if (!phone) { phone = '55839' + String(Math.floor(10000000 + Math.random() * 89999999)); }
  current = phone;
  busy = true;
  const chat = $('#leadChat');
  if (chat.querySelector('.empty')) chat.innerHTML = '';
  chat.appendChild(bubble('out', text, S.now));
  chat.scrollTop = chat.scrollHeight;
  await sleep(350);
  typing(chat, true);
  const r = await api('/api/chat', { phone, text, pushName });
  for (const [i, rep] of r.replies.entries()) {
    await sleep(Math.min(1400, 450 + rep.length * 4));
    typing(chat, false);
    chat.appendChild(bubble('in', rep, r.lead.updatedAt));
    chat.scrollTop = chat.scrollHeight;
    if (i < r.replies.length - 1) typing(chat, true);
  }
  typing(chat, false);
  chat._sig = null;
  busy = false;
  await refresh();
}

async function playScenario(s) {
  if (busy) return;
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await api('/api/clock', { setHour: s.hora });
    await refresh();
    current = s.phone;
    if (S.leads.find((l) => l.phone === s.phone)) { s = { ...s, phone: s.phone.slice(0, -4) + String(Math.floor(Math.random() * 9000) + 1000) }; current = s.phone; }
    render();
    $('#leadChat').innerHTML = ''; $('#leadChat')._sig = null;
    for (const m of s.msgs) {
      await sleep(700);
      await send(m, s.phone, s.pushName);
      await api('/api/clock', { hours: 0.03 });
    }
  } finally {
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
    await refresh();
  }
}

// ---------- eventos ----------
$('#scenarios').innerHTML = SCENARIOS.map((s, i) =>
  `<button data-i="${i}"><span class="t" style="background:${TEMP_COLOR[s.esperado] || '#94a3b8'}"></span>${s.titulo} · ${String(s.hora).padStart(2, '0')}h</button>`).join('');
$('#scenarios').onclick = (e) => { const b = e.target.closest('button'); if (b) playScenario(SCENARIOS[b.dataset.i]); };
$('#sendForm').onsubmit = (e) => { e.preventDefault(); const t = $('#msg').value.trim(); if (!t || busy) return; $('#msg').value = ''; send(t); };
$('#leadSelect').onchange = (e) => { current = e.target.value || null; render(); };
document.querySelector('[data-hour="22"]').onclick = async () => { await api('/api/clock', { setHour: 22 }); refresh(); };
$('#adv24').onclick = async () => { const r = await api('/api/clock', { hours: 24 }); await refresh(); flash(`${r.followupsEnviados.length} follow-up(s) enviado(s)`); };
$('#rel8').onclick = async () => { const r = await api('/api/clock', { setHour: 8 }); if (!r.relatorio) await api('/api/report', {}); await refresh(); flash('Relatório das 8h enviado ao advogado'); };
// confirmação na própria página (confirm() é bloqueado em alguns visualizadores)
$('#reset').onclick = async (e) => {
  const btn = e.currentTarget;
  if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = 'Clique de novo p/ apagar'; setTimeout(() => { delete btn.dataset.armed; btn.textContent = '↺ Reiniciar'; }, 3000); return; }
  delete btn.dataset.armed; btn.textContent = '↺ Reiniciar';
  await api('/api/reset', {}); current = null; refresh(); flash('Demo reiniciada');
};

function flash(msg) {
  const d = document.createElement('div');
  d.textContent = msg;
  Object.assign(d.style, { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: '#0f1b3d', color: '#fff', padding: '10px 16px', borderRadius: '10px', zIndex: 9, fontSize: '14px' });
  document.body.appendChild(d); setTimeout(() => d.remove(), 2500);
}

refresh();
setInterval(() => { if (!busy) refresh(); }, 4000);
