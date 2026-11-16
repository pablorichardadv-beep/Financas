import { esc } from '../ui.js';
import { reais, mesAtual, mesNome, dataBR } from '../format.js';
import * as D from '../domain.js';
import { badgeCat, corCat, rosca, barrasMeses, ajuda, ligarAjudas } from '../visual.js';

let mesEscolhido = null;
const cor = (v) => (v < 0 ? 'verm' : 'verde');

export default function mes(ctx) {
  const d = ctx.dados;
  const meses = D.mesesDisponiveis(d, mesAtual());
  mesEscolhido ||= mesAtual();
  if (!meses.includes(mesEscolhido)) mesEscolhido = meses[0];
  const r = D.resumoMes(d, mesEscolhido);
  const cats = D.despesasPorCategoria(d, mesEscolhido);
  const fatura = D.faturaCartao(d, mesEscolhido);
  const faturas = D.faturasDoMes(d, mesEscolhido);
  const maior = cats[0]?.valor || 1;
  const catPorId = new Map(d.categorias.map((c) => [c.id, c]));
  const metas = D.metasDoMes(d, mesEscolhido);
  const serie = D.serieMeses(d, mesEscolhido, 6);
  const fatias = cats.filter((c) => c.valor > 0).map((c) => ({ valor: c.valor, cor: corCat(catPorId.get(c.id)) }));
  const totalDesp = cats.reduce((s, c) => s + c.valor, 0);

  const html = `
    <header class="topo"><h1 class="grande">Mês</h1></header>
    <div class="filtros"><label class="pilula on">${esc(mesNome(mesEscolhido))}<select data-mes aria-label="Mês">${meses.map((m) => `<option value="${m}" ${m === mesEscolhido ? 'selected' : ''}>${esc(mesNome(m))}</option>`).join('')}</select></label></div>
    <section class="card resumo" aria-label="Resumo do mês">
      <div class="bloco" data-bloco="receitas"><h2>Receitas</h2>
        <div class="lin"><span>Recebidas</span><b class="verde">${reais(r.recebido)}</b></div>
        <div class="lin"><span>Previstas</span><b class="verde">${reais(r.aReceber)}</b></div>
        <div class="lin tot"><span>Total</span><b class="verde">${reais(r.receitas)}</b></div></div>
      <div class="bloco" data-bloco="despesas"><h2>Despesas</h2>
        <div class="lin"><span>Pagas</span><b class="verm">${reais(r.pagas)}</b></div>
        <div class="lin"><span>Previstas</span><b class="verm">${reais(r.aPagar)}</b></div>
        <div class="lin tot"><span>Total</span><b class="verm">${reais(r.despesas)}</b></div></div>
      <div class="bloco" data-bloco="saldo"><h2>Saldo</h2>
        <div class="lin"><span>Previsto</span><b class="${cor(r.saldoPrevisto)}">${reais(r.saldoPrevisto)}</b></div>
        <div class="lin"><span>Efetuado</span><b class="${cor(r.saldoEfetuado)}">${reais(r.saldoEfetuado)}</b></div>
        <div class="lin tot"><span>Total</span><b class="${cor(r.saldo)}">${reais(r.saldo)}</b></div></div>
      <p class="nota">Previsto = ainda vai entrar ou sair (lançamentos “a receber” e “a pagar”). Efetuado = recebido menos pago. Faturas de cartão ainda não pagas entram como despesa prevista; ao pagar a fatura, viram despesa paga. ${ajuda('previstas')}</p>
    </section>
    <section class="card" aria-label="Despesas por categoria">
      <h2>Despesas por categoria</h2>
      ${fatias.length ? `<div class="rosca-wrap">${rosca(fatias, reais(totalDesp).replace('R$ ', ''))}<div class="rosca-leg">${cats.slice(0, 5).map((c) => `<span><i style="background:${corCat(catPorId.get(c.id))}"></i>${esc(c.nome)}</span>`).join('')}${cats.length > 5 ? `<span class="rot">+ ${cats.length - 5} categorias</span>` : ''}</div></div>` : ''}
      <div>${cats.length ? cats.map((c) => `<div class="cat-linha"><div class="r"><span class="cnome">${badgeCat(catPorId.get(c.id))}${esc(c.nome)}</span><span>${reais(c.valor)}</span></div>
        <div class="b"><i style="width:${Math.max(2, Math.round((c.valor / maior) * 100))}%;background:${corCat(catPorId.get(c.id))}"></i></div><small>${(c.pct * 100).toFixed(1).replace('.', ',')}% das despesas</small></div>`).join('') : '<p class="vazio">Sem despesas neste mês. Quando você lançar uma despesa, ela aparece aqui por categoria.</p>'}</div>
    </section>
    <section class="card" aria-label="Metas do mês">
      <div class="linha-tit"><h2>Metas do mês</h2>${ajuda('meta')}</div>
      ${metas.length ? metas.map((m) => `<div class="meta-linha" data-meta="${esc(m.id)}"><div class="r"><span class="cnome">${badgeCat(catPorId.get(m.id))}${esc(m.nome)}</span><span>${reais(m.gasto)} <span class="rot">de ${reais(m.meta)}</span></span></div>
        <div class="b"><i class="${m.pct > 1 ? 'estourou' : m.pct >= 0.8 ? 'alerta' : ''}" style="width:${Math.min(100, Math.round(m.pct * 100))}%"></i></div>
        <small class="${m.estourou ? 'verm' : ''}">${m.estourou ? `Passou ${reais(-m.restante)} da meta` : `Faltam ${reais(m.restante)} · ${Math.round(m.pct * 100)}% da meta`}</small></div>`).join('')
        : '<p class="vazio">Nenhuma meta ainda. Em <b>Categorias</b> você define quanto quer gastar por mês (ex.: Supermercado R$ 1.500) e acompanha aqui.</p>'}
      <a class="link" href="#/categorias">Definir metas nas categorias ›</a>
    </section>
    <section class="card" aria-label="Entradas e saídas dos últimos meses">
      <h2>Entradas × saídas · 6 meses</h2>
      ${barrasMeses(serie)}
      <div class="legenda"><span><i class="pt ent"></i>Entradas</span><span><i class="pt sai"></i>Saídas</span></div>
    </section>
    <a class="card" href="#/copiar"><div class="linha-tit"><h2>Copiar contas a pagar do mês anterior</h2><span class="link">Abrir ›</span></div><p class="nota">Monte a previsão do próximo mês em um toque: escolha as contas fixas e elas entram como a pagar.</p></a>
    <a class="card" href="#/projecao"><div class="linha-tit"><h2>Projeção dos próximos meses</h2><span class="link">Ver ›</span></div><p class="nota">Quanto deve sobrar nas contas mês a mês, com o que já está a receber e a pagar.</p></a>
    ${fatura ? `<section class="card" aria-label="Cartão de crédito"><div class="linha-tit"><h2>Faturas dos cartões</h2><b class="verm">${reais(fatura)}</b></div>
      ${faturas.length > 1 || faturas[0]?.cartao ? `<div class="lista">${faturas.map((x) => x.cartao
        ? `<a class="item" href="#/cartao/${esc(x.cartao.id)}"><span class="t"><b>${esc(x.cartao.banco)} · final ${esc(x.cartao.final)}</b><small>vence em ${dataBR(x.vencimento)} · ${x.status === 'paga' ? 'paga' : x.status === 'parcial' ? `paga em parte (falta ${reais(x.pendente)})` : x.status === 'aberta' ? 'em aberto' : 'anterior ao controle'}</small></span><span class="v verm">${reais(x.total)} <span class="rot">›</span></span></a>`
        : `<div class="item"><span class="t"><b>Compras sem cartão</b><small>lançadas antes do cadastro dos cartões</small></span><span class="v verm">${reais(x.total)}</span></div>`).join('')}</div>` : ''}
      <p class="nota">A fatura em aberto está nas despesas previstas do mês. Nas categorias acima, as compras do cartão contam pela fatura em que vencem.</p></section>` : ''}
    <a class="link" href="#/categorias" style="justify-content:center">Gerenciar categorias ›</a>
`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-mes]').addEventListener('change', (e) => { mesEscolhido = e.target.value; ctx.recarregar(); });
      ligarAjudas(raiz);
    },
  };
}
