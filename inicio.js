import { icone, esc, aviso } from '../ui.js';
import { definirMeta } from '../db.js';
import { abrirEditorConta } from './cadastros.js';
import { reais, num, hojeISO, mesAtual, mesLongo, saudacaoData } from '../format.js';
import * as D from '../domain.js';
import { nomes, linhaItem } from './comum.js';
import { abrirDetalhe } from './detalhe.js';
import { ajuda, ligarAjudas } from '../visual.js';

const DIAS_SEM_BACKUP = 7;

function diasDesde(iso) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;
}

export default function inicio(ctx) {
  const d = ctx.dados;
  const hoje = hojeISO();
  const mes = mesAtual();
  const g = D.saldoGeral(d);
  const r = D.resumoMes(d, mes);
  const ap = D.aPagarMes(d, mes, hoje);
  const h = D.resumoHonorarios(d, hoje);
  const n = nomes(d);
  const semDados = d.contas.length === 0 && d.lancamentos.length === 0;
  const nome = D.primeiroNome(d.meta.nome);
  const ola = nome ? `Olá, ${esc(nome)}` : 'Olá!';

  const ultimos = d.lancamentos
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => D.estaPago(l) && l.data)
    .sort((a, b) => b.l.data.localeCompare(a.l.data) || b.i - a.i)
    .slice(0, 5)
    .map(({ l }) => l);

  const refBackup = d.meta.ultimo_backup || d.meta.seed_aplicado;
  const dias = diasDesde(refBackup);
  const faixa = dias !== null && dias >= DIAS_SEM_BACKUP
    ? `<div class="faixa"><span>${d.meta.ultimo_backup ? `Último backup há ${dias} dias.` : 'Você ainda não fez backup.'} Seus dados só existem neste aparelho.</span><button data-backup>Fazer agora</button></div>` : '';

  const pend = D.pendenciasHoje(d, hoje);
  const faixaHoje = `<section class="card hoje" aria-label="O que precisa de você hoje"><h2>O que precisa de você hoje</h2>${pend.length
    ? pend.map((p) => `<a class="pend ${p.nivel}" href="${p.href}"><i></i><span>${esc(p.texto)}</span><b>›</b></a>`).join('')
    : '<p class="tudo-ok">Tudo em dia por aqui. Nada pendente hoje.</p>'}</section>`;

  const pctRecebido = r.receitas ? Math.round((r.recebido / r.receitas) * 100) : 0;

  const vazioHtml = `
    <header class="topo"><div><span class="sub">${saudacaoData()}</span><span class="tit">${ola}</span></div>
      <a class="btn-ic" href="#/ajustes" aria-label="Ajustes">${icone.ajustes()}</a></header>
    <section class="card"><h2>Vamos começar</h2>
      <div class="campo"><label for="nome-novo">Seu nome</label><input id="nome-novo" autocomplete="given-name" autocapitalize="words" placeholder="Como quer ser chamado" value="${esc(d.meta.nome || '')}"></div>
      <p class="nota">Primeira vez usando? Toque em <b>Começar do zero</b>: o app cria categorias básicas e a conta Carteira; depois você cadastra suas contas de banco com o saldo de hoje.</p>
      <button class="btn" data-zero>Começar do zero</button>
      <p class="nota">Já tem um backup deste app (ou um arquivo de dados iniciais)? Use o botão abaixo.</p>
      <a class="btn sec" href="#/ajustes" data-ir-backup style="display:flex;align-items:center;justify-content:center">Restaurar backup ou carregar dados iniciais</a></section>`;

  const html = semDados ? vazioHtml : `
    <header class="topo">
      <div><span class="sub">${saudacaoData()}</span><span class="tit">${ola}</span></div>
      <a class="btn-ic" href="#/ajustes" aria-label="Ajustes">${icone.ajustes()}</a>
    </header>
    ${faixa}
    <a class="card ass-atalho" href="#/assistente"><span class="ass-ic" aria-hidden="true">🎙️</span><span class="t"><b>Assistente</b><small>Escreva ou dite um lançamento ou uma pergunta</small></span><b class="seta">›</b></a>
    <section class="saldo" aria-label="Saldo geral">
      <div><div class="eyebrow">SALDO GERAL ${ajuda('saldoGeral')}</div><div class="valor">${reais(g.total)}</div></div>
      <div class="grade">
        <a href="#/contas"><span>Em contas</span><span>${reais(g.contas)}</span></a>
        <a href="#/contas"><span>Caixinhas</span><span>${reais(g.caixinhas)}</span></a>
        <a href="#/contas"><span>Empréstimos</span><span>${reais(g.emprestimo)}</span></a>
        <a href="#/lancamentos"><span>Em aberto ${ajuda('emAberto')}</span><span>${reais(g.aberto)}</span></a>
      </div>
      <small class="saldo-nota">Saldo geral = contas + caixinhas + empréstimos. “Em aberto” fica de fora.</small>
    </section>
    ${faixaHoje}
    <section class="card" aria-label="Resumo do mês">
      <div class="linha-tit"><h2>${mesLongo(mes)}</h2><a class="link" href="#/mes">Ver categorias ›</a></div>
      <div class="tres">
        <div><span class="rot">Receitas</span><b class="verde">+ ${num(r.receitas)}</b></div>
        <div><span class="rot">Despesas</span><b class="verm">− ${num(r.despesas)}</b></div>
        <div><span class="rot">Saldo do mês</span><b class="azul">${r.saldo < 0 ? '− ' : ''}${num(r.saldo)}</b></div>
      </div>
      <div>
        <div class="barra" role="img" aria-label="${pctRecebido}% das receitas já recebidas"><i style="width:${pctRecebido}%;background:var(--navy)"></i><i style="width:${100 - pctRecebido}%;background:var(--blue-soft)"></i></div>
        <div class="legenda" style="margin-top:6px"><span>Recebido ${reais(r.recebido)}</span><span>A receber ${reais(r.aReceber)}</span></div>
      </div>
    </section>
    <div class="dois">
      <a class="card mini" href="#/honorarios"><span class="rot">Honorários a receber</span><span class="num">${reais(h.aReceber)}</span>
        ${h.atrasado ? `<span class="selo ouro">${reais(h.atrasado)} atrasado</span>` : '<span class="selo ok">Nada atrasado</span>'}</a>
      <a class="card mini" href="#/lancamentos"><span class="rot">A pagar este mês</span><span class="num">${reais(ap.total)}</span>
        ${ap.atrasado ? `<span class="selo verm">${reais(ap.atrasado)} atrasado</span>` : '<span class="selo ok">Nenhuma atrasada</span>'}</a>
    </div>
    <section class="card" style="padding:12px 16px 4px;gap:4px" aria-label="Últimos lançamentos">
      <div class="linha-tit"><h2>Últimos lançamentos</h2><a class="link" href="#/lancamentos">Ver todos ›</a></div>
      <div class="lista">${ultimos.length ? ultimos.map((l) => linhaItem(l, n, { comData: true })).join('') : '<p class="vazio">Nenhum lançamento ainda. Toque no <b>+</b> embaixo para registrar o primeiro.</p>'}</div>
    </section>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelectorAll('.item[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
      ligarAjudas(raiz);
      raiz.querySelector('[data-backup]')?.addEventListener('click', () => ctx.ir('ajustes'));
      const campoNome = raiz.querySelector('#nome-novo');
      const salvarNome = async () => { const v = campoNome?.value.trim(); if (v && v !== (ctx.dados.meta.nome || '')) await definirMeta('nome', v); };
      raiz.querySelector('[data-ir-backup]')?.addEventListener('click', () => { salvarNome(); });
      raiz.querySelector('[data-zero]')?.addEventListener('click', async (e) => {
        e.currentTarget.disabled = true;
        await salvarNome();
        await definirMeta('seed_aplicado', new Date().toISOString());
        await ctx.gravar(D.opsComecarDoZero());
        aviso('Pronto! Agora cadastre sua primeira conta de banco com o saldo de hoje.');
        ctx.ir('contas');
        setTimeout(() => abrirEditorConta(ctx, null), 350);   // já abre o cadastro da primeira conta
      });
    },
  };
}
