// Ponto de entrada: abre o banco, carrega os dados, controla a navegação por "#/rota".
import * as DB from './db.js';
import { aviso, icone } from './ui.js';
import inicio from './telas/inicio.js';
import lancamentos from './telas/lancamentos.js';
import novo from './telas/novo.js';
import mes from './telas/mes.js';
import contas from './telas/contas.js';
import honorarios from './telas/honorarios.js';
import ajustes from './telas/ajustes.js';
import projecao from './telas/projecao.js';
import semcategoria from './telas/semcategoria.js';
import categorias from './telas/categorias.js';
import caixinha from './telas/caixinhas.js';
import emprestimo from './telas/emprestimos.js';
import honorario from './telas/contrato.js';
import cartao from './telas/cartoes.js';
import * as D from './domain.js';
import { hojeISO } from './format.js';

const ROTAS = { '': inicio, lancamentos, novo, mes, contas, honorarios, ajustes, categorias, caixinha, emprestimo, honorario, cartao, projecao, semcategoria };
// telas que pertencem a "Contas" (o botão da barra inferior continua marcado)
const DENTRO_DE_MES = ['projecao'];
const DENTRO_DE_CONTAS = ['caixinha', 'emprestimo', 'honorarios', 'honorario', 'cartao'];
const raiz = document.getElementById('app');

export const ctx = {
  dados: null,
  ir(rota) { location.hash = '#/' + rota; },
  /** Grava várias operações de uma vez e recarrega a tela. ops: [['put', tabela, obj], ['del', tabela, id]] */
  async gravar(ops) {
    await DB.lote(ops);
    await ctx.recarregar();
  },
  async recarregar() {
    ctx.dados = await DB.carregarTudo();
    // um recarregamento que termina com você já preenchendo um lançamento não pode apagar o formulário
    if (location.hash.startsWith('#/novo') && raiz.querySelector('.fixo-form')) return;
    renderizar();
  },
  DB,
  aviso,
};

function nav(rota) {
  const a = (href, ic, rot, ativo) => `<a href="#/${href}" class="${ativo ? 'ativo' : ''}" ${ativo ? 'aria-current="page"' : ''}>${icone[ic]()}${rot}</a>`;
  return `<nav class="nav" aria-label="Navegação principal">
    ${a('', 'inicio', 'Início', rota === '')}
    ${a('lancamentos', 'lista', 'Lançamentos', rota === 'lancamentos')}
    <a href="#/novo" class="mais" aria-label="Novo lançamento">${icone.mais()}</a>
    ${a('mes', 'mes', 'Mês', rota === 'mes')}
    ${a('contas', 'contas', 'Contas', rota === 'contas')}
  </nav>`;
}

function renderizar() {
  if (!ctx.dados) return;
  const [rota = '', ...args] = location.hash.replace(/^#\/?/, '').split('/');
  const tela = ROTAS[rota] || inicio;
  const r = tela(ctx, args);
  const emNovo = rota === 'novo';
  raiz.innerHTML = emNovo ? r.html : `<main class="tela" id="tela">${r.html}</main>${nav(DENTRO_DE_CONTAS.includes(rota) ? 'contas' : DENTRO_DE_MES.includes(rota) ? 'mes' : ROTAS[rota] ? rota : '')}`;
  document.title = 'Controle Financeiro';
  r.montar?.(raiz);
  if (!emNovo) document.getElementById('tela')?.scrollTo(0, 0);
}

async function iniciar() {
  try {
    await DB.abrir();
    let d = await DB.carregarTudo();
    // dados gravados por versões antigas do app são convertidos uma vez para o formato atual
    const m = D.migrar(d);
    if (m.mudou) { await DB.substituirTudo(m.d); d = await DB.carregarTudo(); }
    // compras recorrentes: completa os meses que faltam nas faturas
    const rec = D.opsRecorrencias(d, hojeISO());
    if (rec.length) { await DB.lote(rec); d = await DB.carregarTudo(); }
    ctx.dados = d;
    navigator.storage?.persist?.();
  } catch (e) {
    raiz.innerHTML = `<main class="tela"><div class="card"><h2>Não foi possível abrir o banco de dados</h2><p class="nota">${String(e)}</p><p class="nota">No iPhone, o modo de navegação privada bloqueia o armazenamento. Abra o app pelo ícone da Tela de Início.</p></div></main>`;
    return;
  }
  // trocar de tela (ex.: gesto de voltar do iPhone) fecha qualquer janela aberta
  window.addEventListener('hashchange', () => { document.querySelectorAll('.fundo').forEach((e) => e.remove()); renderizar(); });
  renderizar();
  if ('serviceWorker' in navigator) {
    // Quando uma versão nova do app é instalada, recarrega para usá-la (menos se você estiver preenchendo um lançamento).
    const tinhaControle = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (tinhaControle && !location.hash.startsWith('#/novo')) location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW:', e));
  }
}

iniciar();
