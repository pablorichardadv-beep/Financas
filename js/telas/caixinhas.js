// Caixinhas: tela da caixinha, criar/editar, aportar, resgatar e atualizar rendimento.
// Rota: #/caixinha/<id>
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, num, dataBR, hojeISO, novoId, norm } from '../format.js';
import * as D from '../domain.js';
import { abrirMovimento, ROTULO_MOV } from './comum.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const sinal = (v) => (v < 0 ? '− ' : '+ ') + 'R$ ' + num(v);
const rotuloMov = (m) => (m.tipo === 'rendimento' && m.valor < 0 ? 'Rendimento negativo' : ROTULO_MOV[m.tipo] || 'Movimento');

// ---------------------------------------------------------------- tela
export default function caixinha(ctx, args) {
  const d = ctx.dados;
  const c = d.caixinhas.find((x) => x.id === args[0]);
  if (!c) {
    return { html: '<header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Caixinha</h1></div></header><p class="vazio">Caixinha não encontrada.</p>' };
  }
  const r = D.resumoCaixinha(d, c.id);

  const linha = (m) => `<button class="item" data-mov="${esc(m.id)}"><span class="t"><b>${esc(rotuloMov(m))}</b><small>${esc(dataBR(m.data))}${m.descricao && !m.descricao.startsWith(rotuloMov(m)) ? ' · ' + esc(m.descricao) : ''}</small></span>
    <span class="v ${m.valor < 0 ? 'verm' : 'verde'}">${sinal(m.valor)}</span></button>`;

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">${esc(c.nome)}</h1></div><button class="link" data-editar>Editar</button></header>
    <section class="saldo" aria-label="Saldo da caixinha">
      <div><div class="eyebrow">${esc(c.banco.toUpperCase())}${c.arquivada ? ' · ARQUIVADA' : ''}</div><div class="valor">${reais(r.saldo)}</div></div>
      <div class="grade">
        <div><span>Rendimento acumulado</span><span>${r.rendimento > 0 ? '+ ' : ''}${reais(r.rendimento)}</span></div>
        <div><span>Rendimento atualizado em</span><span>${r.atualizadoEm ? dataBR(r.atualizadoEm) : 'ainda não'}</span></div>
      </div>
    </section>
    <button class="btn" data-rend>Atualizar rendimento</button>
    <div class="dois"><button class="btn sec" data-aporte>Aportar</button><button class="btn sec" data-resgate>Resgatar</button></div>
    <section class="card" style="gap:2px"><h2>Histórico</h2><div class="lista">${r.movs.length ? r.movs.map(linha).join('') : '<p class="vazio">Nenhum movimento ainda.</p>'}</div></section>
    <p class="nota" style="text-align:center">Rendimento: informe o saldo que aparece no banco e a data. O app calcula a diferença e registra como rendimento, sem precisar lançar dia a dia.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-editar]').onclick = () => abrirEditorCaixinha(ctx, c.id);
      raiz.querySelector('[data-rend]').onclick = () => abrirRendimento(ctx, c);
      raiz.querySelector('[data-aporte]').onclick = () => abrirAporteResgate(ctx, c, 'aporte');
      raiz.querySelector('[data-resgate]').onclick = () => abrirAporteResgate(ctx, c, 'resgate');
      raiz.querySelectorAll('[data-mov]').forEach((b) => (b.onclick = () => {
        const m = d.caixinha_movimentos.find((x) => x.id === b.dataset.mov);
        if (m) abrirMovimento(ctx, 'caixinha_movimentos', m, rotuloMov(m));
      }));
    },
  };
}

// ---------------------------------------------------------------- atualizar rendimento
export function abrirRendimento(ctx, c) {
  const d = ctx.dados;
  const r = D.resumoCaixinha(d, c.id);
  const f = folha(`
    <h2>Atualizar rendimento</h2>
    <p class="rot">${esc(D.rotuloCaixinha(c))} · saldo registrado ${reais(r.saldo)}${r.atualizadoEm ? ' · última atualização em ' + dataBR(r.atualizadoEm) : ''}</p>
    <div class="campo"><label for="rs">Saldo atual da caixinha (como aparece no banco)</label><input id="rs" inputmode="numeric" autocomplete="off" aria-label="Saldo atual em reais"></div>
    <div class="campo"><label for="rd">Data da atualização</label><input id="rd" type="date" max="${hojeISO()}" value="${hojeISO()}"></div>
    <p class="nota" id="rv" aria-live="polite"></p>
    <div class="erro" id="re" role="alert"></div>
    <button class="btn" data-ok>Salvar atualização</button>`);
  const q = (s) => f.el.querySelector(s);

  const delta = () => novo.obter() - D.saldoCaixinhaEm(d, c.id, q('#rd').value || hojeISO());
  const mostrar = () => {
    if (!novo.obter()) { q('#rv').textContent = 'Digite o saldo que aparece no app do banco e a data da conferência.'; return; }
    const x = delta();
    q('#rv').innerHTML = x === 0
      ? 'Sem diferença para o saldo registrado: só guarda a data da conferência.'
      : `Rendimento a registrar: <b class="${x > 0 ? 'verde' : 'verm'}">${sinal(x)}</b>`;
  };
  const novo = ligarCampoValor(q('#rs'), 0, mostrar);
  q('#rd').addEventListener('change', mostrar);
  mostrar();

  q('[data-ok]').onclick = async () => {
    const data = q('#rd').value;
    if (!data) { q('#re').textContent = 'Informe a data.'; return; }
    if (data > hojeISO()) { q('#re').textContent = 'A data não pode ser no futuro.'; return; }
    if (r.inicio && data < r.inicio) { q('#re').textContent = `A caixinha começa em ${dataBR(r.inicio)}. Use uma data a partir dela.`; return; }
    if (novo.obter() <= 0) { q('#re').textContent = 'Informe o saldo atual. Para zerar a caixinha, use Resgatar.'; return; }
    const m = { id: novoId('c'), caixinha: c.id, data, descricao: '', valor: delta(), tipo: 'rendimento', lancamento_id: null };
    f.fechar();
    await ctx.gravar([['put', 'caixinha_movimentos', m]]);
    ctx.aviso('Rendimento atualizado');
  };
}

// ---------------------------------------------------------------- aportar / resgatar
export function abrirAporteResgate(ctx, c, modo) {
  const d = ctx.dados;
  const aporte = modo === 'aporte';
  const saldo = D.resumoCaixinha(d, c.id).saldo;
  const ativas = D.contasAtivas(d);
  const sug = ativas.find((a) => norm(a.nome) === norm(c.banco))?.id || D.ultimaContaUsada(d, 'despesa') || ativas[0]?.id || '';

  const f = folha(`
    <h2>${aporte ? 'Aportar na caixinha' : 'Resgatar da caixinha'}</h2>
    <p class="rot">${esc(D.rotuloCaixinha(c))} · saldo ${reais(saldo)}</p>
    <div class="campo"><label for="av">Valor</label><input id="av" inputmode="numeric" autocomplete="off" aria-label="Valor em reais"></div>
    ${aporte || saldo <= 0 ? '' : `<button class="link" data-tudo>Resgatar tudo (${reais(saldo)})</button>`}
    <div class="campo sel"><label for="ac">${aporte ? 'Saiu da conta' : 'Entrou na conta'}</label><select id="ac"><option value="">Não mexer em nenhuma conta</option>${ativas.map((a) => `<option value="${esc(a.id)}" ${a.id === sug ? 'selected' : ''}>${esc(a.nome)}</option>`).join('')}</select></div>
    <div class="campo"><label for="ad">Data</label><input id="ad" type="date" max="${hojeISO()}" value="${hojeISO()}"></div>
    <p class="nota">Escolhendo uma conta, o app também lança a transferência e o saldo da conta acompanha. Sem conta, só a caixinha muda.</p>
    <div class="erro" id="ae" role="alert"></div>
    <button class="btn" data-ok>${aporte ? 'Aportar' : 'Resgatar'}</button>`);
  const q = (s) => f.el.querySelector(s);
  const valor = ligarCampoValor(q('#av'), 0);
  q('[data-tudo]')?.addEventListener('click', () => valor.definir(saldo));

  q('[data-ok]').onclick = async () => {
    const v = valor.obter();
    const data = q('#ad').value;
    const conta = q('#ac').value;
    if (!(v > 0)) { q('#ae').textContent = 'Informe um valor maior que zero.'; return; }
    if (!data) { q('#ae').textContent = 'Informe a data.'; return; }
    if (!aporte && v > saldo) { q('#ae').textContent = `O saldo da caixinha é ${reais(saldo)}. Informe um valor até esse.`; return; }
    const descricao = `${aporte ? 'Aporte' : 'Resgate'} – ${D.rotuloCaixinha(c)}`;
    const caixa = { tipo: 'caixinha', id: c.id };
    const cc = conta ? { tipo: 'conta', id: conta } : null;
    let ops;
    if (cc) {
      ops = D.opsTransferencia(d, { data, valor: v, descricao, origem: aporte ? cc : caixa, destino: aporte ? caixa : cc });
    } else {
      ops = [['put', 'caixinha_movimentos', { id: novoId('c'), caixinha: c.id, data, descricao, valor: aporte ? v : -v, tipo: aporte ? 'aporte' : 'resgate', lancamento_id: null }]];
    }
    f.fechar();
    await ctx.gravar(ops);
    ctx.aviso(aporte ? 'Aporte registrado' : 'Resgate registrado');
  };
}

// ---------------------------------------------------------------- criar / editar / excluir
export function abrirEditorCaixinha(ctx, id = null) {
  const d = ctx.dados;
  const c = id ? d.caixinhas.find((x) => x.id === id) : null;
  if (id && !c) return;
  const rem = c ? D.remocaoCaixinha(d, id) : null;
  const bancos = D.bancosConhecidos(d);

  let acoes = '';
  if (c?.arquivada) {
    acoes = '<button class="btn sec" data-reativar>Reativar caixinha</button>';
  } else if (c && rem.acao === 'excluir') {
    const quitada = rem.saldo === 0 && rem.movimentos > 0;
    acoes = `<p class="nota">Esta caixinha não tem nenhuma movimentação ligada a contas. Excluindo, ${rem.movimentos ? `os ${plural(rem.movimentos, 'movimento', 'movimentos')} e o saldo de ${reais(rem.saldo)} deixam de existir` : 'ela some'}.</p>
      ${quitada ? '<button class="btn sec" data-arquivar>Arquivar (guarda o histórico)</button>' : ''}
      <button class="btn perigo" data-excluir>Excluir caixinha</button>`;
  } else if (c && rem.acao === 'arquivar') {
    acoes = `<p class="nota">Esta caixinha tem movimentos ligados às suas contas, por isso não pode ser apagada. Arquivando, ela some das listas e dos formulários e o histórico continua.</p>
      <button class="btn perigo" data-arquivar>Arquivar caixinha</button>`;
  } else if (c) {
    acoes = `<p class="nota">Esta caixinha ainda tem <b>${reais(rem.saldo)}</b> e movimentos ligados às suas contas. Para arquivá-la, primeiro resgate o saldo (botão “Resgatar tudo”).</p>`;
  }

  const f = folha(`
    <h2>${c ? 'Editar caixinha' : 'Nova caixinha'}${c?.arquivada ? ' (arquivada)' : ''}</h2>
    <div class="campo"><label for="xn">Nome (o motivo)</label><input id="xn" maxlength="30" autocomplete="off" autocapitalize="sentences" placeholder="Ex.: Viagem" value="${esc(c?.nome || '')}"></div>
    <div class="campo"><label for="xb">Banco</label><input id="xb" maxlength="30" autocomplete="off" autocapitalize="words" placeholder="Ex.: Itaú" value="${esc(c?.banco || '')}"></div>
    ${bancos.length ? `<div class="chips" role="group" aria-label="Bancos">${bancos.map((b) => `<button class="chip" data-banco="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
    ${c ? '' : `<div class="dois">
        <div class="campo"><label for="xs">Saldo inicial</label><input id="xs" inputmode="numeric" autocomplete="off" aria-label="Saldo inicial em reais"></div>
        <div class="campo"><label for="xd">Em</label><input id="xd" type="date" max="${hojeISO()}" value="${hojeISO()}"></div></div>
      <p class="nota">Pode haver mais de uma caixinha no mesmo banco, cada uma com o seu motivo. O saldo inicial é quanto há nela na data escolhida; depois, use aportes, resgates e “Atualizar rendimento”.</p>`}
    <div class="erro" id="xe" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Criar caixinha'}</button>
    ${acoes}`);
  const q = (s) => f.el.querySelector(s);
  const saldo = c ? null : ligarCampoValor(q('#xs'), 0);

  f.el.querySelectorAll('[data-banco]').forEach((b) => (b.onclick = () => { q('#xb').value = b.dataset.banco; }));

  q('[data-salvar]').onclick = async () => {
    const v = D.validarCaixinha(d, { id, nome: q('#xn').value, banco: q('#xb').value });
    if (v.erro) { q('#xe').textContent = v.erro; return; }
    if (c) {
      f.fechar();
      await ctx.gravar([['put', 'caixinhas', { ...c, nome: v.ok.nome, banco: v.ok.banco }]]);
      ctx.aviso('Caixinha atualizada');
      return;
    }
    const inicial = saldo.obter();
    const data = q('#xd').value;
    if (inicial > 0 && !data) { q('#xe').textContent = 'Informe a data do saldo inicial.'; return; }
    const novoId_ = D.idUnicoCaixinha(d, v.ok.banco, v.ok.nome);
    const ops = [['put', 'caixinhas', { id: novoId_, nome: v.ok.nome, banco: v.ok.banco }]];
    if (inicial > 0) ops.push(['put', 'caixinha_movimentos', { id: novoId('c'), caixinha: novoId_, data, descricao: 'Saldo inicial', valor: inicial, tipo: 'saldo_inicial', lancamento_id: null }]);
    f.fechar();
    await ctx.gravar(ops);
    ctx.aviso('Caixinha criada');
    ctx.ir('caixinha/' + novoId_);
  };

  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'caixinhas', { ...c, arquivada: false }]]);
    ctx.aviso('Caixinha reativada');
  });
  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Arquivar “${c.nome}”?`, 'Ela some das listas e dos formulários. O histórico continua. Você pode reativá-la depois.', 'Arquivar', true))) return;
    ctx.ir('contas');
    await ctx.gravar([['put', 'caixinhas', { ...c, arquivada: true }]]);
    ctx.aviso('Caixinha arquivada');
  });
  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    const txt = rem.movimentos ? `Os ${plural(rem.movimentos, 'movimento', 'movimentos')} e o saldo de ${reais(rem.saldo)} deixam de contar no saldo geral. Não dá para desfazer.` : 'Não dá para desfazer.';
    if (!(await confirmar(`Excluir “${c.nome}”?`, txt, 'Excluir', true))) return;
    ctx.ir('contas');
    await ctx.gravar([...d.caixinha_movimentos.filter((m) => m.caixinha === id).map((m) => ['del', 'caixinha_movimentos', m.id]), ['del', 'caixinhas', id]]);
    ctx.aviso('Caixinha excluída');
  });
}
