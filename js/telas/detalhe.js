// Folha de detalhes de um lançamento: marcar como paga, editar, excluir.
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, dataBR, hojeISO, mesNome } from '../format.js';
import * as D from '../domain.js';
import { abrirRecorrencia, mostrarFatura } from './cartoes.js';
import { estaPago, estaAberto, contasAtivas, ligadaAEmprestimo, ligadaAHonorario, opsAoExcluirLancamento } from '../domain.js';
import { nomes, origemTransf, destinoTransf, tituloItem } from './comum.js';
import { prepararNovo } from './novo.js';

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
    if (l.valor < 0 && !l.estorno_de) linhas.push(['Estorno', 'Avulso (compra não lançada no app)']);
    if (l.valor < 0 && l.estorno_de) { const orig = d.compras_cartao.find((x) => x.id === l.estorno_de); linhas.push(['Estorno de', orig ? `${orig.descricao} (${reais(orig.valor)})` : 'Compra excluída']); }
    for (const e of D.estornosDe(d, l.id)) linhas.push(['Estornado', `${reais(-e.valor)} em ${dataBR(e.data)}`]);
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

  const estorno = ehCartao && l.valor < 0;
  const podeEstornar = ehCartao && !estorno && l.cartao;
  const podeRepetir = !estorno && !daFatura && !doHonorario && !doEmprestimo && l.tipo !== 'transferencia' && !(ehCartao && (l.grupo || l.recorrencia)) && !l.legado;
  const f = folha(`
    <div><h2>${esc(tituloItem(l))}</h2><p class="rot">${esc(l.tipo === 'receita' ? 'Receita' : l.tipo === 'transferencia' ? 'Transferência' : estorno ? 'Estorno no cartão (crédito na fatura)' : l.tipo === 'cartao' ? 'Cartão de crédito' : 'Despesa')} · <b>${reais(Math.abs(l.valor))}</b></p></div>
    <div class="card" style="gap:0;padding:6px 16px">${linhas.map(([a, b]) => `<div class="item"><span class="rot">${esc(a)}</span><b style="font-size:14.5px">${esc(b)}</b></div>`).join('')}</div>
    ${podePagar ? `<button class="btn" data-pagar>${l.tipo === 'receita' ? 'Marcar como recebida' : 'Marcar como paga'}</button>` : ''}
    ${daFatura ? '<p class="nota">Este lançamento é o pagamento de uma fatura de cartão. Se você excluir, a fatura volta a ficar em aberto e o saldo da conta volta ao que era.</p>' : parcelaPrevista ? '<p class="nota">Este valor é uma parcela de honorário. Ao marcar como recebida, a parcela também é baixada.</p><button class="btn sec" data-editar>Editar</button>' : doHonorario ? '<p class="nota">Este lançamento é o recebimento de um honorário. Para corrigir, abra o honorário em Contas e desfaça o recebimento. Se você excluir este lançamento, a parcela volta para “a receber”.</p>' : doEmprestimo ? '<p class="nota">Este lançamento faz parte de um empréstimo. Para corrigir, exclua-o e registre de novo pela tela do empréstimo.</p>' : '<button class="btn sec" data-editar>Editar</button>'}
    ${podeEstornar ? '<button class="btn sec" data-estornar>Estornar compra</button>' : ''}
    ${podeRepetir ? '<button class="btn sec" data-repetir>Repetir este lançamento</button>' : ''}
    <button class="btn perigo" data-excluir>${irmas.length > 1 ? 'Excluir só esta parcela' : 'Excluir'}</button>
    ${recAtiva ? '<button class="btn sec" data-recorrencia>Mudar valor ou cancelar a recorrência</button>' : ''}
    ${irmas.length > 1 ? `<button class="btn perigo" data-excluir-todas>Excluir as ${irmas.length} parcelas da compra</button>` : ''}`);

  f.el.querySelector('[data-repetir]')?.addEventListener('click', () => {
    f.fechar();
    prepararNovo({
      manter: true, tipo: ehCartao ? 'despesa' : l.tipo, valor: l.valor, descricao: (l.descricao || '').replace(/ \(\d+\/\d+\)$/, ''),
      data: hojeISO(), conta: ehCartao ? undefined : l.conta || undefined, categoria: l.categoria || null, situacao: 'pago', cartao: ehCartao, cartao_id: ehCartao ? l.cartao || null : null,
      catManual: true, contaManual: true,
    });
    ctx.ir('novo');
  });
  f.el.querySelector('[data-estornar]')?.addEventListener('click', () => { f.fechar(); abrirEstorno(ctx, d.compras_cartao.find((x) => x.id === id)); });
  const be = f.el.querySelector('[data-editar]');
  if (be && estorno) be.remove();   // estorno não se edita: exclua e estorne de novo
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

/** Estornar uma compra do cartão: valor (total ou parcial), data do estorno e, se for parcelada, cancelar as parcelas que ainda não vieram. */
export function abrirEstorno(ctx, k) {
  const d = ctx.dados;
  if (!k) return;
  const ja = D.estornosDe(d, k.id).reduce((s, e) => s - e.valor, 0);
  const g = folha(`
    <h2>Estornar compra</h2>
    <p class="nota"><b>${esc(k.descricao || 'Compra')}</b> · ${reais(k.valor)}${ja ? ` · já estornado ${reais(ja)}` : ''}</p>
    <div class="campo"><label for="ev">Valor estornado</label><input id="ev" inputmode="numeric" autocomplete="off"></div>
    <div class="campo"><label for="ed">Data do estorno</label><input id="ed" type="date" value="${hojeISO()}"></div>
    <label class="imp-top" id="efw" hidden><input type="checkbox" id="ef" checked><span class="t"><b id="eft"></b><small>Se o banco cancelou a compra inteira, as parcelas que ainda não vieram saem das próximas faturas.</small></span></label>
    <p class="nota" id="eonde"></p>
    <div class="erro" id="ee" role="alert"></div>
    <button class="btn" data-ok>Estornar</button>`);
  const q = (s) => g.el.querySelector(s);
  const campo = ligarCampoValor(q('#ev'), Math.max(0, k.valor - ja), undefined, { substituir: true });
  const atualizar = () => {
    const data = q('#ed').value;
    const c = d.cartoes.find((x) => x.id === k.cartao);
    const fut = data ? D.parcelasFuturas(d, k, data) : [];
    q('#efw').hidden = !fut.length;
    if (fut.length) q('#eft').textContent = `Cancelar as próximas ${fut.length} ${fut.length === 1 ? 'parcela' : 'parcelas'} (${reais(fut.reduce((s, x) => s + x.valor, 0))})`;
    q('#eonde').textContent = c && data ? `O crédito entra na fatura de ${mesNome(D.faturaDaCompra(c, data).fatura)} (vence ${dataBR(D.datasDaFatura(c, D.faturaDaCompra(c, data).fatura).vencimento)}) e diminui o valor dela.` : '';
  };
  q('#ed').addEventListener('change', atualizar);
  atualizar();
  q('[data-ok]').onclick = async () => {
    const r = D.opsEstornarCompra(d, k, { valor: campo.obter(), data: q('#ed').value, cancelarFuturas: !q('#efw').hidden && q('#ef').checked });
    if (r.erro) { q('#ee').textContent = r.erro; return; }
    g.fechar();
    await ctx.gravar(r.ops);
    ctx.aviso(r.canceladas ? `Estorno lançado e ${r.canceladas} ${r.canceladas === 1 ? 'parcela cancelada' : 'parcelas canceladas'}` : 'Estorno lançado na fatura');
  };
}
