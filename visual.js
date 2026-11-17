// Peças visuais compartilhadas: cor e ícone das categorias, gráficos em SVG (sem bibliotecas) e os textos de ajuda ("?").
import { esc, folha } from './ui.js';
import { norm, reais } from './format.js';

// ---------- cor e ícone por categoria ----------
const MATIZES = [210, 150, 25, 340, 270, 45, 185, 100, 0, 300];
const hash = (s) => [...String(s)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
export const matizCat = (c) => MATIZES[hash(c?.id || '') % MATIZES.length];
export const corCat = (c) => (c ? `hsl(${matizCat(c)} 55% 48%)` : 'hsl(215 12% 60%)');

const ICONES = [
  [/supermerc|mercado|feira|padaria/, '🛒'], [/farmaci|medic|saude|remedio/, '💊'], [/gasolin|combust|uber|transporte/, '⛽'],
  [/lazer|cinema|viagem|passeio/, '🎬'], [/fixa|conta|casa|aluguel|condomin/, '🏠'], [/richard|escritorio|adv/, '⚖️'],
  [/leticia|filh|familia/, '👪'], [/rendimento|invest/, '📈'], [/contabil/, '🧾'], [/injep|injeprime/, '🏭'],
  [/repasse/, '🔁'], [/outros/, '✨'], [/educac|curso|escola/, '🎓'], [/restaur|aliment|lanche/, '🍽️'],
];
export const iconeCat = (c) => {
  const n = norm(c?.nome || '');
  const hit = ICONES.find(([re]) => re.test(n));
  return hit ? hit[1] : (c?.nome || '?').trim().charAt(0).toUpperCase();
};
/** Bolinha colorida com o ícone da categoria (vazia, cinza, quando não há categoria). */
export const badgeCat = (c) => `<span class="cbadge" style="--h:${c ? matizCat(c) : 215}" aria-hidden="true">${c ? esc(iconeCat(c)) : '·'}</span>`;

// ---------- gráficos ----------
/** Rosca de despesas por categoria. fatias: [{ valor, cor }] */
export function rosca(fatias, centro = '', rotulo = 'Despesas por categoria') {
  const total = fatias.reduce((s, f) => s + f.valor, 0) || 1;
  const r = 44, c = 2 * Math.PI * r;
  let acum = 0;
  const arcos = fatias.map((f) => {
    const len = (f.valor / total) * c;
    const arco = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${f.cor}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 1.5).toFixed(2)} ${(c - Math.max(0, len - 1.5)).toFixed(2)}" stroke-dashoffset="${(-acum).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
    acum += len;
    return arco;
  }).join('');
  return `<svg class="rosca" viewBox="0 0 120 120" role="img" aria-label="${esc(rotulo)}"><circle cx="60" cy="60" r="${r}" fill="none" stroke="var(--line)" stroke-width="16"/>${arcos}
    <text x="60" y="57" text-anchor="middle" class="rosca-t1">${esc(centro)}</text><text x="60" y="72" text-anchor="middle" class="rosca-t2">no mês</text></svg>`;
}

/** Barras duplas (entradas × saídas) por mês. serie: [{ mes: 'AAAA-MM', receitas, despesas }] */
export function barrasMeses(serie) {
  const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const max = Math.max(1, ...serie.flatMap((s) => [s.receitas, s.despesas]));
  const W = 320, H = 130, base = 108, alt = 96, larg = W / serie.length;
  const barras = serie.map((s, i) => {
    const x = i * larg + larg / 2;
    const hr = Math.max(s.receitas ? 2 : 0, (s.receitas / max) * alt), hd = Math.max(s.despesas ? 2 : 0, (s.despesas / max) * alt);
    return `<g><title>${MES[Number(s.mes.slice(5)) - 1]}: entradas ${reais(s.receitas)} · saídas ${reais(s.despesas)}</title>
      <rect x="${(x - 14).toFixed(1)}" y="${(base - hr).toFixed(1)}" width="12" height="${hr.toFixed(1)}" rx="3" class="b-ent"/>
      <rect x="${(x + 2).toFixed(1)}" y="${(base - hd).toFixed(1)}" width="12" height="${hd.toFixed(1)}" rx="3" class="b-sai"/>
      <text x="${x.toFixed(1)}" y="124" text-anchor="middle" class="b-mes">${MES[Number(s.mes.slice(5)) - 1]}</text></g>`;
  }).join('');
  return `<svg class="barras" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas dos últimos meses"><line x1="0" y1="${base}" x2="${W}" y2="${base}" class="b-eixo"/>${barras}</svg>`;
}

// ---------- ajuda: botão "?" que explica o número ----------
export const AJUDAS = {
  saldoGeral: ['Saldo geral', 'É o dinheiro com que você pode contar: saldo das contas, mais as caixinhas, mais os empréstimos a receber. O “Em aberto” (a receber e a pagar) aparece ao lado, mas não entra nesta soma, porque ainda não aconteceu. Transferências entre suas contas não mudam o total.'],
  emAberto: ['Em aberto', 'É o que ainda não aconteceu: lançamentos “a receber” menos os “a pagar”, mais as faturas de cartão que vencem até o fim deste mês. Não entra no saldo geral. Quando você recebe, paga ou quita a fatura, o valor sai daqui e entra no saldo da conta.'],
  previstas: ['Previstas × Efetuado', 'Previsto é o que ainda vai entrar ou sair (lançamentos “a receber” e “a pagar”, mais a fatura do cartão não paga). Efetuado é o que já aconteceu: recebido menos pago. Total é a soma dos dois.'],
  fatura: ['Fatura do cartão', 'As compras entram na fatura pelo dia de fechamento: compras até o dia de fechamento vão para a fatura que vence neste ciclo; as seguintes vão para a próxima. O valor só sai da conta quando você toca em “Pagar fatura”.'],
  contas: ['Resumo das contas', 'Cada grupo mostra o total. Toque nele para ver o saldo de cada conta, caixinha, empréstimo ou cartão. Cartões mostram o que falta pagar da fatura em aberto.'],
  meta: ['Meta por categoria', 'Você define quanto quer gastar por mês em cada categoria (em Ajustes › Categorias). A barra fica verde até 80% da meta, amarela de 80% a 100% e vermelha se passar. Compras do cartão contam pelo mês da fatura.'],
  projecao: ['Projeção', 'Parte do saldo das suas contas hoje e soma, mês a mês, o que ainda vai entrar (a receber e parcelas de honorários) e o que ainda vai sair (a pagar e faturas de cartão). O que está atrasado entra no mês atual. É uma estimativa: gastos do dia a dia que você ainda não lançou não aparecem.'],
};
export const ajuda = (chave) => `<button class="ajuda" data-ajuda="${chave}" aria-label="O que é isto?">?</button>`;
export function ligarAjudas(raiz) {
  raiz.querySelectorAll('[data-ajuda]').forEach((b) => (b.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    const [tit, txt] = AJUDAS[b.dataset.ajuda] || ['Ajuda', ''];
    const f = folha(`<h2>${esc(tit)}</h2><p class="nota" style="font-size:14.5px;line-height:1.5;color:var(--ink)">${esc(txt)}</p><button class="btn sec" data-fechar>Entendi</button>`);
    f.el.querySelector('[data-fechar]').onclick = f.fechar;
  }));
}
