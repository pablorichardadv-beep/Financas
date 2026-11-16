// Peças compartilhadas entre as telas.
import { esc } from '../ui.js';
import { comSinal, dataCurta } from '../format.js';

const mapa = (arr) => new Map(arr.map((x) => [x.id, x]));
export const nomes = (d) => ({ conta: mapa(d.contas), cat: mapa(d.categorias), cx: mapa(d.caixinhas) });

export function destinoTransf(l, n) {
  if (l.conta_destino) return n.conta.get(l.conta_destino)?.nome || '?';
  if (l.destino_caixinha) return 'Caixinha ' + (n.cx.get(l.destino_caixinha)?.nome || '');
  return 'Caixinha/outra conta';
}

export const tituloItem = (l) => l.descricao || (l.tipo === 'transferencia' ? 'Transferência entre contas' : 'Sem descrição');

function tagDe(l) {
  if (l.tipo === 'cartao') return '<span class="tag azul">Cartão</span>';
  if (l.tipo === 'transferencia') return '';
  if (l.situacao === 'aberto') return `<span class="tag ouro">${l.tipo === 'receita' ? 'A receber' : 'A pagar'}</span>`;
  if (l.situacao === 'atrasado') return '<span class="tag verm">Atrasada</span>';
  if (l.situacao === 'guardar') return '<span class="tag azul">Guardar</span>';
  return '';
}

/** Linha de lançamento usada nas listas. */
export function linhaItem(l, n, { comData = false } = {}) {
  const partes = [];
  if (comData && l.data) partes.push(dataCurta(l.data));
  if (l.tipo === 'transferencia') partes.push(`${n.conta.get(l.conta_origem)?.nome || '?'} → ${destinoTransf(l, n)}`);
  else {
    const cat = l.categoria && n.cat.get(l.categoria)?.nome;
    if (cat) partes.push(cat);
  }
  const cor = l.tipo === 'receita' ? 'verde' : l.tipo === 'transferencia' ? 'azul' : 'verm';
  const tag = tagDe(l);
  return `<button class="item" data-id="${esc(l.id)}">
    <span class="t"><b>${esc(tituloItem(l))}</b><small>${esc(partes.join(' · '))}${tag}</small></span>
    <span class="v ${cor}">${comSinal(l.valor, l.tipo)}</span></button>`;
}
