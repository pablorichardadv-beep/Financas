import { esc, icone } from '../ui.js';
import { reais, dataBR, hojeISO } from '../format.js';
import * as D from '../domain.js';
import { abrirEditorConta, nomeTipoConta } from './cadastros.js';
import { abrirEditorCaixinha } from './caixinhas.js';
import { abrirEditorEmprestimo, nomeSentido } from './emprestimos.js';
import { abrirEditorCartao } from './cartoes.js';

export default function contas(ctx) {
  const d = ctx.dados;
  const g = D.saldoGeral(d);
  const sc = D.saldosContas(d);
  const ativas = d.contas.filter((c) => !c.arquivada);
  const arquivadas = d.contas.filter((c) => c.arquivada);

  const linhaConta = (c) => `<button class="item" data-conta="${esc(c.id)}"><span class="t"><b>${esc(c.nome)}</b><small>${esc(nomeTipoConta(c.tipo))}</small></span>
    <span class="v ${sc[c.id] < 0 ? 'verm' : ''}">${reais(sc[c.id] || 0)} <span class="rot">›</span></span></button>`;
  const ordemCx = (a, b) => a.banco.localeCompare(b.banco, 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR');
  const linhaCx = (c) => {
    const r = D.resumoCaixinha(d, c.id);
    return `<a class="item" href="#/caixinha/${esc(c.id)}"><span class="t"><b>${esc(c.nome)}</b><small>${esc(c.banco)}${r.atualizadoEm ? ` · rendimento em ${dataBR(r.atualizadoEm)}` : ''}</small></span>
      <span class="v ${r.saldo < 0 ? 'verm' : ''}">${reais(r.saldo)} <span class="rot">›</span></span></a>`;
  };
  const linhaEmp = (e) => {
    const r = D.resumoEmprestimo(d, e);
    const tomado = e.sentido === 'tomado';
    return `<a class="item" href="#/emprestimo/${esc(e.id)}"><span class="t"><b>${esc(e.nome)}</b><small>${r.quitado ? 'Quitado' : nomeSentido(e)} · ${tomado ? 'peguei' : 'emprestado'} ${reais(r.principal)} · ${tomado ? 'pago' : 'recebido'} ${reais(r.pago)}${r.ultimo ? ` · último em ${dataBR(r.ultimo)}` : ''}</small></span>
      <span class="v ${r.saldo < 0 ? 'verm' : ''}">${reais(r.saldo)} <span class="rot">›</span></span></a>`;
  };
  const cxAtivas = d.caixinhas.filter((c) => !c.arquivada).sort(ordemCx);
  const empAtivos = d.emprestimos.filter((e) => !e.arquivada);
  const arqOutros = [...d.caixinhas.filter((c) => c.arquivada).sort(ordemCx).map(linhaCx), ...d.emprestimos.filter((e) => e.arquivada).map(linhaEmp)];

  const hoje = hojeISO();
  const ordemCartao = (a, b) => a.banco.localeCompare(b.banco, 'pt-BR') || a.final.localeCompare(b.final);
  const linhaCartao = (c) => {
    const mes = D.faturaAtualDoCartao(d, c, hoje);
    const total = d.compras_cartao.filter((k) => k.cartao === c.id && k.fatura === mes).reduce((s, k) => s + k.valor, 0);
    return `<a class="item" href="#/cartao/${esc(c.id)}"><span class="t"><b>${esc(c.banco)} · ${esc(c.bandeira)}</b><small>final ${esc(c.final)} · vence dia ${c.vencimento}${c.arquivado ? ' · arquivado' : ''}</small></span>
      <span class="v">${reais(total)} <span class="rot">›</span></span></a>`;
  };
  const cartoesAtivos = d.cartoes.filter((c) => !c.arquivado).sort(ordemCartao);
  const cartoesArq = d.cartoes.filter((c) => c.arquivado).sort(ordemCartao);

  const pf = ativas.filter((c) => c.tipo !== 'conta_pj');
  const pj = ativas.filter((c) => c.tipo === 'conta_pj');

  const html = `
    <header class="topo"><h1 class="grande">Contas</h1><button class="btn-ic" data-nova-conta aria-label="Nova conta">${icone.mais()}</button></header>
    <section class="saldo"><div><div class="eyebrow">SALDO GERAL</div><div class="valor">${reais(g.total)}</div></div></section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Em contas</h2><b>${reais(pf.reduce((s, c) => s + (sc[c.id] || 0), 0))}</b></div>
      <div class="lista">${pf.length ? pf.map(linhaConta).join('') : '<p class="vazio">Nenhuma conta. Toque no + para criar.</p>'}</div></section>
    ${pj.length ? `<section class="card" style="gap:2px"><div class="linha-tit"><h2>Contas PJ</h2><b>${reais(pj.reduce((s, c) => s + (sc[c.id] || 0), 0))}</b></div>
      <div class="lista">${pj.map(linhaConta).join('')}</div></section>` : ''}
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Caixinhas</h2><span style="display:flex;align-items:center;gap:14px"><b>${reais(g.caixinhas)}</b><button class="link" data-nova-cx>+ Nova</button></span></div>
      <div class="lista">${cxAtivas.length ? cxAtivas.map(linhaCx).join('') : '<p class="vazio">Nenhuma caixinha. Toque em “+ Nova” para criar.</p>'}</div></section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Empréstimos</h2><span style="display:flex;align-items:center;gap:14px"><b class="${g.emprestimo < 0 ? 'verm' : ''}">${reais(g.emprestimo)}</b><button class="link" data-novo-emp>+ Novo</button></span></div>
      <div class="lista">${empAtivos.length ? empAtivos.map(linhaEmp).join('') : '<p class="vazio">Nenhum empréstimo. Toque em “+ Novo” para criar.</p>'}</div></section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Cartões de crédito</h2><button class="link" data-novo-cartao>+ Novo</button></div>
      <div class="lista">${cartoesAtivos.length ? cartoesAtivos.map(linhaCartao).join('') : '<p class="vazio">Nenhum cartão. Toque em “+ Novo” para cadastrar.</p>'}</div>
      ${cartoesAtivos.length ? '<p class="nota">O valor ao lado é o da fatura em aberto de cada cartão.</p>' : ''}</section>
    ${cartoesArq.length ? `<section class="card" style="gap:2px"><h2>Cartões arquivados</h2><div class="lista">${cartoesArq.map(linhaCartao).join('')}</div></section>` : ''}
    ${arquivadas.length ? `<section class="card" style="gap:2px"><h2>Contas arquivadas</h2><div class="lista">${arquivadas.map(linhaConta).join('')}</div></section>` : ''}
    ${arqOutros.length ? `<section class="card" style="gap:2px"><h2>Caixinhas e empréstimos arquivados</h2><div class="lista">${arqOutros.join('')}</div></section>` : ''}
    <a class="card" href="#/honorarios"><div class="linha-tit"><h2>Honorários a receber</h2><span class="link">Ver ›</span></div></a>
    <p class="nota" style="text-align:center">Toque em uma conta, caixinha ou empréstimo para abrir. Saldo da conta = saldo inicial + lançamentos pagos; transferências entre contas, caixinhas e empréstimos não mudam o total.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-nova-conta]').onclick = () => abrirEditorConta(ctx, null);
      raiz.querySelector('[data-nova-cx]').onclick = () => abrirEditorCaixinha(ctx, null);
      raiz.querySelector('[data-novo-cartao]').onclick = () => abrirEditorCartao(ctx, null);
      raiz.querySelector('[data-novo-emp]').onclick = () => abrirEditorEmprestimo(ctx, null);
      raiz.querySelectorAll('[data-conta]').forEach((b) => (b.onclick = () => abrirEditorConta(ctx, b.dataset.conta)));
    },
  };
}
