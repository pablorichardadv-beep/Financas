import { esc, icone } from '../ui.js';
import { reais } from '../format.js';
import * as D from '../domain.js';
import { abrirEditorCategoria } from './cadastros.js';

export default function categorias(ctx) {
  const d = ctx.dados;
  const linha = (c) => {
    const n = D.usoCategoria(d, c.id);
    return `<button class="item" data-cat="${esc(c.id)}"><span class="t"><b>${esc(c.nome)}</b><small>${n === 0 ? 'nunca usada' : n + (n === 1 ? ' lançamento' : ' lançamentos')}${c.meta > 0 ? ' · meta ' + reais(c.meta) + '/mês' : ''}</small></span><span class="rot">›</span></button>`;
  };
  const grupo = (titulo, lista, vazio) => `<section class="card" style="gap:2px"><h2>${titulo}</h2><div class="lista">${lista.length ? lista.map(linha).join('') : `<p class="vazio">${vazio}</p>`}</div></section>`;
  const ordenar = (xs) => [...xs].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const ativas = d.categorias.filter((c) => !c.arquivada);

  const html = `
    <header class="topo"><div><a class="link" href="#/ajustes">‹ Ajustes</a><h1 class="grande">Categorias</h1></div><button class="btn-ic" data-nova aria-label="Nova categoria">${icone.mais()}</button></header>
    ${grupo('Despesas', ordenar(ativas.filter((c) => c.tipo === 'despesa')), 'Nenhuma categoria de despesa.')}
    ${grupo('Receitas', ordenar(ativas.filter((c) => c.tipo === 'receita')), 'Nenhuma categoria de receita.')}
    ${d.categorias.some((c) => c.arquivada) ? grupo('Arquivadas', ordenar(d.categorias.filter((c) => c.arquivada)), '') : ''}
    <p class="nota" style="text-align:center">Toque em uma categoria para renomear, arquivar ou excluir. Categorias já usadas não podem ser apagadas: são arquivadas e o histórico fica intacto.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-nova]').onclick = () => abrirEditorCategoria(ctx, null, { tipo: 'despesa' });
      raiz.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => abrirEditorCategoria(ctx, b.dataset.cat)));
    },
  };
}
