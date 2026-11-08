// Relógio simulado: permite "avançar o tempo" na demo (follow-ups de 24h/48h/7d, relatório das 8h).
let offsetMs = 0;
export const now = () => new Date(Date.now() + offsetMs);
export const advance = (hours) => { offsetMs += hours * 3600_000; return now(); };
export const setTime = (date) => { offsetMs = date.getTime() - Date.now(); return now(); };
export const reset = () => { offsetMs = 0; };
export const HOUR = 3600_000;
export const DAY = 24 * HOUR;
