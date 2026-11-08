// Fuso do escritório (João Pessoa/PB, UTC-3) — saudação, horário comercial e relatório das 8h.
if (!process.env.TZ) process.env.TZ = process.env.ESCRITORIO_TZ || "America/Recife";

// Configuração do escritório-cliente (no produto, cada cliente tem o seu arquivo/linha no Supabase).
export const escritorio = {
  nome: 'Almeida & Costa Advocacia Trabalhista',
  agenteNome: 'Lia',
  cidade: 'João Pessoa/PB',
  endereco: 'Av. Epitácio Pessoa, 1500 — Sala 804, Tambaú, João Pessoa/PB',
  horarioAtendimentoHumano: 'segunda a sexta, das 8h às 18h',
  advogados: [
    { id: 'adv1', nome: 'Dra. Mariana Almeida', oab: 'OAB/PB 12.345', whatsapp: '5583988880001' },
    { id: 'adv2', nome: 'Dr. Rafael Costa', oab: 'OAB/PB 23.456', whatsapp: '5583988880002' },
  ],
  // Grade de consultas (Google Calendar na produção; mock local em calendar.js)
  agenda: { dias: [1, 2, 3, 4, 5], horas: [9, 10, 11, 14, 15, 16, 17], duracaoMin: 45 },
  plano: 'ESCRITÓRIO',
};

export const env = {
  port: Number(process.env.PORT || 3000),
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-sonnet-5-5',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiFlash: process.env.GEMINI_FLASH_MODEL || 'gemini-flash-latest',
  geminiPro: process.env.GEMINI_PRO_MODEL || 'gemini-pro-latest',
  evolutionUrl: process.env.EVOLUTION_API_URL || '',
  evolutionKey: process.env.EVOLUTION_API_KEY || '',
  evolutionInstance: process.env.EVOLUTION_INSTANCE || 'escritorio',
  dataFile: process.env.DATA_FILE || 'data/db.json',
};
