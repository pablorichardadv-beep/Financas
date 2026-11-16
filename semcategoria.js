import { esc } from '../ui.js';
import { reais, hojeISO, dataCurta } from '../format.js';
import { abrirDetalhe } from './detalhe.js';

// Compras no cartão ainda sem categoria (as que vencem a partir deste mês): toque para escolher a categoria.
export default function semcategoria(ctx) {
  const d = ctx.dados;
  const hoje = hojeISO().slice(0, 7);
  const lista = d.compras_cartao.filter((k) => !k.categoria && k.fatura >= hoje).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const html = `
    <header class="topo"><div><a class="link" href="#/">‹ Início</a><h1 class="grande">Compras sem categoria</h1></div></header>
    <section class="card" style="gap:2px"><div class="lista">${lista.length ? lista.map((k) => `<button class="item" data-id="${esc(k.id)}"><span class="cbadge" style="--h:215" aria-hidden="true">💳</span>
      <span class="t"><b>${esc(k.descricao || 'Compra')}</b><small>${k.data ? dataCurta(k.data) + ' · ' : ''}fatura ${esc(k.fatura)}</small></span><span class="v verm">− ${reais(k.valor)}</span></button>`).join('')
      : '<p class="vazio">Tudo categorizado. Boa! As compras novas do cartão aparecem aqui se ficarem sem categoria.</p>'}</div></section>
    <p class="nota" style="text-align:center">Toque em uma compra, depois em Editar, para escolher a categoria. Assim o Mês e as metas ficam corretos.</p>`;
  return { html, montar(raiz) { raiz.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id))); } };
}
