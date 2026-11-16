// Novo lançamento / edição. Rota: #/novo  ou  #/novo/<id>
import { esc, ligarCampoValor } from '../ui.js';
import { abrirEditorCategoria } from './cadastros.js';
import { num, hojeISO, dataRelativa, norm, novoId } from '../format.js';
import * as D from '../domain.js';
import { mostrarMesNaLista } from './lancamentos.js';

const SIT = {
  despesa: [['pago', 'Paga'], ['aberto', 'A pagar'], ['atrasado', 'Atrasada'], ['guardar', 'Guardar']],
  receita: [['pago', 'Recebida'], ['aberto', 'A receber']],
};

export default function novo(ctx, args) {
  const d = ctx.dados;
  const idEdicao = args[0] || null;
  const f = estadoInicial(d, idEdicao);
  if (f.erroCarga) return { html: `<div class="fixo-form"><div class="form-topo"><a href="#/lancamentos">Voltar</a><h1>Lançamento</h1><span style="width:60px"></span></div><p class="vazio">${esc(f.mensagem || 'Lançamento não encontrado.')}</p></div>` };
  const memoria = D.memoriaDescricoes(d);
  let raiz;

  const contasOpc = (sel, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + D.contasAtivas(d, sel).map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  const caixinhasAtivas = (manter) => d.caixinhas.filter((c) => !c.arquivada || c.id === manter);
  const origemOpc = () =>
    D.contasAtivas(d, f.conta_origem).map((c) => `<option value="${esc(c.id)}" ${f.conta_origem === c.id && !f.origem_caixinha ? 'selected' : ''}>${esc(c.nome)}</option>`).join('') +
    caixinhasAtivas(f.origem_caixinha).map((c) => `<option value="x:${esc(c.id)}" ${f.origem_caixinha === c.id ? 'selected' : ''}>Caixinha ${esc(D.rotuloCaixinha(c))}</option>`).join('');
  const destinoOpc = () =>
    D.contasAtivas(d, f.conta_destino).map((c) => `<option value="c:${esc(c.id)}" ${f.conta_destino === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('') +
    caixinhasAtivas(f.destino_caixinha).map((c) => `<option value="x:${esc(c.id)}" ${f.destino_caixinha === c.id ? 'selected' : ''}>Caixinha ${esc(D.rotuloCaixinha(c))}</option>`).join('');

  function html() {
    const t = f.tipo;
    const aberto = f.situacao !== 'pago';
    const cats = D.categoriasPorUso(d, t, f.categoria);
    const sits = SIT[t] || [];
    const corpo = [];

    corpo.push(`<div class="seg t-${t}" role="group" aria-label="Tipo de lançamento">
      ${['despesa', 'receita', 'transferencia'].map((x) => `<button data-tipo="${x}" class="${t === x ? 'on' : ''}" aria-pressed="${t === x}">${{ despesa: 'Despesa', receita: 'Receita', transferencia: 'Transferência' }[x]}</button>`).join('')}</div>`);
    corpo.push(`<div class="valor-box ${t}"><label for="valor">Valor</label><input id="valor" inputmode="numeric" autocomplete="off" value="R$ ${num(f.valor)}" aria-label="Valor em reais"></div>`);

    if (t !== 'transferencia') {
      corpo.push(`<div class="campo"><label for="desc">Descrição</label><input id="desc" list="sugestoes" autocomplete="off" autocapitalize="sentences" placeholder="Ex.: Supermercado" value="${esc(f.descricao)}"><datalist id="sugestoes">${[...memoria.values()].filter((m) => m.tipo === t).slice(-300).map((m) => `<option value="${esc(m.descricao)}">`).join('')}</datalist></div>`);
    }

    if (t === 'transferencia') {
      corpo.push(`<div class="dois">
        <div class="campo sel"><label for="orig">Saiu de</label><select id="orig">${origemOpc()}</select></div>
        <div class="campo sel"><label for="dest">Entrou em</label><select id="dest"><option value="">Escolher…</option>${destinoOpc()}</select></div></div>
        <div class="campo"><label for="data">Data</label><input id="data" type="date" value="${esc(f.data)}"></div>`);
    } else {
      const mostrarConta = !f.cartao;
      corpo.push(`<div class="${mostrarConta ? 'dois' : ''}">
        ${mostrarConta ? `<div class="campo sel"><label for="conta">${aberto ? 'Conta (opcional)' : t === 'despesa' ? 'Saiu da conta' : 'Entrou na conta'}</label><select id="conta">${contasOpc(f.conta, aberto ? 'Definir depois' : '')}</select></div>` : ''}
        <div class="campo"><label for="data">${aberto ? 'Vencimento' : f.cartao ? 'Data da compra' : 'Data'}</label><input id="data" type="date" value="${esc(f.data)}"></div></div>`);
      corpo.push(`<div class="campo" style="gap:10px;padding-bottom:14px"><span class="rot">Categoria</span><div class="chips" role="group" aria-label="Categoria">${cats.map((c) => `<button class="chip ${f.categoria === c.id ? 'on' : ''}" data-cat="${esc(c.id)}" aria-pressed="${f.categoria === c.id}">${esc(c.nome)}</button>`).join('')}<button class="chip add" data-nova-cat aria-label="Criar nova categoria">+ Nova</button></div></div>`);
      if (!f.cartao && sits.length) {
        corpo.push(`<div class="campo" style="gap:10px;padding-bottom:12px"><span class="rot">Situação</span><div class="seg peq" role="group" aria-label="Situação">${sits.map(([v, r]) => `<button data-sit="${v}" class="${f.situacao === v ? 'on s-' + v : ''}" aria-pressed="${f.situacao === v}">${r}</button>`).join('')}</div></div>`);
      }
      if (t === 'despesa') {
        corpo.push(`<div class="campo"><div class="chave"><span>Foi no cartão de crédito</span><button data-cartao class="${f.cartao ? 'on' : ''}" role="switch" aria-checked="${f.cartao}" aria-label="Compra no cartão de crédito"></button></div>${f.cartao ? '<p class="nota" style="margin:-4px 0 4px">Entra na fatura do mês e só sai da conta quando você lançar o pagamento da fatura.</p>' : ''}</div>`);
      }
    }

    return `<div class="fixo-form">
      <div class="form-topo"><a href="#/lancamentos" data-cancelar>Cancelar</a><h1>${idEdicao ? 'Editar lançamento' : 'Novo lançamento'}</h1><span style="width:60px"></span></div>
      <div class="corpo">${corpo.join('')}</div>
      <div class="rodape"><div class="erro" id="erro" role="alert"></div><button class="btn" data-salvar>${idEdicao ? 'Salvar alterações' : 'Salvar'}</button></div></div>`;
  }

  function redesenhar() {
    const rolagem = raiz.querySelector('.corpo')?.scrollTop || 0;
    raiz.innerHTML = html();
    raiz.querySelector('.corpo').scrollTop = rolagem;
    ligar();
  }

  function aplicarMemoria() {
    if (f.tipo === 'transferencia') return;
    const m = memoria.get(norm(f.descricao));
    if (!m || m.tipo !== f.tipo) return;
    if (!f.catManual && m.categoria) {
      f.categoria = m.categoria;
      raiz.querySelectorAll('[data-cat]').forEach((b) => { const on = b.dataset.cat === f.categoria; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    }
    if (!f.contaManual && m.conta && f.situacao === 'pago') {
      f.conta = m.conta;
      const s = raiz.querySelector('#conta');
      if (s) s.value = m.conta;
    }
  }

  async function salvar() {
    const msg = raiz.querySelector('#erro');
    const dados = { ...f };
    if (dados.tipo === 'transferencia' && !dados.descricao) {
      const cx = (id) => { const c = d.caixinhas.find((x) => x.id === id); return c ? D.rotuloCaixinha(c) : ''; };
      dados.descricao = dados.destino_caixinha ? `Aporte – ${cx(dados.destino_caixinha)}` : dados.origem_caixinha ? `Resgate – ${cx(dados.origem_caixinha)}` : 'Transferência entre contas';
    }
    const v = D.validarLancamento(dados);
    if (v.erro) { msg.textContent = v.erro; return; }
    raiz.querySelector('[data-salvar]').disabled = true;
    const ops = [];
    const eraCartao = idEdicao?.startsWith('k');
    const base = idEdicao || null;

    if (dados.cartao && dados.tipo === 'despesa') {
      const id = eraCartao ? base : novoId('k');
      ops.push(['put', 'compras_cartao', { id, fatura: dados.data.slice(0, 7), data: dados.data, descricao: dados.descricao.trim(), valor: dados.valor, categoria: dados.categoria || null }]);
      if (base && !eraCartao) ops.push(['del', 'lancamentos', base]);
    } else if (dados.tipo === 'transferencia') {
      const idL = base && !eraCartao ? base : null;
      const antigo = idL ? d.lancamentos.find((x) => x.id === idL) : null;
      const origem = dados.origem_caixinha ? { tipo: 'caixinha', id: dados.origem_caixinha } : { tipo: 'conta', id: dados.conta_origem };
      const destino = dados.destino_caixinha ? { tipo: 'caixinha', id: dados.destino_caixinha } : { tipo: 'conta', id: dados.conta_destino };
      ops.push(...D.opsTransferencia(d, { data: dados.data, valor: dados.valor, descricao: dados.descricao.trim(), origem, destino }, { id: idL, antigo }));
      if (base && eraCartao) ops.push(['del', 'compras_cartao', base]);
    } else {
      const id = base && !eraCartao ? base : novoId('l');
      const l = { id, tipo: dados.tipo, data: dados.data, descricao: dados.descricao.trim(), valor: dados.valor };
      l.conta = dados.conta || null; l.categoria = dados.categoria || null; l.situacao = dados.situacao;
      if (dados.situacao !== 'pago') l.mes = dados.data.slice(0, 7);
      // preserva campos antigos (origem na planilha etc.) ao editar; ao deixar de ser transferência, limpa as pontas
      const antigo = base && !eraCartao ? d.lancamentos.find((x) => x.id === base) : null;
      const limpas = Object.fromEntries(D.CHAVES_PONTAS.map((k) => [k, undefined]));
      ops.push(['put', 'lancamentos', antigo ? { ...antigo, ...l, ...limpas } : l]);
      if (base && eraCartao) ops.push(['del', 'compras_cartao', base]);
      // se era transferência para/de caixinha, desfaz os movimentos ligados
      for (const m of d.caixinha_movimentos) if (m.lancamento_id === id) ops.push(['del', 'caixinha_movimentos', m.id]);
      for (const m of d.emprestimo_movimentos) if (m.lancamento_id === id) ops.push(['del', 'emprestimo_movimentos', m.id]);
    }
    try {
      await ctx.gravar(ops.filter(Boolean));
      ctx.aviso(idEdicao ? 'Alterações salvas' : 'Lançamento salvo');
      mostrarMesNaLista(dados.data.slice(0, 7));
      ctx.ir('lancamentos');
    } catch (e) {
      msg.textContent = 'Não foi possível salvar: ' + e;
      raiz.querySelector('[data-salvar]').disabled = false;
    }
  }

  function ligar() {
    const q = (s) => raiz.querySelector(s);
    raiz.querySelectorAll('[data-tipo]').forEach((b) => (b.onclick = () => {
      if (f.tipo === b.dataset.tipo) return;
      f.tipo = b.dataset.tipo;
      f.categoria = null; f.catManual = false; f.contaManual = false;
      if (f.tipo === 'receita' && !['pago', 'aberto'].includes(f.situacao)) f.situacao = 'pago';
      if (f.tipo !== 'despesa') f.cartao = false;
      f.conta = D.ultimaContaUsada(d, f.tipo === 'transferencia' ? 'despesa' : f.tipo) || f.conta || D.contasAtivas(d)[0]?.id || '';
      f.conta_origem = f.conta; f.origem_caixinha = null; f.conta_destino = null; f.destino_caixinha = null;
      redesenhar();
    }));
    raiz.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { f.categoria = f.categoria === b.dataset.cat ? null : b.dataset.cat; f.catManual = true; redesenhar(); }));
    raiz.querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => { f.situacao = b.dataset.sit; redesenhar(); }));
    q('[data-cartao]')?.addEventListener('click', () => { f.cartao = !f.cartao; if (f.cartao) f.situacao = 'pago'; redesenhar(); });

    ligarCampoValor(q('#valor'), f.valor, (v) => { f.valor = v; });
    q('[data-nova-cat]')?.addEventListener('click', () => abrirEditorCategoria(ctx, null, {
      tipo: f.tipo, semRender: true,
      aoSalvar: (cat) => { f.categoria = cat.id; f.catManual = true; redesenhar(); },
    }));

    q('#desc')?.addEventListener('input', (e) => { f.descricao = e.target.value; });
    q('#desc')?.addEventListener('change', () => { aplicarMemoria(); });
    q('#data')?.addEventListener('change', (e) => { f.data = e.target.value; });
    q('#conta')?.addEventListener('change', (e) => { f.conta = e.target.value; f.contaManual = true; });
    q('#orig')?.addEventListener('change', (e) => {
      const v = e.target.value;
      f.origem_caixinha = v.startsWith('x:') ? v.slice(2) : null;
      f.conta_origem = v.startsWith('x:') ? null : v;
    });
    q('#dest')?.addEventListener('change', (e) => {
      const [tp, id] = e.target.value.split(':');
      f.conta_destino = tp === 'c' ? id : null;
      f.destino_caixinha = tp === 'x' ? id : null;
    });
    q('[data-salvar]').onclick = salvar;
  }

  return {
    html: html(),
    montar(r) {
      raiz = r;
      ligar();
      if (!idEdicao) setTimeout(() => raiz.querySelector('#valor')?.focus({ preventScroll: true }), 50);
    },
  };
}

function estadoInicial(d, id) {
  const base = {
    tipo: 'despesa', valor: 0, descricao: '', data: hojeISO(), conta: D.ultimaContaUsada(d, 'despesa') || D.contasAtivas(d)[0]?.id || '', conta_origem: null,
    conta_destino: null, destino_caixinha: null, origem_caixinha: null, categoria: null, situacao: 'pago', cartao: false, catManual: false, contaManual: false,
  };
  base.conta_origem = base.conta;
  if (!id) return base;
  if (id.startsWith('k')) {
    const k = d.compras_cartao.find((x) => x.id === id);
    if (!k) return { erroCarga: true };
    return { ...base, tipo: 'despesa', valor: k.valor, descricao: k.descricao, data: k.data || `${k.fatura}-01`, categoria: k.categoria, cartao: true, catManual: true, contaManual: true };
  }
  const l = d.lancamentos.find((x) => x.id === id);
  if (!l) return { erroCarga: true };
  if (D.ligadaAHonorario(l)) return { erroCarga: true, mensagem: 'Este lançamento é o recebimento de um honorário. Para alterá-lo, abra o honorário em Contas e desfaça o recebimento.' };
  if (D.ligadaAEmprestimo(l)) return { erroCarga: true, mensagem: 'Este lançamento faz parte de um empréstimo. Para alterá-lo, abra o empréstimo em Contas e exclua o movimento.' };
  return {
    ...base, tipo: l.tipo, valor: l.valor, descricao: l.descricao || '', data: l.data || (l.mes ? `${l.mes}-01` : hojeISO()),
    conta: l.conta || null, conta_origem: l.conta_origem || null, conta_destino: l.conta_destino || null, destino_caixinha: l.destino_caixinha || null, origem_caixinha: l.origem_caixinha || null,
    categoria: l.categoria || null, situacao: l.situacao === 'guardar' && l.tipo === 'receita' ? 'pago' : l.situacao, catManual: true, contaManual: true,
  };
}
