import { esc } from '../ui.js';
import { reais, hojeISO, mesLongo } from '../format.js';
import * as D from '../domain.js';
import { ajuda, ligarAjudas } from '../visual.js';

export default function projecao(ctx) {
  const d = ctx.dados;
  const hoje = hojeISO();
  const meses = D.projecaoMeses(d, hoje, 6);
  const inicial = D.totalContas(d);
  const max = Math.max(1, ...meses.map((m) => Math.abs(m.saldoFinal)), Math.abs(inicial));
  const html = `
    <header class="topo"><div><a class="link" href="#/mes">‹ Mês</a><h1 class="grande">Projeção ${ajuda('projecao')}</h1></div></header>
    <section class="card"><span class="rot">Saldo em contas hoje</span><b class="num grande-num">${reais(inicial)}</b>
      <p class="nota">Estimativa de como você chega em cada mês, usando só o que já está lançado como “a receber” e “a pagar”, as parcelas de honorários e as faturas de cartão.</p></section>
    ${meses.map((m) => `<section class="card proj" data-proj="${m.mes}">
      <div class="linha-tit"><h2>${esc(mesLongo(m.mes))}</h2><b class="${m.saldoFinal < 0 ? 'verm' : 'azul'}">${reais(m.saldoFinal)}</b></div>
      <div class="b"><i class="${m.saldoFinal < 0 ? 'estourou' : ''}" style="width:${Math.max(2, Math.round((Math.abs(m.saldoFinal) / max) * 100))}%"></i></div>
      <div class="tres"><div><span class="rot">Entra</span><b class="verde">+ ${reais(m.entradas)}</b></div><div><span class="rot">Sai</span><b class="verm">− ${reais(m.saidas)}</b></div><div><span class="rot">Sobra no mês</span><b class="${m.saldoMes < 0 ? 'verm' : 'azul'}">${reais(m.saldoMes)}</b></div></div>
    </section>`).join('')}
    <a class="btn sec" href="#/copiar" style="text-align:center">Copiar contas a pagar do mês anterior</a>
    <p class="nota" style="text-align:center">Gastos do dia a dia que você ainda não lançou não aparecem aqui. Quanto mais completo o “a pagar”, mais fiel a projeção.</p>`;
  return { html, montar(raiz) { ligarAjudas(raiz); } };
}
