import { esc, icone } from '../ui.js';
import { reais, dataBR, hojeISO, mesNome } from '../format.js';
import * as D from '../domain.js';
import { abrirEditorConta, nomeTipoConta } from './cadastros.js';
import { abrirEditorCaixinha } from './caixinhas.js';
import { abrirEditorEmprestimo, nomeSentido } from './emprestimos.js';
import { abrirEditorCartao } from './cartoes.js';

// grupos do resumo que estão abertos (vale enquanto o app estiver aberto)
const abertos = new Set();

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
    const f = D.faturaDaVezDoCartao(d, c, hoje);
    return `<a class="item" href="#/cartao/${esc(c.id)}"><span class="t"><b>${esc(c.banco)} · ${esc(c.bandeira)}</b><small>final ${esc(c.final)} · fatura ${esc(mesNome(f.mes))} vence ${dataBR(f.vencimento)}${c.arquivado ? ' · arquivado' : ''}</small></span>
      <span class="v ${f.pendente ? 'verm' : ''}">${reais(f.pendente)} <span class="rot">›</span></span></a>`;
  };
  const cartoesAtivos = d.cartoes.filter((c) => !c.arquivado).sort(ordemCartao);
  const cartoesArq = d.cartoes.filter((c) => c.arquivado).sort(ordemCartao);

  const pf = ativas.filter((c) => c.tipo !== 'conta_pj');
  const pj = ativas.filter((c) => c.tipo === 'conta_pj');

  // resumo: cada grupo mostra o total e, ao tocar, o saldo de cada conta dentro dele
  const somaPf = pf.reduce((s, c) => s + (sc[c.id] || 0), 0);
  const somaPj = pj.reduce((s, c) => s + (sc[c.id] || 0), 0);
  const faturasAbertas = cartoesAtivos.reduce((s, c) => s + D.faturaDaVezDoCartao(d, c, hoje).pendente, 0);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const grupos = [
    { id: 'pf', titulo: 'Contas PF', sub: plural(pf.length, 'conta', 'contas'), total: somaPf, corpo: pf.length ? pf.map(linhaConta).join('') : '<p class="vazio">Nenhuma conta. Toque em “+ Nova conta”.</p>', acao: '<button class="link" data-nova-conta>+ Nova conta</button>' },
    ...(pj.length ? [{ id: 'pj', titulo: 'Contas PJ', sub: plural(pj.length, 'conta', 'contas'), total: somaPj, corpo: pj.map(linhaConta).join(''), acao: '' }] : []),
    { id: 'cx', titulo: 'Caixinhas', sub: plural(cxAtivas.length, 'caixinha', 'caixinhas'), total: g.caixinhas, corpo: cxAtivas.length ? cxAtivas.map(linhaCx).join('') : '<p class="vazio">Nenhuma caixinha. Toque em “+ Nova caixinha”.</p>', acao: '<button class="link" data-nova-cx>+ Nova caixinha</button>' },
    { id: 'emp', titulo: 'Empréstimos', sub: plural(empAtivos.length, 'empréstimo', 'empréstimos'), total: g.emprestimo, corpo: empAtivos.length ? empAtivos.map(linhaEmp).join('') : '<p class="vazio">Nenhum empréstimo. Toque em “+ Novo empréstimo”.</p>', acao: '<button class="link" data-novo-emp>+ Novo empréstimo</button>' },
    { id: 'cartao', titulo: 'Cartões de crédito', sub: `${plural(cartoesAtivos.length, 'cartão', 'cartões')} · faturas em aberto`, total: faturasAbertas, fora: true, corpo: cartoesAtivos.length ? cartoesAtivos.map(linhaCartao).join('') : '<p class="vazio">Nenhum cartão. Toque em “+ Novo cartão”.</p>', acao: '<button class="link" data-novo-cartao>+ Novo cartão</button>' },
  ];
  const todosAbertos = grupos.every((x) => abertos.has(x.id));
  const grupoHtml = (x) => {
    const aberto = abertos.has(x.id);
    return `<div class="res-grupo" data-res="${x.id}">
      <button class="res-cab" data-grupo="${x.id}" aria-expanded="${aberto}"><span class="t"><b>${x.titulo}</b><small>${esc(x.sub)}</small></span>
        <b class="${x.fora || x.total < 0 ? 'verm' : ''}">${reais(x.total)}</b><span class="chev rot">›</span></button>
      <div class="res-corpo" ${aberto ? '' : 'hidden'}><div class="lista">${x.corpo}</div><div class="res-acao">${x.acao}</div></div></div>`;
  };

  const html = `
    <header class="topo"><h1 class="grande">Contas</h1><button class="btn-ic" data-nova-conta aria-label="Nova conta">${icone.mais()}</button></header>
    <section class="saldo"><div><div class="eyebrow">RESUMO · SALDO GERAL</div><div class="valor">${reais(g.total)}</div></div>
      <button class="claro" data-expandir>${todosAbertos ? 'Recolher tudo' : 'Ver o saldo de todas as contas'}</button></section>
    <section class="card res-contas" style="gap:0">${grupos.map(grupoHtml).join('')}
      <p class="nota">Cartões mostram o que falta pagar da fatura em aberto; a que vence até o fim do mês já está descontada em “Em aberto” no saldo geral. Toque em um grupo para ver o saldo de cada conta.</p></section>
    ${cartoesArq.length ? `<section class="card" style="gap:2px"><h2>Cartões arquivados</h2><div class="lista">${cartoesArq.map(linhaCartao).join('')}</div></section>` : ''}
    ${arquivadas.length ? `<section class="card" style="gap:2px"><h2>Contas arquivadas</h2><div class="lista">${arquivadas.map(linhaConta).join('')}</div></section>` : ''}
    ${arqOutros.length ? `<section class="card" style="gap:2px"><h2>Caixinhas e empréstimos arquivados</h2><div class="lista">${arqOutros.join('')}</div></section>` : ''}
    <a class="card" href="#/honorarios"><div class="linha-tit"><h2>Honorários a receber</h2><span class="link">Ver ›</span></div></a>
    <p class="nota" style="text-align:center">Toque em uma conta, caixinha ou empréstimo para abrir. Saldo da conta = saldo inicial + lançamentos pagos; transferências entre contas, caixinhas e empréstimos não mudam o total.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelectorAll('[data-nova-conta]').forEach((b) => (b.onclick = () => abrirEditorConta(ctx, null)));
      raiz.querySelector('[data-nova-cx]').onclick = () => abrirEditorCaixinha(ctx, null);
      raiz.querySelector('[data-novo-cartao]').onclick = () => abrirEditorCartao(ctx, null);
      raiz.querySelector('[data-novo-emp]').onclick = () => abrirEditorEmprestimo(ctx, null);
      raiz.querySelectorAll('[data-grupo]').forEach((b) => (b.onclick = () => {
        const id = b.dataset.grupo;
        const abrir = !abertos.has(id);
        abrir ? abertos.add(id) : abertos.delete(id);
        b.setAttribute('aria-expanded', abrir);
        raiz.querySelector(`[data-res="${id}"] .res-corpo`).hidden = !abrir;
        raiz.querySelector('[data-expandir]').textContent = grupos.every((x) => abertos.has(x.id)) ? 'Recolher tudo' : 'Ver o saldo de todas as contas';
      }));
      raiz.querySelector('[data-expandir]').onclick = () => {
        if (grupos.every((x) => abertos.has(x.id))) abertos.clear(); else grupos.forEach((x) => abertos.add(x.id));
        ctx.recarregar();
      };
      raiz.querySelectorAll('[data-conta]').forEach((b) => (b.onclick = () => abrirEditorConta(ctx, b.dataset.conta)));
    },
  };
}
