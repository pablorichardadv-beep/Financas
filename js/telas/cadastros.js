// Editores (folhas) de conta e de categoria: criar, renomear, excluir, arquivar e reativar.
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais } from '../format.js';
import * as D from '../domain.js';

export const TIPOS_CONTA = [
  ['conta', 'Conta bancária (pessoal)'],
  ['conta_pj', 'Conta PJ (escritório)'],
  ['dinheiro', 'Dinheiro / carteira'],
];
export const nomeTipoConta = (t) => TIPOS_CONTA.find((x) => x[0] === t)?.[1] || t;

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------- conta
export function abrirEditorConta(ctx, id = null) {
  const d = ctx.dados;
  const c = id ? d.contas.find((x) => x.id === id) : null;
  if (id && !c) return;
  const rem = c ? D.remocaoConta(d, id) : null;

  let acoes = '';
  if (c?.arquivada) {
    acoes = '<button class="btn sec" data-reativar>Reativar conta</button>';
  } else if (c && rem.acao === 'excluir') {
    acoes = '<button class="btn perigo" data-excluir>Excluir conta</button>';
  } else if (c && rem.acao === 'arquivar') {
    acoes = `<p class="nota">Esta conta tem ${plural(rem.uso, 'lançamento', 'lançamentos')}, por isso não pode ser apagada. Arquivando, ela some das listas e dos formulários e o histórico continua intacto.</p>
      <button class="btn perigo" data-arquivar>Arquivar conta</button>`;
  } else if (c) {
    acoes = `<p class="nota">Esta conta ainda tem <b>${reais(rem.saldo)}</b> e ${plural(rem.uso, 'lançamento', 'lançamentos')}. Para arquivá-la, primeiro transfira o saldo para outra conta (ou lance um ajuste) até ela ficar zerada.</p>`;
  }

  const f = folha(`
    <h2>${c ? 'Editar conta' : 'Nova conta'}${c?.arquivada ? ' (arquivada)' : ''}</h2>
    <div class="campo"><label for="cn">Nome</label><input id="cn" maxlength="30" autocomplete="off" autocapitalize="words" placeholder="Ex.: Inter" value="${esc(c?.nome || '')}"></div>
    <div class="campo sel"><label for="ct">Tipo</label><select id="ct">${TIPOS_CONTA.map(([v, r]) => `<option value="${v}" ${(c?.tipo || 'conta') === v ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>
    <div class="campo"><label for="cs">Saldo inicial</label><input id="cs" inputmode="numeric" autocomplete="off" aria-label="Saldo inicial em reais"></div>
    <p class="nota">${c ? 'Saldo atual = saldo inicial + lançamentos pagos. Para corrigir o saldo, ajuste o saldo inicial.' : 'Quanto há nesta conta hoje. Depois, os lançamentos vão somando e subtraindo.'}</p>
    <div class="erro" id="ce" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Criar conta'}</button>
    ${acoes}`);

  const q = (s) => f.el.querySelector(s);
  const saldo = ligarCampoValor(q('#cs'), c?.saldo_abertura || 0);

  q('[data-salvar]').onclick = async () => {
    const v = D.validarConta(d, { id, nome: q('#cn').value, tipo: q('#ct').value });
    if (v.erro) { q('#ce').textContent = v.erro; return; }
    const obj = c
      ? { ...c, nome: v.ok.nome, tipo: v.ok.tipo, saldo_abertura: saldo.obter() }
      : { id: D.idUnicoConta(d, v.ok.nome), nome: v.ok.nome, tipo: v.ok.tipo, saldo_abertura: saldo.obter() };
    f.fechar();
    await ctx.gravar([['put', 'contas', obj]]);
    ctx.aviso(c ? 'Conta atualizada' : 'Conta criada');
  };

  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'contas', { ...c, arquivada: false }]]);
    ctx.aviso('Conta reativada');
  });

  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Arquivar “${c.nome}”?`, 'Ela some das listas e dos formulários. O histórico de lançamentos continua. Você pode reativá-la depois.', 'Arquivar', true))) return;
    await ctx.gravar([['put', 'contas', { ...c, arquivada: true }]]);
    ctx.aviso('Conta arquivada');
  });

  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    const aviso = c.saldo_abertura ? ` O saldo inicial de ${reais(c.saldo_abertura)} deixa de contar no saldo geral.` : '';
    if (!(await confirmar(`Excluir “${c.nome}”?`, `Esta conta não tem nenhum lançamento.${aviso} Não dá para desfazer.`, 'Excluir', true))) return;
    await ctx.gravar([['del', 'contas', id]]);
    ctx.aviso('Conta excluída');
  });
}

// ------------------------------------------------------------ categoria
/**
 * opcoes.tipo: tipo inicial (e fixo quando vier do formulário de lançamento);
 * opcoes.semRender: grava sem redesenhar a tela (usado dentro do formulário, para não perder o que foi digitado);
 * opcoes.aoSalvar(cat): chamado depois de criar.
 */
export function abrirEditorCategoria(ctx, id = null, opcoes = {}) {
  const d = ctx.dados;
  const c = id ? d.categorias.find((x) => x.id === id) : null;
  if (id && !c) return;
  let tipo = c?.tipo || opcoes.tipo || 'despesa';
  const tipoFixo = Boolean(c) || Boolean(opcoes.semRender);
  const rem = c ? D.remocaoCategoria(d, id) : null;

  let acoes = '';
  if (c?.arquivada) acoes = '<button class="btn sec" data-reativar>Reativar categoria</button>';
  else if (c && rem.acao === 'excluir') acoes = '<button class="btn perigo" data-excluir>Excluir categoria</button>';
  else if (c) acoes = `<p class="nota">Esta categoria foi usada em ${plural(rem.uso, 'lançamento', 'lançamentos')}, por isso não pode ser apagada. Arquivando, ela deixa de aparecer ao lançar, e o histórico continua intacto.</p>
      <button class="btn perigo" data-arquivar>Arquivar categoria</button>`;

  const f = folha(`
    <h2>${c ? 'Editar categoria' : 'Nova categoria'}${c?.arquivada ? ' (arquivada)' : ''}</h2>
    <div class="campo"><label for="kn">Nome</label><input id="kn" maxlength="30" autocomplete="off" autocapitalize="sentences" placeholder="Ex.: Pets" value="${esc(c?.nome || '')}"></div>
    ${tipoFixo ? `<p class="nota">Tipo: <b>${tipo === 'receita' ? 'Receita' : 'Despesa'}</b></p>` : `<div class="seg" role="group" aria-label="Tipo da categoria"><button data-tp="despesa" class="${tipo === 'despesa' ? 'on' : ''}" style="${tipo === 'despesa' ? 'background:var(--red);color:#fff' : ''}">Despesa</button><button data-tp="receita" class="${tipo === 'receita' ? 'on' : ''}" style="${tipo === 'receita' ? 'background:var(--green);color:#fff' : ''}">Receita</button></div>`}
    <div id="kmw" ${tipo === 'despesa' ? '' : 'hidden'}><div class="campo"><label for="km">Meta mensal (opcional)</label><input id="km" inputmode="numeric" autocomplete="off" aria-label="Meta mensal em reais"></div>
      <p class="nota">Quanto você quer gastar, no máximo, por mês nesta categoria. O Mês mostra quanto falta. Deixe R$ 0,00 para não ter meta.</p></div>
    <div class="erro" id="ke" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Criar categoria'}</button>
    ${acoes}`);
  const q = (s) => f.el.querySelector(s);
  const meta = ligarCampoValor(q('#km'), c?.meta || 0, undefined, { substituir: true });

  f.el.querySelectorAll('[data-tp]').forEach((b) => (b.onclick = () => {
    tipo = b.dataset.tp;
    q('#kmw').hidden = tipo !== 'despesa';
    f.el.querySelectorAll('[data-tp]').forEach((x) => {
      const on = x.dataset.tp === tipo;
      x.classList.toggle('on', on);
      x.style.background = on ? (x.dataset.tp === 'receita' ? 'var(--green)' : 'var(--red)') : '';
      x.style.color = on ? '#fff' : '';
    });
  }));

  q('[data-salvar]').onclick = async () => {
    const v = D.validarCategoria(d, { id, nome: q('#kn').value, tipo, meta: meta.obter() });
    if (v.erro) { q('#ke').textContent = v.erro; return; }
    let obj;
    if (c) obj = { ...c, nome: v.ok.nome, meta: v.ok.meta };
    else {
      const n = D.idNovaCategoria(d, tipo);
      obj = { id: n.id, codigo: n.codigo, nome: v.ok.nome, tipo, meta_pct: null, meta: v.ok.meta };
    }
    f.fechar();
    if (opcoes.semRender) {
      await ctx.DB.lote([['put', 'categorias', obj]]);
      if (!c) ctx.dados.categorias.push(obj);
      else Object.assign(ctx.dados.categorias.find((x) => x.id === id), obj);
    } else {
      await ctx.gravar([['put', 'categorias', obj]]);
    }
    ctx.aviso(c ? 'Categoria atualizada' : 'Categoria criada');
    opcoes.aoSalvar?.(obj);
  };

  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'categorias', { ...c, arquivada: false }]]);
    ctx.aviso('Categoria reativada');
  });
  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Arquivar “${c.nome}”?`, 'Ela deixa de aparecer ao lançar. Os lançamentos antigos continuam com ela. Você pode reativá-la depois.', 'Arquivar', true))) return;
    await ctx.gravar([['put', 'categorias', { ...c, arquivada: true }]]);
    ctx.aviso('Categoria arquivada');
  });
  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Excluir “${c.nome}”?`, 'Esta categoria nunca foi usada em lançamentos. Não dá para desfazer.', 'Excluir', true))) return;
    await ctx.gravar([['del', 'categorias', id]]);
    ctx.aviso('Categoria excluída');
  });
}
