// Folha de detalhes de um lançamento: marcar como paga, editar, excluir.
import { esc, folha, confirmar } from '../ui.js';
import { reais, dataBR, hojeISO } from '../format.js';
import { estaPago, estaAberto, contasAtivas } from '../domain.js';
import { nomes, destinoTransf, tituloItem } from './comum.js';

const SITUACAO = { pago: 'Paga', aberto: 'Em aberto', atrasado: 'Atrasada', guardar: 'Guardar', cartao: 'Compra no cartão' };

export function abrirDetalhe(ctx, id) {
  const d = ctx.dados;
  const n = nomes(d);
  const ehCartao = id.startsWith('k');
  let l;
  if (ehCartao) {
    const k = d.compras_cartao.find((x) => x.id === id);
    if (!k) return;
    l = { ...k, tipo: 'cartao', situacao: 'cartao', mes: k.fatura };
  } else {
    l = d.lancamentos.find((x) => x.id === id);
    if (!l) return;
  }
  const linhas = [];
  if (l.data) linhas.push(['Data', dataBR(l.data)]);
  if (l.tipo === 'transferencia') {
    linhas.push(['Saiu de', n.conta.get(l.conta_origem)?.nome || '—'], ['Entrou em', destinoTransf(l, n)]);
  } else if (l.tipo !== 'cartao') {
    linhas.push([l.tipo === 'receita' ? 'Entrou em' : 'Saiu de', l.conta ? n.conta.get(l.conta)?.nome : 'Ainda não definida']);
  }
  if (l.categoria) linhas.push(['Categoria', n.cat.get(l.categoria)?.nome || '—']);
  if (l.tipo === 'cartao') linhas.push(['Fatura', l.mes]);
  if (l.tipo !== 'transferencia') linhas.push(['Situação', SITUACAO[l.situacao] || l.situacao]);
  const podePagar = !ehCartao && l.tipo !== 'transferencia' && !estaPago(l) && (estaAberto(l) || l.situacao === 'guardar');

  const f = folha(`
    <div><h2>${esc(tituloItem(l))}</h2><p class="rot">${esc(l.tipo === 'receita' ? 'Receita' : l.tipo === 'transferencia' ? 'Transferência' : l.tipo === 'cartao' ? 'Cartão de crédito' : 'Despesa')} · <b>${reais(l.valor)}</b></p></div>
    <div class="card" style="gap:0;padding:6px 16px">${linhas.map(([a, b]) => `<div class="item"><span class="rot">${esc(a)}</span><b style="font-size:14.5px">${esc(b)}</b></div>`).join('')}</div>
    ${podePagar ? `<button class="btn" data-pagar>${l.tipo === 'receita' ? 'Marcar como recebida' : 'Marcar como paga'}</button>` : ''}
    <button class="btn sec" data-editar>Editar</button>
    <button class="btn perigo" data-excluir>Excluir</button>`);

  f.el.querySelector('[data-editar]').onclick = () => { f.fechar(); ctx.ir('novo/' + id); };

  f.el.querySelector('[data-excluir]').onclick = async () => {
    f.fechar();
    if (!(await confirmar('Excluir lançamento?', `“${tituloItem(l)}” será removido. Isso muda os saldos.`, 'Excluir', true))) return;
    const ops = [['del', ehCartao ? 'compras_cartao' : 'lancamentos', id]];
    for (const m of d.caixinha_movimentos) if (m.lancamento_id === id) ops.push(['del', 'caixinha_movimentos', m.id]);
    await ctx.gravar(ops);
    ctx.aviso('Lançamento excluído');
  };

  const bp = f.el.querySelector('[data-pagar]');
  if (bp) bp.onclick = () => {
    f.fechar();
    const ativas = contasAtivas(d, l.conta);
    const sug = ativas.find((c) => c.id === l.conta) || ativas.find((c) => c.id === 'itau') || ativas[0];
    const g = folha(`
      <h2>${l.tipo === 'receita' ? 'Receber em qual conta?' : 'Pagar com qual conta?'}</h2>
      <div class="campo sel"><label for="pc">Conta</label><select id="pc">${ativas.map((c) => `<option value="${esc(c.id)}" ${c.id === sug?.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="pd">Data</label><input id="pd" type="date" value="${hojeISO()}"></div>
      <button class="btn" data-ok>Confirmar</button>`);
    g.el.querySelector('[data-ok]').onclick = async () => {
      const novo = { ...l, situacao: 'pago', conta: g.el.querySelector('#pc').value, data: g.el.querySelector('#pd').value || hojeISO() };
      delete novo.mes; delete novo.status_codigo;
      g.fechar();
      await ctx.gravar([['put', 'lancamentos', novo]]);
      ctx.aviso(l.tipo === 'receita' ? 'Marcada como recebida' : 'Marcada como paga');
    };
  };
}
