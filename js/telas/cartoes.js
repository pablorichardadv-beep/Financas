// Cartões de crédito: tela do cartão (faturas e compras) e cadastro. Rota: #/cartao/<id>
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, hojeISO, dataBR, mesNome, norm, novoId } from '../format.js';
import * as D from '../domain.js';
import { nomes, linhaItem } from './comum.js';
import { abrirDetalhe } from './detalhe.js';
import { prepararNovo } from './novo.js';
import { ajuda, ligarAjudas } from '../visual.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let mesEscolhido = null;   // mês da fatura aberta na tela (vale enquanto o app estiver aberto)
let cartaoDoMes = null;

/** Abre a tela do cartão já na fatura indicada (usado pela linha da fatura em Lançamentos). */
export const mostrarFatura = (cartaoId, mes) => { mesEscolhido = mes; cartaoDoMes = cartaoId; };

export default function cartao(ctx, args) {
  const d = ctx.dados;
  const c = d.cartoes.find((x) => x.id === args[0]);
  if (!c) {
    return { html: '<header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Cartão</h1></div></header><p class="vazio">Cartão não encontrado.</p>' };
  }
  const hoje = hojeISO();
  const faturas = D.faturasDoCartao(d, c);
  const atual = D.faturaAtualDoCartao(d, c, hoje);
  const daVez = D.faturaDaVezDoCartao(d, c, hoje).mes;     // a mais antiga ainda em aberto (ou a atual)
  if (cartaoDoMes !== c.id) { mesEscolhido = null; cartaoDoMes = c.id; }
  const meses = [...new Set([atual, daVez, ...faturas.map((f) => f.mes)])].sort().reverse();
  if (!mesEscolhido || !meses.includes(mesEscolhido)) mesEscolhido = daVez;
  const f = faturas.find((x) => x.mes === mesEscolhido) || { mes: mesEscolhido, compras: [], total: 0, ...D.datasDaFatura(c, mesEscolhido) };
  const n = nomes(d);
  const emAberto = f.fechamento >= hoje;
  const sit = D.situacaoFatura(d, c, mesEscolhido);
  const SITUACAO_TXT = { aberta: 'Em aberto', parcial: 'Paga em parte', paga: 'Paga', antiga: 'Anterior ao controle', vazia: 'Sem compras' };
  const prog = D.progressoFatura(c, mesEscolhido, hoje);
  const diasTxt = sit.status === 'paga' ? 'Fatura paga' : sit.status === 'antiga' || sit.status === 'vazia' ? '' : prog.diasParaVencer > 1 ? `Vence em ${prog.diasParaVencer} dias` : prog.diasParaVencer === 1 ? 'Vence amanhã' : prog.diasParaVencer === 0 ? 'Vence hoje' : `Venceu há ${-prog.diasParaVencer} ${prog.diasParaVencer === -1 ? 'dia' : 'dias'}`;
  const barraCiclo = prog.diasParaFechar >= 0 || prog.pct < 1 ? `<div class="ciclo"><div class="b" role="img" aria-label="${Math.round(prog.pct * 100)}% do ciclo até o fechamento"><i style="width:${Math.round(prog.pct * 100)}%"></i></div><small>${prog.diasParaFechar > 0 ? `Fecha em ${prog.diasParaFechar} ${prog.diasParaFechar === 1 ? 'dia' : 'dias'}` : prog.diasParaFechar === 0 ? 'Fecha hoje' : 'Fatura fechada'}</small></div>` : '';
  const recs = d.recorrencias.filter((r) => r.cartao === c.id && r.ativa);

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">${esc(c.banco)}</h1></div><button class="link" data-editar>Editar</button></header>
    <p class="nota" style="margin-top:-6px">${esc(c.bandeira)} · final ${esc(c.final)} · vence dia ${c.vencimento} · fecha dia ${c.fechamento}${c.arquivado ? ' · arquivado' : ''}</p>
    <div class="filtros"><label class="pilula on">Fatura de ${esc(mesNome(mesEscolhido))}<select data-mes aria-label="Fatura">${meses.map((m) => `<option value="${m}" ${m === mesEscolhido ? 'selected' : ''}>${esc(mesNome(m))}</option>`).join('')}</select></label></div>
    <section class="saldo" aria-label="Fatura">
      <div><div class="eyebrow">FATURA ${esc(mesNome(mesEscolhido).toUpperCase())} ${ajuda('fatura')}</div><div class="valor">${reais(f.total)}</div>${diasTxt ? `<span class="dias-venc ${prog.diasParaVencer < 0 && sit.pendente > 0 ? 'atraso' : ''}" data-dias>${diasTxt}</span>` : ''}</div>
      ${sit.status === 'antiga' || sit.status === 'vazia' ? '' : barraCiclo}
      <div class="grade">
        <div><span>Vencimento</span><span>${dataBR(f.vencimento)}</span></div>
        <div><span>${emAberto ? 'Fecha em' : 'Fechou em'}</span><span>${dataBR(f.fechamento)}</span></div>
        <div><span>Situação</span><span data-situacao>${SITUACAO_TXT[sit.status]}</span></div>
        <div><span>${sit.pago ? 'Falta pagar' : 'A pagar'}</span><span>${reais(sit.pendente)}</span></div>
      </div>
    </section>
    ${sit.pendente > 0 ? `<button class="btn" data-pagar>Pagar fatura · ${reais(sit.pendente)}</button>` : ''}
    <div class="dois-btn"><button class="btn ${sit.pendente > 0 ? 'sec' : ''}" data-compra>+ Compra neste cartão</button><button class="btn sec" data-estorno>+ Estorno</button></div>
    ${sit.pagamentos.length ? `<section class="card" style="gap:2px"><h2>Pagamentos desta fatura</h2><div class="lista">${sit.pagamentos.map((l) => linhaItem(l, n, { comData: true })).join('')}</div>
      <p class="nota">Toque em um pagamento para excluir. A fatura volta a ficar em aberto.</p></section>` : ''}
    ${sit.status === 'antiga' ? '<p class="nota">Esta fatura é anterior ao controle de pagamento do app: ela não entra em “a pagar” nem nos lançamentos em aberto.</p>' : ''}
    <section class="card" style="gap:2px"><h2>Compras da fatura</h2>
      <div class="lista">${f.compras.length ? f.compras.map((k) => linhaItem({ id: k.id, tipo: 'cartao', data: null, data_compra: k.data, mes: k.fatura, descricao: k.descricao, valor: k.valor, categoria: k.categoria, situacao: 'cartao', cartao_id: null }, n, { comData: true })).join('') : '<p class="vazio">Nenhuma compra nesta fatura. Toque em <b>+ Compra neste cartão</b> para lançar a primeira.</p>'}</div></section>
    ${recs.length ? `<section class="card" style="gap:2px"><h2>Compras recorrentes</h2>
      <div class="lista">${recs.map((r) => `<button class="item" data-rec="${esc(r.id)}"><span class="t"><b>${esc(r.descricao)}</b><small>todo dia ${r.dia}${n.cat.get(r.categoria) ? ' · ' + esc(n.cat.get(r.categoria).nome) : ''}</small></span><span class="v verm">${reais(r.valor)} <span class="rot">›</span></span></button>`).join('')}</div>
      <p class="nota">Cai todo mês na fatura até você cancelar. Toque para mudar o valor ou cancelar.</p></section>` : ''}
    <p class="nota" style="text-align:center">Compras feitas até o dia ${c.fechamento} entram na fatura que vence no mesmo mês ou no seguinte, conforme o seu vencimento. Elas saem da conta quando você toca em “Pagar fatura”.</p>`;

  return {
    html,
    montar(raiz) {
      ligarAjudas(raiz);
      raiz.querySelector('[data-editar]').onclick = () => abrirEditorCartao(ctx, c.id);
      raiz.querySelector('[data-mes]').addEventListener('change', (e) => { mesEscolhido = e.target.value; ctx.recarregar(); });
      raiz.querySelector('[data-pagar]')?.addEventListener('click', () => abrirPagarFatura(ctx, c, sit));
      raiz.querySelector('[data-compra]').onclick = () => { prepararNovo({ cartao: true, cartao_id: c.id, voltar: { rota: 'cartao/' + c.id, aoSalvar: (mes) => { mesEscolhido = mes; cartaoDoMes = c.id; } } }); ctx.ir('novo'); };
      raiz.querySelector('[data-estorno]').onclick = () => abrirEstornoAvulso(ctx, c, (mes) => { mesEscolhido = mes; cartaoDoMes = c.id; });
      raiz.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => abrirRecorrencia(ctx, b.dataset.rec)));
      raiz.querySelectorAll('.item[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
    },
  };
}

// ---------------------------------------------------------------- cadastro
// semRender: grava sem redesenhar a tela (usado dentro do formulário de lançamento, para não perder o que foi digitado)
export function abrirEditorCartao(ctx, id = null, { aoSalvar, semRender = false } = {}) {
  const d = ctx.dados;
  const c = id ? d.cartoes.find((x) => x.id === id) : null;
  if (id && !c) return;
  const rem = c ? D.remocaoCartao(d, id) : null;
  const bancos = [...new Set([...d.cartoes.map((x) => x.banco), ...d.caixinhas.map((x) => x.banco).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  let acoes = '';
  if (c?.arquivado) {
    acoes = '<button class="btn sec" data-reativar>Reativar cartão</button>';
  } else if (c && rem.acao === 'excluir') {
    acoes = '<p class="nota">Este cartão ainda não tem compras. Você pode excluí-lo.</p><button class="btn perigo" data-excluir>Excluir cartão</button>';
  } else if (c) {
    acoes = `<p class="nota">Este cartão tem ${plural(rem.compras, 'compra', 'compras')} lançadas, por isso não pode ser apagado. Arquivando, ele some dos formulários e o histórico continua.</p><button class="btn perigo" data-arquivar>Arquivar cartão</button>`;
  }

  const f = folha(`
    <h2>${c ? 'Editar cartão' : 'Novo cartão'}${c?.arquivado ? ' (arquivado)' : ''}</h2>
    <div class="campo"><label for="cb">Banco</label><input id="cb" maxlength="30" autocomplete="off" autocapitalize="words" placeholder="Ex.: Nubank" value="${esc(c?.banco || '')}"></div>
    ${bancos.length ? `<div class="chips" role="group" aria-label="Bancos">${bancos.map((b) => `<button class="chip" data-banco="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
    <div class="dois">
      <div class="campo sel"><label for="cg">Bandeira</label><select id="cg"><option value="">Escolher…</option>${D.BANDEIRAS.map((b) => `<option value="${esc(b)}" ${c?.bandeira === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
      <div class="campo"><label for="cf">4 últimos dígitos</label><input id="cf" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="1234" value="${esc(c?.final || '')}"></div></div>
    <div class="dois">
      <div class="campo"><label for="cv">Dia do vencimento</label><input id="cv" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 10" value="${c?.vencimento || ''}"></div>
      <div class="campo"><label for="cx">Dia do fechamento</label><input id="cx" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 3" value="${c?.fechamento || ''}"></div></div>
    <p class="nota" id="cdica">O fechamento define em qual fatura cada compra entra. Se você não souber, deixe o sugerido (7 dias antes do vencimento) e confira no app do banco.</p>
    <div class="erro" id="ce" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Cadastrar cartão'}</button>
    ${acoes}`);
  const q = (s) => f.el.querySelector(s);

  // o fechamento acompanha o vencimento até você digitar um valor próprio
  let fechamentoManual = Boolean(c);
  q('#cx').addEventListener('input', () => { fechamentoManual = true; });
  q('#cv').addEventListener('input', () => {
    const v = Number.parseInt(q('#cv').value, 10);
    if (!fechamentoManual && v >= 1 && v <= 31) q('#cx').value = D.fechamentoSugerido(v);
  });
  q('#cf').addEventListener('input', () => { q('#cf').value = q('#cf').value.replace(/\D/g, '').slice(0, 4); });
  f.el.querySelectorAll('[data-banco]').forEach((b) => (b.onclick = () => { q('#cb').value = b.dataset.banco; }));

  const ler = () => ({ id, banco: q('#cb').value, bandeira: q('#cg').value, final: q('#cf').value, vencimento: Number.parseInt(q('#cv').value, 10), fechamento: Number.parseInt(q('#cx').value, 10) });
  q('[data-salvar]').onclick = async () => {
    const v = D.validarCartao(d, ler());
    if (v.erro) { q('#ce').textContent = v.erro; return; }
    f.fechar();
    if (c) {
      await ctx.gravar([['put', 'cartoes', { ...c, ...v.ok }]]);
      ctx.aviso('Cartão atualizado');
      aoSalvar?.(c.id);
      return;
    }
    const novo = { id: D.idUnicoCartao(d, v.ok.banco, v.ok.final), ...v.ok, controle_desde: D.faturaDaCompra(v.ok, hojeISO()).fatura };
    if (semRender) { await ctx.DB.lote([['put', 'cartoes', novo]]); ctx.dados.cartoes.push(novo); } else await ctx.gravar([['put', 'cartoes', novo]]);
    ctx.aviso('Cartão cadastrado');
    aoSalvar?.(novo.id);
  };

  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'cartoes', { ...c, arquivado: true }]]);
    ctx.aviso('Cartão arquivado');
  });
  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    const { arquivado, ...resto } = c;
    await ctx.gravar([['put', 'cartoes', resto]]);
    ctx.aviso('Cartão reativado');
  });
  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Excluir o cartão ${D.rotuloCartao(c)}?`, 'Não dá para desfazer.', 'Excluir', true))) return;
    ctx.ir('contas');
    await ctx.gravar([['del', 'cartoes', id]]);
    ctx.aviso('Cartão excluído');
  });
}

// ---------------------------------------------------------------- compra recorrente: mudar valor ou cancelar
export function abrirRecorrencia(ctx, id) {
  const d = ctx.dados;
  const r = d.recorrencias.find((x) => x.id === id);
  const c = r && d.cartoes.find((x) => x.id === r.cartao);
  if (!r || !c) return;
  const hoje = hojeISO();
  const futuras = d.compras_cartao.filter((k) => k.recorrencia === r.id && k.data > hoje);
  const f = folha(`
    <div><h2>${esc(r.descricao)}</h2><p class="rot">${esc(D.rotuloCartao(c))} · todo dia ${r.dia} · desde ${esc(dataBR(r.inicio))}${r.ativa ? '' : ' · cancelada'}</p></div>
    ${r.ativa ? `<div class="campo"><label for="rv">Valor de cada mês</label><input id="rv" inputmode="numeric" autocomplete="off" aria-label="Valor mensal em reais"></div>
      <div class="erro" id="re" role="alert"></div>
      <button class="btn" data-salvar>Salvar novo valor</button>
      <p class="nota">O novo valor vale a partir das próximas cobranças (${plural(futuras.length, 'cobrança já lançada', 'cobranças já lançadas')} nas faturas futuras). As anteriores não mudam.</p>
      <button class="btn perigo" data-cancelar>Cancelar recorrência</button>` : '<p class="nota">Esta compra recorrente foi cancelada.</p>'}
    <button class="btn sec" data-fechar>Fechar</button>`);
  const q = (s) => f.el.querySelector(s);
  q('[data-fechar]').onclick = f.fechar;
  if (!r.ativa) return;
  const valor = ligarCampoValor(q('#rv'), r.valor, undefined, { substituir: true });
  q('[data-salvar]').onclick = async () => {
    if (!(valor.obter() > 0)) { q('#re').textContent = 'Informe o valor.'; return; }
    f.fechar();
    await ctx.gravar(D.opsValorRecorrencia(d, r, valor.obter(), hoje));
    ctx.aviso('Valor atualizado');
  };
  q('[data-cancelar]').onclick = async () => {
    f.fechar();
    if (!(await confirmar(`Cancelar “${r.descricao}”?`, `Para de cair todo mês. ${plural(futuras.length, 'cobrança futura sai', 'cobranças futuras saem')} das faturas; o que já foi lançado até hoje continua.`, 'Cancelar recorrência', true))) return;
    await ctx.gravar(D.opsCancelarRecorrencia(d, r, hoje));
    ctx.aviso('Recorrência cancelada');
  };
}

// ---------------------------------------------------------------- pagar a fatura
/** Baixa a fatura: lança a despesa na conta escolhida, ligada ao cartão e ao mês. Aceita pagamento parcial. */
export function abrirPagarFatura(ctx, c, sit) {
  const d = ctx.dados;
  const ativas = D.contasAtivas(d);
  const sug = D.ultimaContaUsada(d, 'despesa') || ativas[0]?.id || '';
  const anterior = d.lancamentos.filter((l) => l.fatura_cartao === c.id && l.categoria).pop();
  const fixas = d.categorias.find((x) => x.tipo === 'despesa' && !x.arquivada && /^fixas?$/.test(norm(x.nome)));
  const cat = anterior?.categoria || fixas?.id || '';
  const cats = d.categorias.filter((x) => x.tipo === 'despesa' && (!x.arquivada || x.id === cat));
  const f = folha(`
    <h2>Pagar fatura de ${esc(mesNome(sit.mes))}</h2>
    <p class="rot">${esc(D.rotuloCartao(c))} · vence em ${dataBR(sit.vencimento)}</p>
    <div class="card" style="gap:0;padding:6px 16px">
      <div class="item"><span class="rot">Total da fatura</span><b style="font-size:14.5px">${reais(sit.total)}</b></div>
      ${sit.pago ? `<div class="item"><span class="rot">Já pago</span><b style="font-size:14.5px">${reais(sit.pago)}</b></div>` : ''}
      <div class="item"><span class="rot">Falta pagar</span><b style="font-size:14.5px">${reais(sit.pendente)}</b></div></div>
    <div class="campo"><label for="fv">Valor que está pagando</label><input id="fv" inputmode="numeric" autocomplete="off" aria-label="Valor pago da fatura em reais"></div>
    <div class="campo sel"><label for="fc">Sai de qual conta</label><select id="fc">${ativas.map((a) => `<option value="${esc(a.id)}" ${a.id === sug ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label for="fd">Data do pagamento</label><input id="fd" type="date" value="${hojeISO()}"></div>
    <div class="campo sel"><label for="fk">Categoria do pagamento</label><select id="fk"><option value="">Sem categoria</option>${cats.map((x) => `<option value="${esc(x.id)}" ${x.id === cat ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
    <p class="nota">O valor sai da conta e a fatura é baixada. Se pagar menos que o total, o resto continua em aberto. As compras seguem aparecendo nas categorias do mês, então esse pagamento não duplica nada.</p>
    <div class="erro" id="fe" role="alert"></div>
    <button class="btn" data-ok>Confirmar pagamento</button>`);
  const q = (s) => f.el.querySelector(s);
  const valor = ligarCampoValor(q('#fv'), sit.pendente, undefined, { substituir: true });
  q('[data-ok]').onclick = async () => {
    const v = valor.obter();
    if (!(v > 0)) { q('#fe').textContent = 'Informe o valor do pagamento.'; return; }
    if (v > sit.pendente) { q('#fe').textContent = `O valor é maior que o que falta pagar (${reais(sit.pendente)}).`; return; }
    if (!q('#fd').value) { q('#fe').textContent = 'Informe a data.'; return; }
    if (!q('#fc').value) { q('#fe').textContent = 'Escolha a conta.'; return; }
    f.fechar();
    await ctx.gravar([['put', 'lancamentos', {
      id: novoId('l'), tipo: 'despesa', data: q('#fd').value, descricao: `Fatura ${c.banco} ${c.bandeira} ••${c.final} (${mesNome(sit.mes)})`, valor: v,
      conta: q('#fc').value, categoria: q('#fk').value || null, situacao: 'pago', fatura_cartao: c.id, fatura_mes: sit.mes,
    }]]);
    ctx.aviso(v === sit.pendente ? 'Fatura paga' : 'Pagamento lançado');
  };
}

/** Estorno de algo que não está lançado (ex.: compra cobrada numa fatura anterior ao app). */
export function abrirEstornoAvulso(ctx, c, aoSalvar) {
  const d = ctx.dados;
  const cats = d.categorias.filter((x) => x.tipo === 'despesa' && !x.arquivada).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const g = folha(`
    <h2>Estorno no cartão</h2>
    <p class="nota">Use quando o banco devolveu um valor de uma compra que não está no app (por exemplo, cobrada numa fatura anterior). Se a compra está no app, toque nela e use “Estornar compra”.</p>
    <div class="campo"><label for="xd">Descrição</label><input id="xd" placeholder="Ex.: Magazine Luiza" autocomplete="off" autocapitalize="sentences"></div>
    <div class="campo"><label for="xv">Valor estornado</label><input id="xv" inputmode="numeric" autocomplete="off"></div>
    <div class="campo"><label for="xt">Data do estorno</label><input id="xt" type="date" value="${hojeISO()}"></div>
    <div class="campo sel"><label for="xc">Categoria (opcional)</label><select id="xc"><option value="">Sem categoria</option>${cats.map((x) => `<option value="${esc(x.id)}">${esc(x.nome)}</option>`).join('')}</select></div>
    <p class="nota">Se escolher a categoria, o gasto dela no mês diminui junto com a fatura.</p>
    <p class="nota" id="xonde"></p>
    <div class="erro" id="xe" role="alert"></div>
    <button class="btn" data-ok>Lançar estorno</button>`);
  const q = (s) => g.el.querySelector(s);
  const valor = ligarCampoValor(q('#xv'), 0, undefined, { substituir: true });
  const onde = () => { const v = q('#xt').value; if (!v) { q('#xonde').textContent = ''; return; } const m = D.faturaDaCompra(c, v).fatura; q('#xonde').textContent = `O crédito entra na fatura de ${mesNome(m)} (vence ${dataBR(D.datasDaFatura(c, m).vencimento)}).`; };
  q('#xt').addEventListener('change', onde); onde();
  q('[data-ok]').onclick = async () => {
    const r = D.opsEstornoAvulso(d, c, { descricao: q('#xd').value, valor: valor.obter(), data: q('#xt').value, categoria: q('#xc').value || null });
    if (r.erro) { q('#xe').textContent = r.erro; return; }
    g.fechar();
    aoSalvar?.(r.ops[0][2].fatura);
    await ctx.gravar(r.ops);
    ctx.aviso('Estorno lançado na fatura');
  };
}
