// Cartões de crédito: tela do cartão (faturas e compras) e cadastro. Rota: #/cartao/<id>
import { esc, folha, confirmar, ligarCampoValor } from '../ui.js';
import { reais, hojeISO, dataBR, mesNome } from '../format.js';
import * as D from '../domain.js';
import { nomes, linhaItem } from './comum.js';
import { abrirDetalhe } from './detalhe.js';
import { prepararNovo } from './novo.js';

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
let mesEscolhido = null;   // mês da fatura aberta na tela (vale enquanto o app estiver aberto)
let cartaoDoMes = null;

export default function cartao(ctx, args) {
  const d = ctx.dados;
  const c = d.cartoes.find((x) => x.id === args[0]);
  if (!c) {
    return { html: '<header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Cartão</h1></div></header><p class="vazio">Cartão não encontrado.</p>' };
  }
  const hoje = hojeISO();
  const faturas = D.faturasDoCartao(d, c);
  const atual = D.faturaAtualDoCartao(d, c, hoje);
  if (cartaoDoMes !== c.id) { mesEscolhido = null; cartaoDoMes = c.id; }
  const meses = [...new Set([atual, ...faturas.map((f) => f.mes)])].sort().reverse();
  if (!mesEscolhido || !meses.includes(mesEscolhido)) mesEscolhido = atual;
  const f = faturas.find((x) => x.mes === mesEscolhido) || { mes: mesEscolhido, compras: [], total: 0, ...D.datasDaFatura(c, mesEscolhido) };
  const n = nomes(d);
  const emAberto = f.fechamento >= hoje;
  const recs = d.recorrencias.filter((r) => r.cartao === c.id && r.ativa);

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">${esc(c.banco)}</h1></div><button class="link" data-editar>Editar</button></header>
    <p class="nota" style="margin-top:-6px">${esc(c.bandeira)} · final ${esc(c.final)} · vence dia ${c.vencimento} · fecha dia ${c.fechamento}${c.arquivado ? ' · arquivado' : ''}</p>
    <div class="filtros"><label class="pilula on">Fatura de ${esc(mesNome(mesEscolhido))}<select data-mes aria-label="Fatura">${meses.map((m) => `<option value="${m}" ${m === mesEscolhido ? 'selected' : ''}>${esc(mesNome(m))}</option>`).join('')}</select></label></div>
    <section class="saldo" aria-label="Fatura">
      <div><div class="eyebrow">FATURA ${esc(mesNome(mesEscolhido).toUpperCase())}</div><div class="valor">${reais(f.total)}</div></div>
      <div class="grade">
        <div><span>Vencimento</span><span>${dataBR(f.vencimento)}</span></div>
        <div><span>${emAberto ? 'Fecha em' : 'Fechou em'}</span><span>${dataBR(f.fechamento)}</span></div>
      </div>
    </section>
    <button class="btn" data-compra>+ Compra neste cartão</button>
    <section class="card" style="gap:2px"><h2>Compras da fatura</h2>
      <div class="lista">${f.compras.length ? f.compras.map((k) => linhaItem({ id: k.id, tipo: 'cartao', data: null, data_compra: k.data, mes: k.fatura, descricao: k.descricao, valor: k.valor, categoria: k.categoria, situacao: 'cartao', cartao_id: null }, n, { comData: true })).join('') : '<p class="vazio">Nenhuma compra nesta fatura.</p>'}</div></section>
    ${recs.length ? `<section class="card" style="gap:2px"><h2>Compras recorrentes</h2>
      <div class="lista">${recs.map((r) => `<button class="item" data-rec="${esc(r.id)}"><span class="t"><b>${esc(r.descricao)}</b><small>todo dia ${r.dia}${n.cat.get(r.categoria) ? ' · ' + esc(n.cat.get(r.categoria).nome) : ''}</small></span><span class="v verm">${reais(r.valor)} <span class="rot">›</span></span></button>`).join('')}</div>
      <p class="nota">Cai todo mês na fatura até você cancelar. Toque para mudar o valor ou cancelar.</p></section>` : ''}
    <p class="nota" style="text-align:center">Compras feitas até o dia ${c.fechamento} entram na fatura que vence no mesmo mês ou no seguinte, conforme o seu vencimento. Elas saem da conta quando você lança o pagamento da fatura (ex.: “Cartão ${esc(c.banco)}”).</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-editar]').onclick = () => abrirEditorCartao(ctx, c.id);
      raiz.querySelector('[data-mes]').addEventListener('change', (e) => { mesEscolhido = e.target.value; ctx.recarregar(); });
      raiz.querySelector('[data-compra]').onclick = () => { prepararNovo({ cartao: true, cartao_id: c.id }); ctx.ir('novo'); };
      raiz.querySelectorAll('[data-rec]').forEach((b) => (b.onclick = () => abrirRecorrencia(ctx, b.dataset.rec)));
      raiz.querySelectorAll('.item[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
    },
  };
}

// ---------------------------------------------------------------- cadastro
// semRender: grava sem redesenhar a tela (usado dentro do formulário de lançamento, para não perder o que foi digitado)
export function abrirEditorCartao(ctx, id = null, { aoSalvar, semRender = false } = {}) {
  const d = ctx.dados;
  const c = id ? d.cartoes.find((x) => x.id === id) : null;
  if (id && !c) return;
  const rem = c ? D.remocaoCartao(d, id) : null;
  const bancos = [...new Set([...d.cartoes.map((x) => x.banco), ...d.caixinhas.map((x) => x.banco).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  let acoes = '';
  if (c?.arquivado) {
    acoes = '<button class="btn sec" data-reativar>Reativar cartão</button>';
  } else if (c && rem.acao === 'excluir') {
    acoes = '<p class="nota">Este cartão ainda não tem compras. Você pode excluí-lo.</p><button class="btn perigo" data-excluir>Excluir cartão</button>';
  } else if (c) {
    acoes = `<p class="nota">Este cartão tem ${plural(rem.compras, 'compra', 'compras')} lançadas, por isso não pode ser apagado. Arquivando, ele some dos formulários e o histórico continua.</p><button class="btn perigo" data-arquivar>Arquivar cartão</button>`;
  }

  const f = folha(`
    <h2>${c ? 'Editar cartão' : 'Novo cartão'}${c?.arquivado ? ' (arquivado)' : ''}</h2>
    <div class="campo"><label for="cb">Banco</label><input id="cb" maxlength="30" autocomplete="off" autocapitalize="words" placeholder="Ex.: Nubank" value="${esc(c?.banco || '')}"></div>
    ${bancos.length ? `<div class="chips" role="group" aria-label="Bancos">${bancos.map((b) => `<button class="chip" data-banco="${esc(b)}">${esc(b)}</button>`).join('')}</div>` : ''}
    <div class="dois">
      <div class="campo sel"><label for="cg">Bandeira</label><select id="cg"><option value="">Escolher…</option>${D.BANDEIRAS.map((b) => `<option value="${esc(b)}" ${c?.bandeira === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
      <div class="campo"><label for="cf">4 últimos dígitos</label><input id="cf" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="1234" value="${esc(c?.final || '')}"></div></div>
    <div class="dois">
      <div class="campo"><label for="cv">Dia do vencimento</label><input id="cv" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 10" value="${c?.vencimento || ''}"></div>
      <div class="campo"><label for="cx">Dia do fechamento</label><input id="cx" type="number" inputmode="numeric" min="1" max="31" placeholder="Ex.: 3" value="${c?.fechamento || ''}"></div></div>
    <p class="nota" id="cdica">O fechamento define em qual fatura cada compra entra. Se você não souber, deixe o sugerido (7 dias antes do vencimento) e confira no app do banco.</p>
    <div class="erro" id="ce" role="alert"></div>
    <button class="btn" data-salvar>${c ? 'Salvar alterações' : 'Cadastrar cartão'}</button>
    ${acoes}`);
  const q = (s) => f.el.querySelector(s);

  // o fechamento acompanha o vencimento até você digitar um valor próprio
  let fechamentoManual = Boolean(c);
  q('#cx').addEventListener('input', () => { fechamentoManual = true; });
  q('#cv').addEventListener('input', () => {
    const v = Number.parseInt(q('#cv').value, 10);
    if (!fechamentoManual && v >= 1 && v <= 31) q('#cx').value = D.fechamentoSugerido(v);
  });
  q('#cf').addEventListener('input', () => { q('#cf').value = q('#cf').value.replace(/\D/g, '').slice(0, 4); });
  f.el.querySelectorAll('[data-banco]').forEach((b) => (b.onclick = () => { q('#cb').value = b.dataset.banco; }));

  const ler = () => ({ id, banco: q('#cb').value, bandeira: q('#cg').value, final: q('#cf').value, vencimento: Number.parseInt(q('#cv').value, 10), fechamento: Number.parseInt(q('#cx').value, 10) });
  q('[data-salvar]').onclick = async () => {
    const v = D.validarCartao(d, ler());
    if (v.erro) { q('#ce').textContent = v.erro; return; }
    f.fechar();
    if (c) {
      await ctx.gravar([['put', 'cartoes', { ...c, ...v.ok }]]);
      ctx.aviso('Cartão atualizado');
      aoSalvar?.(c.id);
      return;
    }
    const novo = { id: D.idUnicoCartao(d, v.ok.banco, v.ok.final), ...v.ok };
    if (semRender) { await ctx.DB.lote([['put', 'cartoes', novo]]); ctx.dados.cartoes.push(novo); } else await ctx.gravar([['put', 'cartoes', novo]]);
    ctx.aviso('Cartão cadastrado');
    aoSalvar?.(novo.id);
  };

  q('[data-arquivar]')?.addEventListener('click', async () => {
    f.fechar();
    await ctx.gravar([['put', 'cartoes', { ...c, arquivado: true }]]);
    ctx.aviso('Cartão arquivado');
  });
  q('[data-reativar]')?.addEventListener('click', async () => {
    f.fechar();
    const { arquivado, ...resto } = c;
    await ctx.gravar([['put', 'cartoes', resto]]);
    ctx.aviso('Cartão reativado');
  });
  q('[data-excluir]')?.addEventListener('click', async () => {
    f.fechar();
    if (!(await confirmar(`Excluir o cartão ${D.rotuloCartao(c)}?`, 'Não dá para desfazer.', 'Excluir', true))) return;
    ctx.ir('contas');
    await ctx.gravar([['del', 'cartoes', id]]);
    ctx.aviso('Cartão excluído');
  });
}

// ---------------------------------------------------------------- compra recorrente: mudar valor ou cancelar
export function abrirRecorrencia(ctx, id) {
  const d = ctx.dados;
  const r = d.recorrencias.find((x) => x.id === id);
  const c = r && d.cartoes.find((x) => x.id === r.cartao);
  if (!r || !c) return;
  const hoje = hojeISO();
  const futuras = d.compras_cartao.filter((k) => k.recorrencia === r.id && k.data > hoje);
  const f = folha(`
    <div><h2>${esc(r.descricao)}</h2><p class="rot">${esc(D.rotuloCartao(c))} · todo dia ${r.dia} · desde ${esc(dataBR(r.inicio))}${r.ativa ? '' : ' · cancelada'}</p></div>
    ${r.ativa ? `<div class="campo"><label for="rv">Valor de cada mês</label><input id="rv" inputmode="numeric" autocomplete="off" aria-label="Valor mensal em reais"></div>
      <div class="erro" id="re" role="alert"></div>
      <button class="btn" data-salvar>Salvar novo valor</button>
      <p class="nota">O novo valor vale a partir das próximas cobranças (${plural(futuras.length, 'cobrança já lançada', 'cobranças já lançadas')} nas faturas futuras). As anteriores não mudam.</p>
      <button class="btn perigo" data-cancelar>Cancelar recorrência</button>` : '<p class="nota">Esta compra recorrente foi cancelada.</p>'}
    <button class="btn sec" data-fechar>Fechar</button>`);
  const q = (s) => f.el.querySelector(s);
  q('[data-fechar]').onclick = f.fechar;
  if (!r.ativa) return;
  const valor = ligarCampoValor(q('#rv'), r.valor, undefined, { substituir: true });
  q('[data-salvar]').onclick = async () => {
    if (!(valor.obter() > 0)) { q('#re').textContent = 'Informe o valor.'; return; }
    f.fechar();
    await ctx.gravar(D.opsValorRecorrencia(d, r, valor.obter(), hoje));
    ctx.aviso('Valor atualizado');
  };
  q('[data-cancelar]').onclick = async () => {
    f.fechar();
    if (!(await confirmar(`Cancelar “${r.descricao}”?`, `Para de cair todo mês. ${plural(futuras.length, 'cobrança futura sai', 'cobranças futuras saem')} das faturas; o que já foi lançado até hoje continua.`, 'Cancelar recorrência', true))) return;
    await ctx.gravar(D.opsCancelarRecorrencia(d, r, hoje));
    ctx.aviso('Recorrência cancelada');
  };
}
