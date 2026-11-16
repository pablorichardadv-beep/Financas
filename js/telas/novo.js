// Novo lançamento / edição. Rota: #/novo  ou  #/novo/<id>
import { esc } from '../ui.js';
import { num, hojeISO, dataRelativa, norm, novoId } from '../format.js';
import * as D from '../domain.js';

const SIT = {
  despesa: [['pago', 'Paga'], ['aberto', 'A pagar'], ['atrasado', 'Atrasada'], ['guardar', 'Guardar']],
  receita: [['pago', 'Recebida'], ['aberto', 'A receber']],
};

export default function novo(ctx, args) {
  const d = ctx.dados;
  const idEdicao = args[0] || null;
  const f = estadoInicial(d, idEdicao);
  if (f.erroCarga) return { html: `<div class="fixo-form"><div class="form-topo"><a href="#/lancamentos">Voltar</a><h1>Lançamento</h1><span style="width:60px"></span></div><p class="vazio">Lançamento não encontrado.</p></div>` };
  const memoria = D.memoriaDescricoes(d);
  let raiz;

  const contasOpc = (sel, vazio) => (vazio ? `<option value="">${vazio}</option>` : '') + d.contas.map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('');
  const destinoOpc = () =>
    d.contas.map((c) => `<option value="c:${esc(c.id)}" ${f.conta_destino === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('') +
    d.caixinhas.map((c) => `<option value="x:${esc(c.id)}" ${f.destino_caixinha === c.id ? 'selected' : ''}>Caixinha ${esc(c.nome)}</option>`).join('');

  function html() {
    const t = f.tipo;
    const aberto = f.situacao !== 'pago';
    const cats = D.categoriasPorUso(d, t);
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
        <div class="campo sel"><label for="orig">Saiu da conta</label><select id="orig">${contasOpc(f.conta_origem)}</select></div>
        <div class="campo sel"><label for="dest">Entrou em</label><select id="dest"><option value="">Escolher…</option>${destinoOpc()}</select></div></div>
        <div class="campo"><label for="data">Data</label><input id="data" type="date" value="${esc(f.data)}"></div>`);
    } else {
      const mostrarConta = !f.cartao;
      corpo.push(`<div class="${mostrarConta ? 'dois' : ''}">
        ${mostrarConta ? `<div class="campo sel"><label for="conta">${aberto ? 'Conta (opcional)' : t === 'despesa' ? 'Saiu da conta' : 'Entrou na conta'}</label><select id="conta">${contasOpc(f.conta, aberto ? 'Definir depois' : '')}</select></div>` : ''}
        <div class="campo"><label for="data">${aberto ? 'Vencimento' : f.cartao ? 'Data da compra' : 'Data'}</label><input id="data" type="date" value="${esc(f.data)}"></div></div>`);
      corpo.push(`<div class="campo" style="gap:10px;padding-bottom:14px"><span class="rot">Categoria</span><div class="chips" role="group" aria-label="Categoria">${cats.map((c) => `<button class="chip ${f.categoria === c.id ? 'on' : ''}" data-cat="${esc(c.id)}" aria-pressed="${f.categoria === c.id}">${esc(c.nome)}</button>`).join('')}</div></div>`);
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
    if (dados.tipo === 'transferencia' && !dados.descricao) dados.descricao = 'Transferência entre contas';
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
    } else {
      const id = base && !eraCartao ? base : novoId('l');
      const l = { id, tipo: dados.tipo, data: dados.data, descricao: dados.descricao.trim(), valor: dados.valor };
      if (dados.tipo === 'transferencia') {
        l.conta_origem = dados.conta_origem; l.conta_destino = dados.conta_destino || null; l.situacao = 'pago';
        if (dados.destino_caixinha) l.destino_caixinha = dados.destino_caixinha;
      } else {
        l.conta = dados.conta || null; l.categoria = dados.categoria || null; l.situacao = dados.situacao;
        if (dados.situacao !== 'pago') l.mes = dados.data.slice(0, 7);
      }
      // preserva campos antigos (origem na planilha etc.) ao editar
      const antigo = base && !eraCartao ? d.lancamentos.find((x) => x.id === base) : null;
      ops.push(['put', 'lancamentos', antigo ? { ...antigo, ...l, ...(dados.tipo !== 'transferencia' ? { conta_origem: undefined, conta_destino: undefined, destino_caixinha: undefined } : {}) } : l]);
      if (base && eraCartao) ops.push(['del', 'compras_cartao', base]);
      // transferência para caixinha: cria/atualiza o aporte na caixinha
      for (const m of d.caixinha_movimentos) if (m.lancamento_id === id) ops.push(['del', 'caixinha_movimentos', m.id]);
      if (dados.tipo === 'transferencia' && dados.destino_caixinha) {
        ops.push(['put', 'caixinha_movimentos', { id: novoId('c'), caixinha: dados.destino_caixinha, data: dados.data, descricao: l.descricao, valor: dados.valor, lancamento_id: id }]);
      }
    }
    try {
      await ctx.gravar(ops.filter(Boolean));
      ctx.aviso(idEdicao ? 'Alterações salvas' : 'Lançamento salvo');
      ctx.ir('');
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
      f.conta = D.ultimaContaUsada(d, f.tipo === 'transferencia' ? 'despesa' : f.tipo) || f.conta || 'itau';
      f.conta_origem = f.conta;
      redesenhar();
    }));
    raiz.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { f.categoria = f.categoria === b.dataset.cat ? null : b.dataset.cat; f.catManual = true; redesenhar(); }));
    raiz.querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => { f.situacao = b.dataset.sit; redesenhar(); }));
    q('[data-cartao]')?.addEventListener('click', () => { f.cartao = !f.cartao; if (f.cartao) f.situacao = 'pago'; redesenhar(); });

    const valor = q('#valor');
    // Cada dígito entra como centavo (estilo app de banco), sempre no fim, onde quer que o toque tenha caído.
    valor.addEventListener('beforeinput', (e) => {
      if (e.inputType === 'insertText' && /^\d$/.test(e.data ?? '')) {
        if (String(f.valor).length < 10) f.valor = f.valor * 10 + Number(e.data);
      } else if (e.inputType === 'deleteContentBackward') {
        f.valor = Math.floor(f.valor / 10);
      } else if (e.inputType === 'insertText' || e.inputType.startsWith('delete')) {
        // ignora letras e outras teclas
      } else return; // colar etc. caem no tratamento do evento "input"
      e.preventDefault();
      valor.value = 'R$ ' + num(f.valor);
    });
    valor.addEventListener('input', () => {
      const digitos = valor.value.replace(/\D/g, '').slice(0, 10);
      f.valor = parseInt(digitos || '0', 10);
      valor.value = 'R$ ' + num(f.valor);
    });
    valor.addEventListener('focus', () => setTimeout(() => valor.setSelectionRange(valor.value.length, valor.value.length), 0));

    q('#desc')?.addEventListener('input', (e) => { f.descricao = e.target.value; });
    q('#desc')?.addEventListener('change', () => { aplicarMemoria(); });
    q('#data')?.addEventListener('change', (e) => { f.data = e.target.value; });
    q('#conta')?.addEventListener('change', (e) => { f.conta = e.target.value; f.contaManual = true; });
    q('#orig')?.addEventListener('change', (e) => { f.conta_origem = e.target.value; });
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
    tipo: 'despesa', valor: 0, descricao: '', data: hojeISO(), conta: D.ultimaContaUsada(d, 'despesa') || 'itau', conta_origem: null,
    conta_destino: null, destino_caixinha: null, categoria: null, situacao: 'pago', cartao: false, catManual: false, contaManual: false,
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
  return {
    ...base, tipo: l.tipo, valor: l.valor, descricao: l.descricao || '', data: l.data || (l.mes ? `${l.mes}-01` : hojeISO()),
    conta: l.conta || null, conta_origem: l.conta_origem || null, conta_destino: l.conta_destino || null, destino_caixinha: l.destino_caixinha || null,
    categoria: l.categoria || null, situacao: l.situacao === 'guardar' && l.tipo === 'receita' ? 'pago' : l.situacao, catManual: true, contaManual: true,
  };
}
