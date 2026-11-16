// Empréstimos: tela do empréstimo, criar/editar, registrar recebimentos e pagamentos.
// Rota: #/emprestimo/<id>
//   sentido "dado"   = você emprestou para alguém (tem a receber);
//   sentido "tomado" = você pegou emprestado (tem a pagar).
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, num, dataBR, hojeISO, novoId } from '../format.js';
import * as D from '../domain.js';
import { abrirMovimento } from './comum.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const sinal = (v) => (v < 0 ? '− ' : '+ ') + 'R$ ' + num(v);

export const nomeSentido = (e) => (e.sentido === 'tomado' ? 'A pagar' : 'A receber');

/** Rótulo de um movimento conforme o sentido do empréstimo. */
const rotuloMov = (e, m) => (m.tipo === 'principal'
  ? (e.sentido === 'tomado' ? 'Empréstimo recebido' : 'Empréstimo')
  : (e.sentido === 'tomado' ? 'Pagamento' : 'Recebimento'));

// Textos de cada ação: chave = sentido/direção (direção: 'para' = dinheiro vai para o empréstimo, 'de' = vem dele)
const ACOES = {
  'dado/de': { titulo: 'Registrar recebimento', conta: 'Entrou na conta', desc: 'Recebimento', ok: 'Registrar recebimento', aviso: 'Recebimento registrado' },
  'dado/para': { titulo: 'Emprestar mais', conta: 'Saiu da conta', desc: 'Empréstimo', ok: 'Emprestar', aviso: 'Empréstimo registrado' },
  'tomado/para': { titulo: 'Registrar pagamento', conta: 'Saiu da conta', desc: 'Pagamento', ok: 'Registrar pagamento', aviso: 'Pagamento registrado' },
  'tomado/de': { titulo: 'Pegar mais emprestado', conta: 'Entrou na conta', desc: 'Empréstimo recebido', ok: 'Registrar', aviso: 'Empréstimo registrado' },
};

// ---------------------------------------------------------------- tela
export default function emprestimo(ctx, args) {
  const d = ctx.dados;
  const e = d.emprestimos.find((x) => x.id === args[0]);
  if (!e) {
    return { html: '<header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Empréstimo</h1></div></header><p class="vazio">Empréstimo não encontrado.</p>' };
  }
  const tomado = e.sentido === 'tomado';
  const r = D.resumoEmprestimo(d, e);
  const pct = r.principal ? Math.max(0, Math.min(100, Math.round((r.pago / r.principal) * 100))) : 0;

  // fluxo de caixa para você: dinheiro que entra (+) ou sai (−) do seu bolso
  const linha = (m) => {
    const fluxo = -m.valor;
    // a descrição automática (“Pagamento – Fulano (obs)”) repete o rótulo: mostra só a observação
    let det = m.descricao || '';
    if (det.includes(` – ${e.nome}`)) det = (det.match(/\((.+)\)$/) || [])[1] || '';
    return `<button class="item" data-mov="${esc(m.id)}"><span class="t"><b>${esc(rotuloMov(e, m))}</b><small>${esc(dataBR(m.data))}${det ? ' · ' + esc(det) : ''}</small></span>
      <span class="v ${fluxo < 0 ? 'verm' : 'verde'}">${sinal(fluxo)}</span></button>`;
  };

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">${esc(e.nome)}</h1></div><button class="link" data-editar>Editar</button></header>
    <section class="saldo" aria-label="Saldo do empréstimo">
      <div><div class="eyebrow">${nomeSentido(e).toUpperCase()}${r.quitado ? ' · QUITADO' : ''}${e.arquivada ? ' · ARQUIVADO' : ''}</div><div class="valor">${reais(Math.abs(r.saldo))}</div></div>
      <div class="grade">
        <div><span>${tomado ? 'Total que peguei' : 'Total emprestado'}</span><span>${reais(r.principal)}</span></div>
        <div><span>${tomado ? 'Já paguei' : 'Já recebi'}</span><span>${reais(r.pago)}</span></div>
      </div>
      <div><div class="barra" role="img" aria-label="${pct}% ${tomado ? 'pago' : 'recebido'}"><i style="width:${pct}%;background:#fff"></i><i style="width:${100 - pct}%;background:rgba(255,255,255,.25)"></i></div></div>
    </section>
    <button class="btn" data-acao="${tomado ? 'para' : 'de'}">${ACOES[`${e.sentido}/${tomado ? 'para' : 'de'}`].titulo}</button>
    <button class="btn sec" data-acao="${tomado ? 'de' : 'para'}">${ACOES[`${e.sentido}/${tomado ? 'de' : 'para'}`].titulo}</button>
    <section class="card" style="gap:2px"><h2>Histórico</h2><div class="lista">${r.movs.length ? r.movs.map(linha).join('') : '<p class="vazio">Nenhum movimento ainda.</p>'}</div></section>
    <p class="nota" style="text-align:center">${tomado ? 'Pagamentos' : 'Recebimentos'} com uma conta escolhida também entram nos seus lançamentos e mudam o saldo da conta, sem contar como receita ou despesa do mês.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-editar]').onclick = () => abrirEditorEmprestimo(ctx, e.id);
      raiz.querySelectorAll('[data-acao]').forEach((b) => (b.onclick = () => abrirMovimentoEmprestimo(ctx, e, b.dataset.acao)));
      raiz.querySelectorAll('[data-mov]').forEach((b) => (b.onclick = () => {
        const m = d.emprestimo_movimentos.find((x) => x.id === b.dataset.mov);
        if (m) abrirMovimento(ctx, 'emprestimo_movimentos', m, rotuloMov(e, m), { fluxo: -m.valor });
      }));
    },
  };
}

// ---------------------------------------------------------------- registrar recebimento / pagamento / valor adicional
export function abrirMovimentoEmprestimo(ctx, e, direcao) {
  const d = ctx.dados;
  const t = ACOES[`${e.sentido}/${direcao}`];
  const r = D.resumoEmprestimo(d, e);
  const ativas = D.contasAtivas(d);
  const sug = D.ultimaContaUsada(d, direcao === 'de' ? 'receita' : 'despesa') || ativas[0]?.id || '';
  const ehPagamento = D.movimentoEmprestimo(e, direcao, 1).tipo === 'pagamento';

  const f = folha(`
    <h2>${t.titulo}</h2>
    <p class="rot">${esc(e.nome)} · ${nomeSentido(e).toLowerCase()} ${reais(Math.abs(r.saldo))}</p>
    <div class="campo"><label for="mv">Valor</label><input id="mv" inputmode="numeric" autocomplete="off" aria-label="Valor em reais"></div>
    <p class="nota" id="mn" aria-live="polite"></p>
    <div class="campo sel"><label for="mc">${t.conta}</label><select id="mc"><option value="">Não mexer em nenhuma conta</option>${ativas.map((a) => `<option value="${esc(a.id)}" ${a.id === sug ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label for="md">Data</label><input id="md" type="date" value="${hojeISO()}"></div>
    <div class="campo"><label for="mo">Observação (opcional)</label><input id="mo" maxlength="40" autocomplete="off" placeholder="Ex.: parcela 14"></div>
    <div class="erro" id="me" role="alert"></div>
    <button class="btn" data-ok>${t.ok}</button>`);
  const q = (s) => f.el.querySelector(s);

  const aviso = () => {
    q('#mn').textContent = ehPagamento && valor.obter() > Math.abs(r.saldo) && r.saldo !== 0
      ? `É mais que o saldo em aberto (${reais(Math.abs(r.saldo))}). Se incluir juros, tudo bem: o saldo fica no sentido contrário.` : '';
  };
  const valor = ligarCampoValor(q('#mv'), 0, aviso);

  q('[data-ok]').onclick = async () => {
    const v = valor.obter();
    const data = q('#md').value;
    const conta = q('#mc').value;
    if (!(v > 0)) { q('#me').textContent = 'Informe um valor maior que zero.'; return; }
    if (!data) { q('#me').textContent = 'Informe a data.'; return; }
    const obs = q('#mo').value.trim();
    const descricao = `${t.desc} – ${e.nome}${obs ? ` (${obs})` : ''}`;
    let ops;
    if (conta) {
      const cc = { tipo: 'conta', id: conta };
      const ee = { tipo: 'emprestimo', id: e.id };
      ops = D.opsTransferencia(d, { data, valor: v, descricao, origem: direcao === 'para' ? cc : ee, destino: direcao === 'para' ? ee : cc });
    } else {
      ops = [['put', 'emprestimo_movimentos', { id: novoId('m'), emprestimo: e.id, data, descricao, ...D.movimentoEmprestimo(e, direcao, v), lancamento_id: null }]];
    }
    f.fechar();
    await ctx.gravar(ops);
    ctx.aviso(t.aviso);
  };
}

// ---------------------------------------------------------------- criar / editar / excluir
export function abrirEditorEmprestimo(ctx, id = null) {
  const d = ctx.dados;
  const e = id ? d.emprestimos.find((x) => x.id === id) : null;
  if (id && !e) return;
  const rem = e ? D.remocaoEmprestimo(d, id) : null;
  const ativas = D.contasAtivas(d);
  const sug = D.ultimaContaUsada(d, 'despesa') || ativas[0]?.id || '';
  let sentido = e?.sentido || 'dado';

  let acoes = '';
  if (e?.arquivada) {
    acoes = '<button class="btn sec" data-reativar>Reativar empréstimo</button>';
  } else if (e && rem.acao === 'excluir') {
    const quitado = rem.saldo === 0 && rem.movimentos > 0;
    acoes = `<p class="nota">Nenhum movimento deste empréstimo mexeu em contas. Excluindo, ${rem.movimentos ? `os ${plural(rem.movimentos, 'movimento', 'movimentos')} deixam de existir` : 'ele some'}.</p>
      ${quitado ? '<button class="btn sec" data-arquivar>Arquivar (guarda o histórico)</button>' : ''}
      <button class="btn perigo" data-excluir>Excluir empréstimo</button>`;
  } else if (e && rem.acao === 'arquivar') {
    acoes = `<p class="nota">Está quitado, mas tem movimentos ligados às suas contas, por isso não pode ser apagado. Arquivando, ele some da lista e o histórico continua.</p>
      <button class="btn perigo" data-arquivar>Arquivar empréstimo</button>`;
  } else if (e) {
    acoes = `<p class="nota">Ainda há <b>${reais(Math.abs(rem.saldo))}</b> em aberto e movimentos ligados às suas contas. Para arquivar, quite o saldo. Para desfazer um lançamento errado, abra o movimento no histórico e exclua.</p>`;
  }

  const f = folha(`
    <h2>${e ? 'Editar empréstimo' : 'Novo empréstimo'}${e?.arquivada ? ' (arquivado)' : ''}</h2>
    <div class="campo"><label for="en">Nome (ex.: o nome da pessoa)</label><input id="en" maxlength="30" autocomplete="off" autocapitalize="words" placeholder="Ex.: Empréstimo Maria" value="${esc(e?.nome || '')}"></div>
    ${e ? `<p class="nota">Tipo: <b>${e.sentido === 'tomado' ? 'Peguei emprestado (a pagar)' : 'Emprestei (a receber)'}</b>. O tipo não muda depois de criado.</p>` : `
      <div class="seg" role="group" aria-label="Tipo do empréstimo"><button data-sent="dado" class="on" style="background:var(--navy);color:#fff">Emprestei</button><button data-sent="tomado">Peguei emprestado</button></div>
      <div class="campo"><label for="ev">Valor</label><input id="ev" inputmode="numeric" autocomplete="off" aria-label="Valor em reais"></div>
      <div class="campo sel"><label for="ec" id="elc">Saiu da conta</label><select id="ec"><option value="">Não mexer em contas (empréstimo antigo)</option>${ativas.map((a) => `<option value="${esc(a.id)}" ${a.id === sug ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
      <div class="campo"><label for="ed">Data</label><input id="ed" type="date" value="${hojeISO()}"></div>
      <p class="nota">Escolhendo uma conta, o valor também sai (ou entra) nela. Para um empréstimo antigo que já está nos saldos, escolha “Não mexer em contas”.</p>`}
    <div class="erro" id="ee" role="alert"></div>
    <button class="btn" data-salvar>${e ? 'Salvar alterações' : 'Criar empréstimo'}</button>
    ${acoes}`);
  const q = (s) => f.el.querySelector(s);
  const valor = e ? null : ligarCampoValor(q('#ev'), 0);

  f.el.querySelectorAll('[data-sent]').forEach((b) => (b.onclick = () => {
    sentido = b.dataset.sent;
    f.el.querySelectorAll('[data-sent]').forEach((x) => {
      const on = x.dataset.sent === sentido;
      x.classList.toggle('on', on);
      x.style.background = on ? 'var(--navy)' : '';
      x.style.color = on ? '#fff' : '';
    });
    q('#elc').textContent = sentido === 'dado' ? 'Saiu da conta' : 'Entrou na conta';
  }));

  q('[data-salvar]').onclick = async () => {
    const v = D.validarEmprestimo(d, { id, nome: q('#en').value, sentido });
    if (v.erro) { q('#ee').textContent = v.erro; return; }
    if (e) {
      f.fechar();
      await ctx.gravar([['put', 'emprestimos', { ...e, nome: v.ok.nome }]]);
      ctx.aviso('Empréstimo atualizado');
      return;
    }
    const val = valor.obter();
    const data = q('#ed').value;
    if (!(val > 0)) { q('#ee').textContent = 'Informe o valor do empréstimo.'; return; }
    if (!data) { q('#ee').textContent = 'Informe a data.'; return; }
    const conta = q('#ec').value;
    const novo = { id: D.idUnicoEmprestimo(d, v.ok.nome), nome: v.ok.nome, sentido: v.ok.sentido };
    const direcao = novo.sentido === 'dado' ? 'para' : 'de';
    const descricao = `${novo.sentido === 'dado' ? 'Empréstimo' : 'Empréstimo recebido'} – ${novo.nome}`;
    let ops;
    if (conta) {
      const cc = { tipo: 'conta', id: conta };
      const ee = { tipo: 'emprestimo', id: novo.id };
      ops = D.opsTransferencia({ ...d, emprestimos: [...d.emprestimos, novo] }, { data, valor: val, descricao, origem: direcao === 'para' ? cc : ee, destino: direcao === 'para' ? ee : cc });
    } else {
      ops = [['put', 'emprestimo_movimentos', { id: novoId('m'), emprestimo: novo.id, data, descricao, ...D.movimentoEmprestimo(novo, direcao, val), lancamento_id: null }]];
    }
    f.fechar();
    await ctx.gravar([['put', 'emprestimos', novo], ...ops]);
    ctx.aviso('Empréstimo criado');
    ctx.ir('emprestimo/' + novo.id);
  };

  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'emprestimos', { ...e, arquivada: false }]]);
    ctx.aviso('Empréstimo reativado');
  });
  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Arquivar “${e.nome}”?`, 'Ele some da lista de empréstimos. O histórico continua. Você pode reativá-lo depois.', 'Arquivar', true))) return;
    ctx.ir('contas');
    await ctx.gravar([['put', 'emprestimos', { ...e, arquivada: true }]]);
    ctx.aviso('Empréstimo arquivado');
  });
  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    const txt = rem.movimentos ? `Os ${plural(rem.movimentos, 'movimento', 'movimentos')} e o saldo de ${reais(Math.abs(rem.saldo))} deixam de contar no saldo geral. Não dá para desfazer.` : 'Não dá para desfazer.';
    if (!(await confirmar(`Excluir “${e.nome}”?`, txt, 'Excluir', true))) return;
    ctx.ir('contas');
    await ctx.gravar([...d.emprestimo_movimentos.filter((m) => m.emprestimo === id).map((m) => ['del', 'emprestimo_movimentos', m.id]), ['del', 'emprestimos', id]]);
    ctx.aviso('Empréstimo excluído');
  });
}
