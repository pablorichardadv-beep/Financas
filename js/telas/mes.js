import { esc } from '../ui.js';
import { num, reais, mesAtual, mesNome } from '../format.js';
import * as D from '../domain.js';

let mesEscolhido = null;

export default function mes(ctx) {
  const d = ctx.dados;
  const meses = D.mesesDisponiveis(d, mesAtual());
  mesEscolhido ||= mesAtual();
  if (!meses.includes(mesEscolhido)) mesEscolhido = meses[0];
  const r = D.resumoMes(d, mesEscolhido);
  const cats = D.despesasPorCategoria(d, mesEscolhido);
  const fatura = D.faturaCartao(d, mesEscolhido);
  const maior = cats[0]?.valor || 1;

  const html = `
    <header class="topo"><h1 class="grande">Mês</h1></header>
    <div class="filtros"><label class="pilula on">${esc(mesNome(mesEscolhido))}<select data-mes aria-label="Mês">${meses.map((m) => `<option value="${m}" ${m === mesEscolhido ? 'selected' : ''}>${esc(mesNome(m))}</option>`).join('')}</select></label></div>
    <section class="card" aria-label="Resumo">
      <div class="tres">
        <div><span class="rot">Receitas</span><b class="verde">+ ${num(r.receitas)}</b></div>
        <div><span class="rot">Despesas</span><b class="verm">− ${num(r.despesas)}</b></div>
        <div><span class="rot">Saldo</span><b class="azul">${r.saldo < 0 ? '− ' : ''}${num(r.saldo)}</b></div>
      </div>
      <div class="legenda"><span>Pagas ${reais(r.pagas)}</span><span>A pagar ${reais(r.aPagar)}</span></div>
    </section>
    <section class="card" aria-label="Despesas por categoria">
      <h2>Despesas por categoria</h2>
      <div>${cats.length ? cats.map((c) => `<div class="cat-linha"><div class="r"><span>${esc(c.nome)}</span><span>${reais(c.valor)}</span></div>
        <div class="b"><i style="width:${Math.max(2, Math.round((c.valor / maior) * 100))}%"></i></div><small>${(c.pct * 100).toFixed(1).replace('.', ',')}% das despesas</small></div>`).join('') : '<p class="vazio">Sem despesas neste mês.</p>'}</div>
    </section>
    ${fatura ? `<section class="card" aria-label="Cartão de crédito"><div class="linha-tit"><h2>Fatura do cartão</h2><b class="verm">${reais(fatura)}</b></div>
      <p class="nota">Compras no cartão ficam fora das despesas acima. Elas saem da conta quando você lança o pagamento da fatura (ex.: “Cartão Nubank”).</p></section>` : ''}
    <a class="link" href="#/categorias" style="justify-content:center">Gerenciar categorias ›</a>
    <p class="nota" style="text-align:center">Metas por categoria (Ideal %) entram na próxima etapa.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-mes]').addEventListener('change', (e) => { mesEscolhido = e.target.value; ctx.recarregar(); });
    },
  };
}
