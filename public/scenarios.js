// Conversas roteirizadas usadas pela demo (terminal e simulador web).
export const SCENARIOS = [
  {
    id: 'rescisao', titulo: 'Demitido sem rescisão', esperado: 'quente', hora: 22,
    phone: '5583991110001', pushName: 'Carlos',
    msgs: [
      'Boa noite, fui demitido mês passado e até agora não recebi minha rescisão',
      'Carlos Eduardo',
      'trabalhei 3 anos lá',
      'sim, era assinada',
      'tenho os contracheques e as mensagens do RH dizendo que iam pagar',
      '1',
    ],
  },
  {
    id: 'horas', titulo: 'Horas extras (ainda empregada)', esperado: 'morno', hora: 14,
    phone: '5583991110002', pushName: 'Fernanda',
    msgs: [
      'Oi, boa tarde',
      'Fernanda Lima',
      'Faço hora extra quase todo dia e a empresa não paga nada',
      'sim, ainda trabalho lá',
      '2 anos',
      'sim',
      'tenho uma planilha que eu anoto os horários',
      'quanto custa a consulta?',
      'a segunda opção, presencial',
    ],
  },
  {
    id: 'acidente', titulo: 'Acidente sem carteira (urgente)', esperado: 'quente', hora: 2,
    phone: '5583991110003', pushName: 'José',
    msgs: [
      'oi, sofri um acidente na obra, quebrei o braço e to afastado. A empresa nunca assinou minha carteira',
      'meu nome é José Ferreira',
      'to afastado mas ainda sou da empresa',
      'uns 8 meses',
      'tenho o atestado e fotos',
      'quero falar com o advogado',
      '3',
    ],
  },
  {
    id: 'abandono', titulo: 'Parou de responder (follow-up)', esperado: null, hora: 23,
    phone: '5583991110006', pushName: 'Rita',
    msgs: [
      'oi, trabalho sem carteira assinada há 2 anos numa loja',
      'Rita',
    ],
  },
  {
    id: 'prescrito', titulo: 'Saiu há 3 anos (frio)', esperado: 'frio', hora: 10,
    phone: '5583991110004', pushName: 'Paulo',
    msgs: [
      'Olá, só uma dúvida',
      'Paulo',
      'não depositaram meu FGTS numa empresa que eu trabalhei',
      'não, já saí',
      'faz uns 3 anos',
      '1 ano',
      'sim',
      'não',
      'não, obrigado',
    ],
  },
  {
    id: 'prazo', titulo: 'Justa causa, prazo acabando', esperado: 'quente', hora: 19,
    phone: '5583991110005', pushName: 'Ana',
    msgs: [
      'Boa noite! Fui mandada embora por justa causa há 1 ano e 10 meses e quero entrar na justiça, é urgente',
      'Ana Beatriz',
      '4 anos',
      'sim',
      'tenho testemunhas',
      'vou ganhar?',
      '1',
    ],
  },
];
