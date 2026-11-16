import { esc, icone } from '../ui.js';
import { reais, dataBR } from '../format.js';
import * as D from '../domain.js';
import { abrirEditorConta, nomeTipoConta } from './cadastros.js';

export default function contas(ctx) {
  const d = ctx.dados;
  const g = D.saldoGeral(d);
  const sc = D.saldosContas(d);
  const sx = D.saldosCaixinhas(d);
  const ativas = d.contas.filter((c) => !c.arquivada);
  const arquivadas = d.contas.filter((c) => c.arquivada);

  const linhaConta = (c) => `<button class="item" data-conta="${esc(c.id)}"><span class="t"><b>${esc(c.nome)}</b><small>${esc(nomeTipoConta(c.tipo))}</small></span>
    <span class="v ${sc[c.id] < 0 ? 'verm' : ''}">${reais(sc[c.id] || 0)} <span class="rot">›</span></span></button>`;
  const linha = (nome, valor, sub = '') => `<div class="item"><span class="t"><b>${esc(nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="v ${valor < 0 ? 'verm' : ''}">${reais(valor)}</span></div>`;

  const pf = ativas.filter((c) => c.tipo !== 'conta_pj');
  const pj = ativas.filter((c) => c.tipo === 'conta_pj');

  const emp = d.emprestimos.map((e) => {
    const emprestado = e.movimentos.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
    const pago = -e.movimentos.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
    const ult = [...e.movimentos].sort((a, b) => b.data.localeCompare(a.data))[0];
    return linha(e.nome, D.saldoEmprestimo(e), `Emprestado ${reais(emprestado)} · recebido ${reais(pago)}${ult ? ` · último em ${dataBR(ult.data)}` : ''}`);
  }).join('');

  const html = `
    <header class="topo"><h1 class="grande">Contas</h1><button class="btn-ic" data-nova-conta aria-label="Nova conta">${icone.mais()}</button></header>
    <section class="saldo"><div><div class="eyebrow">SALDO GERAL</div><div class="valor">${reais(g.total)}</div></div></section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Em contas</h2><b>${reais(pf.reduce((s, c) => s + (sc[c.id] || 0), 0))}</b></div>
      <div class="lista">${pf.length ? pf.map(linhaConta).join('') : '<p class="vazio">Nenhuma conta. Toque no + para criar.</p>'}</div></section>
    ${pj.length ? `<section class="card" style="gap:2px"><div class="linha-tit"><h2>Contas PJ</h2><b>${reais(pj.reduce((s, c) => s + (sc[c.id] || 0), 0))}</b></div>
      <div class="lista">${pj.map(linhaConta).join('')}</div></section>` : ''}
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Caixinhas</h2><b>${reais(g.caixinhas)}</b></div>
      <div class="lista">${d.caixinhas.map((c) => linha(c.nome, sx[c.id])).join('')}</div></section>
    ${emp ? `<section class="card" style="gap:2px"><div class="linha-tit"><h2>Empréstimos a receber</h2><b>${reais(g.emprestimo)}</b></div><div class="lista">${emp}</div></section>` : ''}
    ${arquivadas.length ? `<section class="card" style="gap:2px"><h2>Contas arquivadas</h2><div class="lista">${arquivadas.map(linhaConta).join('')}</div></section>` : ''}
    <a class="card" href="#/honorarios"><div class="linha-tit"><h2>Honorários a receber</h2><span class="link">Ver ›</span></div></a>
    <p class="nota" style="text-align:center">Toque em uma conta para renomear, mudar o saldo inicial, arquivar ou excluir. Saldo = saldo inicial + lançamentos pagos; transferências entre contas não mudam o total.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-nova-conta]').onclick = () => abrirEditorConta(ctx, null);
      raiz.querySelectorAll('[data-conta]').forEach((b) => (b.onclick = () => abrirEditorConta(ctx, b.dataset.conta)));
    },
  };
}
