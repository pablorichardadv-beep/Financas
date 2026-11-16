// Folha de detalhes de um lançamento: marcar como paga, editar, excluir.
import { esc, folha, confirmar } from '../ui.js';
import { reais, dataBR, hojeISO, mesNome } from '../format.js';
import * as D from '../domain.js';
import { abrirRecorrencia, mostrarFatura } from './cartoes.js';
import { estaPago, estaAberto, contasAtivas, ligadaAEmprestimo, ligadaAHonorario, opsAoExcluirLancamento } from '../domain.js';
import { nomes, origemTransf, destinoTransf, tituloItem } from './comum.js';

const SITUACAO = { pago: 'Paga', aberto: 'Em aberto', atrasado: 'Atrasada', guardar: 'Guardar', cartao: 'Compra no cartão' };

export function abrirDetalhe(ctx, id) {
  const d = ctx.dados;
  const n = nomes(d);
  if (id.startsWith('f:')) {                    // linha da fatura do cartão: abre o cartão naquela fatura (lá fica o botão "Pagar fatura")
    const [, cartaoId, mes] = id.split(':');
    mostrarFatura(cartaoId, mes);
    ctx.ir('cartao/' + cartaoId);
    return;
  }
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
    linhas.push(['Saiu de', origemTransf(l, n)], ['Entrou em', destinoTransf(l, n)]);
  } else if (l.tipo !== 'cartao') {
    linhas.push([l.tipo === 'receita' ? 'Entrou em' : 'Saiu de', l.conta ? n.conta.get(l.conta)?.nome : 'Ainda não definida']);
  }
  if (l.categoria) linhas.push(['Categoria', n.cat.get(l.categoria)?.nome || '—']);
  if (l.tipo === 'cartao') {
    const c = d.cartoes.find((x) => x.id === l.cartao);
    const dc = linhas.find((x) => x[0] === 'Data');
    if (dc) dc[0] = 'Data da compra';
    if (l.parcela) linhas.push(['Parcela', `${l.parcela} de ${l.parcelas}`]);
    if (l.recorrencia) linhas.push(['Recorrência', d.recorrencias.find((x) => x.id === l.recorrencia)?.ativa ? 'Todo mês' : 'Cancelada']);
    linhas.unshift(['Cartão', c ? D.rotuloCartao(c) : 'Sem cartão (compra antiga)']);
    linhas.push(['Fatura', c ? `${mesNome(l.mes)} · vence em ${dataBR(D.datasDaFatura(c, l.mes).vencimento)}` : mesNome(l.mes)]);
  }
  if (l.tipo !== 'transferencia') linhas.push(['Situação', SITUACAO[l.situacao] || l.situacao]);
  const recAtiva = ehCartao && l.recorrencia && d.recorrencias.find((x) => x.id === l.recorrencia && x.ativa);
  const irmas = ehCartao && l.grupo ? d.compras_cartao.filter((x) => x.grupo === l.grupo) : [];
  const doEmprestimo = l.tipo === 'transferencia' && ligadaAEmprestimo(l);
  const doHonorario = ligadaAHonorario(l);
  const daFatura = D.ehPagamentoFatura(l);
  const parcelaPrevista = !ehCartao && l.tipo === 'receita' ? D.parcelaDoLancamento(d, l) : null;
  const podePagar = !ehCartao && l.tipo !== 'transferencia' && !estaPago(l) && (estaAberto(l) || l.situacao === 'guardar');

  const f = folha(`
    <div><h2>${esc(tituloItem(l))}</h2><p class="rot">${esc(l.tipo === 'receita' ? 'Receita' : l.tipo === 'transferencia' ? 'Transferência' : l.tipo === 'cartao' ? 'Cartão de crédito' : 'Despesa')} · <b>${reais(l.valor)}</b></p></div>
    <div class="card" style="gap:0;padding:6px 16px">${linhas.map(([a, b]) => `<div class="item"><span class="rot">${esc(a)}</span><b style="font-size:14.5px">${esc(b)}</b></div>`).join('')}</div>
    ${podePagar ? `<button class="btn" data-pagar>${l.tipo === 'receita' ? 'Marcar como recebida' : 'Marcar como paga'}</button>` : ''}
    ${daFatura ? '<p class="nota">Este lançamento é o pagamento de uma fatura de cartão. Se você excluir, a fatura volta a ficar em aberto e o saldo da conta volta ao que era.</p>' : parcelaPrevista ? '<p class="nota">Este valor é uma parcela de honorário. Ao marcar como recebida, a parcela também é baixada.</p><button class="btn sec" data-editar>Editar</button>' : doHonorario ? '<p class="nota">Este lançamento é o recebimento de um honorário. Para corrigir, abra o honorário em Contas e desfaça o recebimento. Se você excluir este lançamento, a parcela volta para “a receber”.</p>' : doEmprestimo ? '<p class="nota">Este lançamento faz parte de um empréstimo. Para corrigir, exclua-o e registre de novo pela tela do empréstimo.</p>' : '<button class="btn sec" data-editar>Editar</button>'}
    <button class="btn perigo" data-excluir>${irmas.length > 1 ? 'Excluir só esta parcela' : 'Excluir'}</button>
    ${recAtiva ? '<button class="btn sec" data-recorrencia>Mudar valor ou cancelar a recorrência</button>' : ''}
    ${irmas.length > 1 ? `<button class="btn perigo" data-excluir-todas>Excluir as ${irmas.length} parcelas da compra</button>` : ''}`);

  const be = f.el.querySelector('[data-editar]');
  if (be) be.onclick = () => { f.fechar(); ctx.ir('novo/' + id); };

  f.el.querySelector('[data-excluir]').onclick = async () => {
    f.fechar();
    if (!(await confirmar('Excluir lançamento?', `“${tituloItem(l)}” será removido. Isso muda os saldos.`, 'Excluir', true))) return;
    const ops = [['del', ehCartao ? 'compras_cartao' : 'lancamentos', id]];
    for (const m of d.caixinha_movimentos) if (m.lancamento_id === id) ops.push(['del', 'caixinha_movimentos', m.id]);
    for (const m of d.emprestimo_movimentos) if (m.lancamento_id === id) ops.push(['del', 'emprestimo_movimentos', m.id]);
    // excluir só uma cobrança recorrente: o mês fica de fora, para o app não recriar
    if (recAtiva && l.data) ops.push(['put', 'recorrencias', { ...recAtiva, pulados: [...(recAtiva.pulados || []), l.data.slice(0, 7)] }]);
    if (!ehCartao) ops.push(...opsAoExcluirLancamento(d, l));
    await ctx.gravar(ops);
    ctx.aviso('Lançamento excluído');
  };

  f.el.querySelector('[data-recorrencia]')?.addEventListener('click', () => { f.fechar(); abrirRecorrencia(ctx, l.recorrencia); });
  f.el.querySelector('[data-excluir-todas]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar('Excluir a compra inteira?', `As ${irmas.length} parcelas de “${(l.descricao || '').replace(/ \(\d+\/\d+\)$/, '')}” serão removidas das faturas. Isso muda os totais.`, 'Excluir tudo', true))) return;
    await ctx.gravar(irmas.map((x) => ['del', 'compras_cartao', x.id]));
    ctx.aviso('Compra parcelada excluída');
  });

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
      const contrato = parcelaPrevista && d.contratos.find((x) => x.id === parcelaPrevista.contrato);
      await ctx.gravar(contrato
        ? D.opsReceberParcela(d, { ...parcelaPrevista, valor: l.valor }, contrato, { conta: novo.conta, data: novo.data, categoria: l.categoria })
        : [['put', 'lancamentos', novo]]);
      ctx.aviso(l.tipo === 'receita' ? 'Marcada como recebida' : 'Marcada como paga');
    };
  };
}
