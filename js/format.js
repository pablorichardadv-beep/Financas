// Formatação de valores e datas (pt-BR). Valores são sempre guardados em CENTAVOS (inteiros).

const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 123456 -> "1.234,56" (sem sinal e sem R$) */
export const num = (centavos) => nf.format(Math.abs(centavos) / 100);

/** 123456 -> "R$ 1.234,56" */
export const reais = (centavos) => (centavos < 0 ? '−' : '') + 'R$ ' + num(centavos);

/** Com sinal explícito para listas: "+ R$ 10,00" / "− R$ 10,00" */
export const comSinal = (centavos, tipo) =>
  (tipo === 'receita' ? '+ ' : tipo === 'despesa' || tipo === 'cartao' || tipo === 'fatura' ? '− ' : '') + 'R$ ' + num(centavos);

const pad = (n) => String(n).padStart(2, '0');

/** Data de hoje (fuso do aparelho) no formato AAAA-MM-DD. */
export function hojeISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const mesAtual = (d = new Date()) => hojeISO(d).slice(0, 7);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_ABR = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "2026-11-15" -> Date local (sem deslocamento de fuso) */
export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const dataCurta = (iso) => {
  const d = parseISO(iso);
  return `${cap(DIAS_ABR[d.getDay()])}, ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
};
export const dataGrupo = (iso) => {
  const d = parseISO(iso);
  return `${DIAS_ABR[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`.toUpperCase();
};
export const dataBR = (iso) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
export const mesNome = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${cap(MESES[m - 1])} ${y}`;
};
export const mesLongo = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${cap(MESES[m - 1])} de ${y}`;
};
export const saudacaoData = (d = new Date()) => `${cap(DIAS[d.getDay()])}, ${d.getDate()} de ${MESES[d.getMonth()]}`;

/** "Hoje, 15/11" / "Ontem, 14/11" / "Qua, 11/11" */
export const dataRelativa = (iso, hoje = hojeISO()) => {
  const d = parseISO(iso);
  const h = parseISO(hoje);
  const dif = Math.round((h - d) / 86400000);
  const dm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (dif === 0) return `Hoje, ${dm}`;
  if (dif === 1) return `Ontem, ${dm}`;
  return `${cap(DIAS_ABR[d.getDay()])}, ${dm}`;
};

/** Normaliza texto para comparar descrições (sem acento, minúsculo). */
export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export const novoId = (prefixo) => prefixo + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
