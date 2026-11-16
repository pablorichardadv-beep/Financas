// Honorários: tela do contrato (cliente, total, parcelas), criar/editar/excluir contrato e parcelas, receber parcela.
// Rota: #/honorario/<id>
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, num, dataBR, hojeISO, novoId } from '../format.js';
import * as D from '../domain.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataOuTraco = (iso) => (iso ? dataBR(iso) : 'sem data');

function tagParcela(p, hoje) {
  if (p.status === 'pago') return `<span class="tag verde">Recebida${p.pago_em ? ' em ' + dataBR(p.pago_em).slice(0, 5) : ''}</span>`;
  if (p.status === 'calote') return '<span class="tag verm">Calote</span>';
  if (p.vencimento && p.vencimento < hoje) return '<span class="tag verm">Atrasada</span>';
  return '<span class="tag ouro">A receber</span>';
}

// ---------------------------------------------------------------- tela do contrato
export default function contrato(ctx, args) {
  const d = ctx.dados;
  const c = d.contratos.find((x) => x.id === args[0]);
  if (!c) {
    return { html: '<header class="topo"><div><a class="link" href="#/honorarios">‹ Honorários</a><h1 class="grande">Honorário</h1></div></header><p class="vazio">Honorário não encontrado.</p>' };
  }
  const hoje = hojeISO();
  const r = D.resumoContrato(d, c, hoje);
  const pct = r.soma ? Math.max(0, Math.min(100, Math.round((r.recebido / r.soma) * 100))) : 0;

  const linha = (p) => `<button class="item" data-p="${esc(p.id)}"><span class="t"><b>Parcela ${esc(D.rotuloParcela(p, c))} · ${esc(dataOuTraco(p.vencimento))}</b><small>${tagParcela(p, hoje)}</small></span>
    <span class="v">${reais(p.valor)} <span class="rot">›</span></span></button>`;

  const html = `
    <header class="topo"><div><a class="link" href="#/honorarios">‹ Honorários</a><h1 class="grande">${esc(c.cliente)}</h1></div><button class="link" data-editar>Editar</button></header>
    ${c.descricao ? `<p class="nota" style="margin-top:-6px">${esc(c.descricao)}${c.parceria ? ' · parceria: ' + esc(c.parceria) : ''}</p>` : ''}
    <section class="saldo" aria-label="Resumo do honorário">
      <div><div class="eyebrow">A RECEBER${r.situacao === 'quitado' ? ' · QUITADO' : ''}</div><div class="valor">${reais(r.aReceber)}</div></div>
      <div class="grade">
        <div><span>Total do honorário</span><span>${reais(c.total)}</span></div>
        <div><span>Já recebido</span><span>${reais(r.recebido)}</span></div>
        ${r.atrasado ? `<div><span>Atrasado</span><span>${reais(r.atrasado)}</span></div>` : ''}
        ${r.calote ? `<div><span>Calote</span><span>${reais(r.calote)}</span></div>` : ''}
      </div>
      <div><div class="barra" role="img" aria-label="${pct}% recebido"><i style="width:${pct}%;background:#fff"></i><i style="width:${100 - pct}%;background:rgba(255,255,255,.25)"></i></div></div>
    </section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Parcelas</h2><button class="link" data-nova-parcela>+ Parcela</button></div>
      <div class="lista">${r.parcelas.length ? r.parcelas.map(linha).join('') : '<p class="vazio">Nenhuma parcela ainda. Toque em <b>“+ Parcela”</b> para informar o valor e o vencimento de cada uma.</p>'}</div></section>
    ${r.soma !== c.total ? `<p class="nota" style="text-align:center">As parcelas somam <b>${reais(r.soma)}</b> e o total do honorário é <b>${reais(c.total)}</b>. Se for de propósito (entrada, juros), tudo bem.</p>` : ''}
    <p class="nota" style="text-align:center">Toque em uma parcela para mudar o valor ou o vencimento, marcar como recebida ou como calote. Ao receber, o app lança a receita na conta escolhida.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-editar]').onclick = () => abrirEditorContrato(ctx, c.id);
      raiz.querySelector('[data-nova-parcela]').onclick = () => abrirNovaParcela(ctx, c);
      raiz.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => abrirParcela(ctx, b.dataset.p)));
    },
  };
}

// ---------------------------------------------------------------- criar / editar contrato
export function abrirEditorContrato(ctx, id = null) {
  const d = ctx.dados;
  const c = id ? d.contratos.find((x) => x.id === id) : null;
  if (id && !c) return;
  const clientes = D.clientesConhecidos(d);
  const nRecebidas = c ? d.honorarios.filter((p) => p.contrato === id && p.status === 'pago').length : 0;
  const nParcelas = c ? d.honorarios.filter((p) => p.contrato === id).length : 0;

  const f = folha(`
    <h2>${c ? 'Editar honorário' : 'Novo honorário'}</h2>
    <div class="campo"><label for="hc">Cliente</label><input id="hc" list="hclientes" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="Nome do cliente" value="${esc(c?.cliente || '')}"><datalist id="hclientes">${clientes.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
    <div class="campo"><label for="hd">Descrição (opcional)</label><input id="hd" maxlength="60" autocomplete="off" autocapitalize="sentences" placeholder="Ex.: Ação revisional" value="${esc(c?.descricao || '')}"></div>
    <div class="campo"><label for="ht">Valor total do honorário</label><input id="ht" inputmode="numeric" autocomplete="off" aria-label="Valor total em reais"></div>
    ${c ? '' : `<div class="dois">
        <div class="campo"><label for="hn">Nº de parcelas</label><input id="hn" type="number" inputmode="numeric" min="1" max="120" value="1"></div>
        <div class="campo"><label for="hp">Valor de cada parcela</label><input id="hp" inputmode="numeric" autocomplete="off" aria-label="Valor de cada parcela em reais"></div></div>
      <div class="campo"><label for="hv">Vencimento da 1ª parcela</label><input id="hv" type="date" value="${hojeISO()}"></div>
      <p class="nota" id="hr" aria-live="polite"></p>`}
    <div class="erro" id="he" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Criar honorário'}</button>
    ${c ? `<p class="nota">Este honorário tem ${plural(nParcelas, 'parcela', 'parcelas')}${nRecebidas ? `, ${plural(nRecebidas, 'recebida', 'recebidas')}` : ''}. Para mudar valores e vencimentos, abra cada parcela.</p>
      <button class="btn perigo" data-excluir>Excluir honorário</button>` : ''}`);
  const q = (s) => f.el.querySelector(s);

  let manual = false;
  let prog = false;
  const qtd = () => Number.parseInt(q('#hn')?.value, 10);
  const atualizar = () => {
    if (c) return;
    if (!manual && total.obter() > 0 && qtd() >= 1) {
      prog = true; parcela.definir(Math.floor(total.obter() / qtd())); prog = false;
    }
    const n = qtd();
    const venc = q('#hv').value;
    if (!(n >= 1 && total.obter() > 0)) { q('#hr').textContent = 'Informe o total e o número de parcelas. O valor de cada parcela é calculado, mas você pode trocá-lo.'; return; }
    const ps = D.gerarParcelas({ total: total.obter(), qtd: Math.min(n, 120), valorParcela: manual ? parcela.obter() : 0, primeiroVenc: venc || null });
    const soma = ps.reduce((s, p) => s + p.valor, 0);
    q('#hr').innerHTML = `${plural(ps.length, 'parcela', 'parcelas')} de ${reais(ps[0].valor)}${ps.length > 1 && ps[ps.length - 1].valor !== ps[0].valor ? ` (a última de ${reais(ps[ps.length - 1].valor)})` : ''}${venc ? `, de ${dataBR(ps[0].vencimento)} a ${dataBR(ps[ps.length - 1].vencimento)}` : ''}.
      ${soma !== total.obter() ? `<br><b>As parcelas somam ${reais(soma)}</b>, diferente do total. Você pode ajustar cada parcela depois.` : ''}`;
  };
  const total = ligarCampoValor(q('#ht'), c?.total || 0, atualizar);
  const parcela = c ? null : ligarCampoValor(q('#hp'), 0, () => { if (!prog) { manual = true; atualizar(); } }, { substituir: true });
  q('#hn')?.addEventListener('input', atualizar);
  q('#hv')?.addEventListener('change', atualizar);
  atualizar();

  q('[data-salvar]').onclick = async () => {
    const cliente = q('#hc').value.trim();
    const descricao = q('#hd').value.trim();
    if (c) {
      const v = D.validarEdicaoContrato({ cliente, total: total.obter() });
      if (v.erro) { q('#he').textContent = v.erro; return; }
      f.fechar();
      await ctx.gravar([['put', 'contratos', { ...c, cliente, descricao, total: total.obter() }]]);
      ctx.aviso('Honorário atualizado');
      return;
    }
    const n = qtd();
    const v = D.validarNovoContrato({ cliente, total: total.obter(), qtd: n, valorParcela: parcela.obter(), primeiroVenc: q('#hv').value });
    if (v.erro) { q('#he').textContent = v.erro; return; }
    const novo = { id: novoId('t'), cliente, descricao, total: total.obter(), qtd: n };
    const ps = D.gerarParcelas({ total: total.obter(), qtd: n, valorParcela: manual ? parcela.obter() : 0, primeiroVenc: q('#hv').value });
    f.fechar();
    await ctx.gravar([['put', 'contratos', novo], ...ps.map((p) => ['put', 'honorarios', { id: novoId('h'), contrato: novo.id, numero: p.numero, valor: p.valor, vencimento: p.vencimento, status: 'aberto' }])]);
    ctx.aviso('Honorário criado');
    ctx.ir('honorario/' + novo.id);
  };

  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    const txt = `As ${plural(nParcelas, 'parcela', 'parcelas')} deste honorário serão apagadas.${nRecebidas ? ' Os recebimentos já lançados nas suas contas continuam lá.' : ''} Não dá para desfazer.`;
    if (!(await confirmar(`Excluir o honorário de ${c.cliente}?`, txt, 'Excluir', true))) return;
    ctx.ir('honorarios');
    await ctx.gravar(D.opsExcluirContrato(d, id));
    ctx.aviso('Honorário excluído');
  });
}

// ---------------------------------------------------------------- nova parcela em contrato existente
export function abrirNovaParcela(ctx, c) {
  const d = ctx.dados;
  const ps = d.honorarios.filter((p) => p.contrato === c.id).sort((a, b) => a.numero - b.numero);
  const ultima = ps[ps.length - 1];
  const f = folha(`
    <h2>Nova parcela · ${esc(c.cliente)}</h2>
    <div class="campo"><label for="np">Valor da parcela</label><input id="np" inputmode="numeric" autocomplete="off" aria-label="Valor da parcela em reais"></div>
    <div class="campo"><label for="nv">Vencimento</label><input id="nv" type="date" value="${ultima?.vencimento ? D.somarMeses(ultima.vencimento, 1) : hojeISO()}"></div>
    <div class="erro" id="ne" role="alert"></div>
    <button class="btn" data-ok>Adicionar parcela</button>`);
  const q = (s) => f.el.querySelector(s);
  const valor = ligarCampoValor(q('#np'), ultima?.valor || 0, undefined, { substituir: true });
  q('[data-ok]').onclick = async () => {
    const v = D.validarParcela({ valor: valor.obter() });
    if (v.erro) { q('#ne').textContent = v.erro; return; }
    const numero = (ultima?.numero || 0) + 1;
    const ops = [['put', 'honorarios', { id: novoId('h'), contrato: c.id, numero, valor: valor.obter(), vencimento: q('#nv').value || null, status: 'aberto' }]];
    if ((c.qtd || 0) < numero) ops.push(['put', 'contratos', { ...c, qtd: numero }]);
    f.fechar();
    await ctx.gravar(ops);
    ctx.aviso('Parcela adicionada');
  };
}

// ---------------------------------------------------------------- parcela: editar, receber, calote, excluir
export function abrirParcela(ctx, id) {
  const d = ctx.dados;
  const p = d.honorarios.find((x) => x.id === id);
  const c = p && d.contratos.find((x) => x.id === p.contrato);
  if (!p || !c) return;
  const hoje = hojeISO();
  const recebida = p.status === 'pago';

  const corpo = recebida
    ? `<div class="card" style="gap:0;padding:6px 16px">
        <div class="item"><span class="rot">Valor</span><b style="font-size:14.5px">${reais(p.valor)}</b></div>
        <div class="item"><span class="rot">Vencimento</span><b style="font-size:14.5px">${esc(dataOuTraco(p.vencimento))}</b></div>
        <div class="item"><span class="rot">Recebida em</span><b style="font-size:14.5px">${esc(p.pago_em ? dataBR(p.pago_em) : '—')}</b></div>
        <div class="item"><span class="rot">Conta</span><b style="font-size:14.5px">${esc(d.contas.find((a) => a.id === p.conta)?.nome || '—')}</b></div></div>
      <p class="nota">Esta parcela já foi lançada como receita. Para mudar valor ou data, desfaça o recebimento primeiro.</p>
      <button class="btn sec" data-desfazer>Desfazer recebimento</button>`
    : `<div class="campo"><label for="pv">Valor da parcela</label><input id="pv" inputmode="numeric" autocomplete="off" aria-label="Valor da parcela em reais"></div>
      <div class="campo"><label for="pd">Vencimento</label><input id="pd" type="date" value="${esc(p.vencimento || '')}"></div>
      <div class="erro" id="pe" role="alert"></div>
      ${D.lancamentoPrevisto(d, p) ? '<p class="nota">Esta parcela está ligada a um lançamento “a receber”. Ao receber, ele é baixado (nada é lançado em dobro); mudar valor ou data aqui muda o lançamento também.</p>' : ''}
      <button class="btn sec" data-salvar>Salvar alterações</button>
      <button class="btn" data-receber>Marcar como recebida</button>
      <button class="btn sec" data-status>${p.status === 'calote' ? 'Reabrir (voltar para a receber)' : 'Marcar como calote'}</button>`;

  const f = folha(`
    <div><h2>Parcela ${esc(D.rotuloParcela(p, c))} · ${esc(c.cliente)}</h2><p class="rot">${tagParcela(p, hoje)} · ${reais(p.valor)}</p></div>
    ${corpo}
    <button class="btn perigo" data-excluir>Excluir parcela</button>`);
  const q = (s) => f.el.querySelector(s);
  const valor = recebida ? null : ligarCampoValor(q('#pv'), p.valor, undefined, { substituir: true });

  q('[data-salvar]')?.addEventListener('click', async () => {
    const v = D.validarParcela({ valor: valor.obter() });
    if (v.erro) { q('#pe').textContent = v.erro; return; }
    f.fechar();
    await ctx.gravar(D.opsEditarParcela(d, p, { valor: valor.obter(), vencimento: q('#pd').value || null }));
    ctx.aviso('Parcela atualizada');
  });
  q('[data-receber]')?.addEventListener('click', () => { f.fechar(); abrirReceber(ctx, p, c); });
  q('[data-status]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'honorarios', { ...p, status: p.status === 'calote' ? 'aberto' : 'calote' }]]);
    ctx.aviso(p.status === 'calote' ? 'Parcela reaberta' : 'Marcada como calote');
  });
  q('[data-desfazer]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar('Desfazer o recebimento?', D.lancamentoPrevisto(d, { lanc_previsto: p.lanc_previsto }) || (p.lanc_previsto && p.lanc_previsto === p.lancamento_id) ? `A receita de ${reais(p.valor)} volta para “a receber” e o saldo da conta volta ao que era. A parcela volta para “a receber”.` : `A receita de ${reais(p.valor)} é apagada dos lançamentos e o saldo da conta volta ao que era. A parcela volta para “a receber”.`, 'Desfazer', true))) return;
    await ctx.gravar(D.opsDesfazerRecebimento(p, d));
    ctx.aviso('Recebimento desfeito');
  });
  q('[data-excluir]').onclick = async () => {
    f.fechar();
    const txt = recebida ? 'A receita já lançada nas suas contas continua lá. Para apagá-la também, desfaça o recebimento antes.' : 'Não dá para desfazer.';
    if (!(await confirmar(`Excluir a parcela ${D.rotuloParcela(p, c)}?`, txt, 'Excluir', true))) return;
    await ctx.gravar([['del', 'honorarios', p.id]]);
    ctx.aviso('Parcela excluída');
  };
}

// ---------------------------------------------------------------- receber uma parcela
export function abrirReceber(ctx, p, c) {
  const d = ctx.dados;
  const ativas = D.contasAtivas(d);
  const sug = D.ultimaContaUsada(d, 'receita') || ativas[0]?.id || '';
  const cat = D.categoriaHonorarios(d);
  const cats = d.categorias.filter((x) => x.tipo === 'receita' && (!x.arquivada || x.id === cat));
  const f = folha(`
    <h2>Receber parcela ${esc(D.rotuloParcela(p, c))}</h2>
    <p class="rot">${esc(c.cliente)} · <b>${reais(p.valor)}</b></p>
    <div class="campo sel"><label for="rc">Entrou na conta</label><select id="rc">${ativas.map((a) => `<option value="${esc(a.id)}" ${a.id === sug ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label for="rd">Data do recebimento</label><input id="rd" type="date" value="${hojeISO()}"></div>
    <div class="campo sel"><label for="rk">Categoria</label><select id="rk">${cats.map((x) => `<option value="${esc(x.id)}" ${x.id === cat ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div>
    <p class="nota">${D.lancamentoPrevisto(d, p) ? `O lançamento “a receber” desta parcela (${reais(p.valor)}) é baixado nessa conta, sem criar outro.` : `O app lança uma receita de ${reais(p.valor)} nessa conta.`} Se o cliente pagou outro valor, cancele e ajuste o valor da parcela antes.</p>
    <div class="erro" id="re" role="alert"></div>
    <button class="btn" data-ok>Confirmar recebimento</button>`);
  const q = (s) => f.el.querySelector(s);
  q('[data-ok]').onclick = async () => {
    const data = q('#rd').value;
    if (!data) { q('#re').textContent = 'Informe a data.'; return; }
    if (!q('#rc').value) { q('#re').textContent = 'Escolha a conta.'; return; }
    f.fechar();
    await ctx.gravar(D.opsReceberParcela(d, p, c, { conta: q('#rc').value, data, categoria: q('#rk').value || null }));
    ctx.aviso('Recebimento lançado');
  };
}
