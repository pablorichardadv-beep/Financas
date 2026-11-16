import { esc } from '../ui.js';
import { reais, dataBR } from '../format.js';
import * as D from '../domain.js';

export default function contas(ctx) {
  const d = ctx.dados;
  const g = D.saldoGeral(d);
  const sc = D.saldosContas(d);
  const sx = D.saldosCaixinhas(d);
  const linha = (nome, valor, sub = '') => `<div class="item"><span class="t"><b>${esc(nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span><span class="v ${valor < 0 ? 'verm' : ''}">${reais(valor)}</span></div>`;
  const grupo = (tipo) => d.contas.filter((c) => c.tipo === tipo);

  const pf = [...grupo('dinheiro'), ...grupo('conta')];
  const pj = grupo('conta_pj');

  const emp = d.emprestimos.map((e) => {
    const emprestado = e.movimentos.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
    const pago = -e.movimentos.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
    const ult = [...e.movimentos].sort((a, b) => b.data.localeCompare(a.data))[0];
    return linha(e.nome, D.saldoEmprestimo(e), `Emprestado ${reais(emprestado)} · recebido ${reais(pago)}${ult ? ` · último em ${dataBR(ult.data)}` : ''}`);
  }).join('');

  const html = `
    <header class="topo"><h1 class="grande">Contas</h1></header>
    <section class="saldo"><div><div class="eyebrow">SALDO GERAL</div><div class="valor">${reais(g.total)}</div></div></section>
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Em contas</h2><b>${reais(g.contas)}</b></div>
      <div class="lista">${pf.map((c) => linha(c.nome, sc[c.id])).join('')}</div></section>
    ${pj.length ? `<section class="card" style="gap:2px"><div class="linha-tit"><h2>Contas PJ</h2><b>${reais(pj.reduce((s, c) => s + sc[c.id], 0))}</b></div>
      <div class="lista">${pj.map((c) => linha(c.nome, sc[c.id])).join('')}</div></section>` : ''}
    <section class="card" style="gap:2px"><div class="linha-tit"><h2>Caixinhas</h2><b>${reais(g.caixinhas)}</b></div>
      <div class="lista">${d.caixinhas.map((c) => linha(c.nome, sx[c.id])).join('')}</div></section>
    ${emp ? `<section class="card" style="gap:2px"><div class="linha-tit"><h2>Empréstimos a receber</h2><b>${reais(g.emprestimo)}</b></div><div class="lista">${emp}</div></section>` : ''}
    <a class="card" href="#/honorarios"><div class="linha-tit"><h2>Honorários a receber</h2><span class="link">Ver ›</span></div></a>
    <p class="nota" style="text-align:center">Saldo de cada conta = saldo inicial + lançamentos pagos. Transferências entre contas não mudam o total.</p>`;
  return { html };
}
