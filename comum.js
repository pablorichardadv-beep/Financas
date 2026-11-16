// Peças compartilhadas entre as telas.
import { esc, folha, confirmar } from '../ui.js';
import { badgeCat } from '../visual.js';
import { comSinal, dataCurta, dataBR, reais, num, hojeISO } from '../format.js';
import * as D from '../domain.js';

const mapa = (arr) => new Map(arr.map((x) => [x.id, x]));
export const nomes = (d) => ({ conta: mapa(d.contas), cat: mapa(d.categorias), cx: mapa(d.caixinhas), emp: mapa(d.emprestimos), cartao: mapa(d.cartoes) });

/** Nome de uma ponta da transferência (conta, caixinha ou empréstimo). lado: 'origem' | 'destino'. */
export function nomePonta(l, lado, n) {
  const p = D.ponta(l, lado);
  if (!p) return lado === 'origem' ? '?' : 'Caixinha/outra conta';
  if (p.tipo === 'conta') return n.conta.get(p.id)?.nome || '?';
  if (p.tipo === 'caixinha') return 'Caixinha ' + (n.cx.get(p.id) ? D.rotuloCaixinha(n.cx.get(p.id)) : '');
  return n.emp.get(p.id)?.nome || 'Empréstimo';
}
export const origemTransf = (l, n) => nomePonta(l, 'origem', n);
export const destinoTransf = (l, n) => nomePonta(l, 'destino', n);

export const tituloItem = (l) => l.descricao || (l.tipo === 'transferencia' ? 'Transferência entre contas' : 'Sem descrição');

function tagDe(l) {
  if (l.tipo === 'fatura') return l.data < hojeISO() ? '<span class="tag verm">Atrasada</span>' : '<span class="tag ouro">Em aberto</span>';
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
  if (comData && (l.data || l.data_compra)) partes.push(dataCurta(l.data || l.data_compra));
  if (l.tipo === 'fatura') {
    const c = n.cartao.get(l.cartao_id);
    partes.push(`${c ? `${c.banco} ••${c.final}` : 'Cartão'}`, `vence ${dataBR(l.data).slice(0, 5)}`);
    if (l.fatura_pago > 0) partes.push(`já pago ${reais(l.fatura_pago)}`);
  } else if (l.tipo === 'transferencia') partes.push(`${origemTransf(l, n)} → ${destinoTransf(l, n)}`);
  else {
    const cat = l.categoria && n.cat.get(l.categoria)?.nome;
    if (cat) partes.push(cat);
    if (l.fatura_cartao) partes.push('Pagamento de fatura');
    const cartao = l.tipo === 'cartao' && l.cartao_id && n.cartao.get(l.cartao_id);
    if (cartao) partes.push(`${cartao.banco} ••${cartao.final}`);
    if (l.tipo === 'cartao' && l.recorrencia) partes.push('Recorrente');
  }
  const cor = l.tipo === 'receita' ? 'verde' : l.tipo === 'transferencia' ? 'azul' : 'verm';
  const tag = tagDe(l);
  const emoji = l.tipo === 'fatura' || l.tipo === 'cartao' ? '💳' : l.tipo === 'transferencia' ? '⇄' : null;
  const badge = emoji ? `<span class="cbadge" style="--h:215" aria-hidden="true">${emoji}</span>` : badgeCat(l.categoria ? n.cat.get(l.categoria) : null);
  return `<button class="item" data-id="${esc(l.id)}">${badge}
    <span class="t"><b>${esc(tituloItem(l))}</b><small>${esc(partes.join(' · '))}${tag}</small></span>
    <span class="v ${cor}">${comSinal(l.valor, l.tipo)}</span></button>`;
}

/** Rótulo e sinal de um movimento de caixinha ou de empréstimo (para os históricos). */
export const ROTULO_MOV = {
  saldo_inicial: 'Saldo inicial', aporte: 'Aporte', resgate: 'Resgate', rendimento: 'Rendimento',
  principal: 'Empréstimo', pagamento: 'Pagamento',
};

/** Folha com os detalhes de um movimento e a opção de excluir (leva junto o lançamento ligado, se houver). */
export function abrirMovimento(ctx, tabela, m, rotulo, { fluxo = m.valor } = {}) {
  const d = ctx.dados;
  const f = folha(`
    <div><h2>${esc(rotulo)}</h2><p class="rot"><b>${fluxo < 0 ? '− ' : '+ '}R$ ${num(m.valor)}</b> · ${esc(dataBR(m.data))}</p></div>
    ${m.descricao ? `<div class="card" style="gap:0;padding:6px 16px"><div class="item"><span class="rot">Descrição</span><b style="font-size:14.5px">${esc(m.descricao)}</b></div></div>` : ''}
    ${m.lancamento_id ? '<p class="nota">Este movimento também está nos seus lançamentos (saiu ou entrou em uma conta). Ao excluir, o lançamento é excluído junto e o saldo da conta volta ao que era.</p>' : ''}
    <button class="btn perigo" data-excluir>Excluir</button>
    <button class="btn sec" data-fechar>Fechar</button>`);
  f.el.querySelector('[data-fechar]').onclick = f.fechar;
  f.el.querySelector('[data-excluir]').onclick = async () => {
    f.fechar();
    if (!(await confirmar('Excluir este movimento?', m.lancamento_id ? 'O lançamento ligado a ele também será excluído.' : 'Não dá para desfazer.', 'Excluir', true))) return;
    await ctx.gravar(D.opsExcluirMovimento(d, tabela, m));
    ctx.aviso('Movimento excluído');
  };
}
