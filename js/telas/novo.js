// Novo lançamento / edição. Rota: #/novo  ou  #/novo/<id>
import { esc, ligarCampoValor } from '../ui.js';
import { abrirEditorCategoria } from './cadastros.js';
import { num, hojeISO, dataRelativa, dataBR, mesNome, norm, novoId } from '../format.js';
import * as D from '../domain.js';
import { mostrarMesNaLista } from './lancamentos.js';
import { abrirEditorCartao } from './cartoes.js';

// quem abre o formulário (ex.: a tela do cartão) pode deixá-lo preparado para o próximo lançamento
let preparo = null;
export const prepararNovo = (p) => { preparo = p; };

const SIT = {
  despesa: [['pago', 'Paga'], ['aberto', 'A pagar'], ['atrasado', 'Atrasada'], ['guardar', 'Guardar']],
  receita: [['pago', 'Recebida'], ['aberto', 'A receber']],
};

export default function novo(ctx, args) {
  const d = ctx.dados;
  const idEdicao = args[0] || null;
  const f = estadoInicial(d, idEdicao);
  // quem abriu o formulário (ex.: tela do cartão) pode pedir para voltar para ela depois de salvar
  const voltar = (!idEdicao && preparo && preparo.voltar) || null;
  if (!idEdicao && preparo) { const { voltar: _v, ...resto } = preparo; Object.assign(f, resto); f.tipo = 'despesa'; f.situacao = 'pago'; preparo = null; }
  if (f.cartao && !f.cartao_id && !f.legado) f.cartao_id = D.ultimoCartaoUsado(d);
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

  function textoFatura() {
    const c = d.cartoes.find((x) => x.id === f.cartao_id);
    if (!c) return d.cartoes.length ? 'Escolha o cartão para ver em qual fatura a compra entra.' : 'Cadastre o cartão para a compra entrar na fatura certa.';
    if (!f.data) return '';
    const r = D.faturaDaCompra(c, f.data);
    const base = `Entra na fatura de ${mesNome(r.fatura)} (fecha em ${dataBR(r.fechamento)}, vence em ${dataBR(r.vencimento)}).`;
    return base;
  }

  function textoParcelas() {
    if (idEdicao) return f.parcela_de ? `Esta é a parcela ${f.parcela_de} de uma compra parcelada. Aqui você muda só esta parcela.` : f.recorrencia_de ? 'Esta é uma cobrança de compra recorrente. Aqui você muda só esta cobrança; para mudar o valor das próximas ou cancelar, abra o cartão.' : '';
    if (f.recorrente) {
      const c = d.cartoes.find((x) => x.id === f.cartao_id);
      const ini = c && f.data ? D.faturaDaCompra(c, f.data).fatura : null;
      return `Cai todo mês${f.data ? `, no dia ${Number(f.data.slice(8, 10))}` : ''}${ini ? `, a partir da fatura de ${mesNome(ini)}` : ''}, até você cancelar (na tela do cartão). O valor digitado é o de cada mês.`;
    }
    const n = f.parcelas;
    if (!(n > 1)) return '';
    if (!(f.valor >= n)) return 'Informe o valor total da compra para ver as parcelas.';
    const ps = D.gerarParcelasCompra({ valor: f.valor, qtd: n, fatura: '2000-01' });
    const c = d.cartoes.find((x) => x.id === f.cartao_id);
    const ini = c && f.data ? D.faturaDaCompra(c, f.data).fatura : null;
    const dif = ps[0].valor !== ps[1].valor;
    return `${n}x de R$ ${num(ps[1].valor)}${dif ? ` (a 1ª de R$ ${num(ps[0].valor)})` : ''}, uma em cada fatura${ini ? `, de ${mesNome(ini)} a ${mesNome(D.somarMesFatura(ini, n - 1))}` : ''}. O valor digitado é o total da compra.`;
  }

  function atualizarInfoCartao() {
    const a = raiz.querySelector('#fatura'); if (a) a.textContent = textoFatura();
    const b = raiz.querySelector('#parcelas-info'); if (b) b.textContent = textoParcelas();
  }

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
      corpo.push(`<div class="campo" style="gap:10px;padding-bottom:14px"><span class="rot">${t === 'despesa' ? 'Tipo de despesa' : 'Categoria'}</span><div class="chips" role="group" aria-label="Categoria">${cats.map((c) => `<button class="chip ${f.categoria === c.id ? 'on' : ''}" data-cat="${esc(c.id)}" aria-pressed="${f.categoria === c.id}">${esc(c.nome)}</button>`).join('')}<button class="chip add" data-nova-cat aria-label="Criar nova categoria">+ Nova</button></div></div>`);
      if (!f.cartao && sits.length) {
        corpo.push(`<div class="campo" style="gap:10px;padding-bottom:12px"><span class="rot">Situação</span><div class="seg peq" role="group" aria-label="Situação">${sits.map(([v, r]) => `<button data-sit="${v}" class="${f.situacao === v ? 'on s-' + v : ''}" aria-pressed="${f.situacao === v}">${r}</button>`).join('')}</div></div>`);
      }
      if (t === 'despesa') {
        corpo.push(`<div class="campo"><div class="chave"><span>Foi no cartão de crédito</span><button data-cartao class="${f.cartao ? 'on' : ''}" role="switch" aria-checked="${f.cartao}" aria-label="Compra no cartão de crédito"></button></div>${f.cartao ? '<p class="nota" style="margin:-4px 0 4px">Entra na fatura do cartão e só sai da conta quando você lançar o pagamento da fatura.</p>' : ''}</div>`);
        if (f.cartao) {
          const cs = D.cartoesAtivos(d, f.cartao_id);
          corpo.push(`<div class="${idEdicao || f.recorrente ? '' : 'dois'}" style="align-items:end">
              <div class="campo sel"><label for="cartao">Cartão</label><select id="cartao"><option value="">${f.legado ? 'Sem cartão (compra antiga)' : 'Escolher…'}</option>${cs.map((c) => `<option value="${esc(c.id)}" ${c.id === f.cartao_id ? 'selected' : ''}>${esc(D.rotuloCartao(c))}</option>`).join('')}</select></div>
              ${idEdicao || f.recorrente ? '' : `<div class="campo"><label for="parcelas">Parcelas</label><input id="parcelas" type="number" inputmode="numeric" min="1" max="${D.MAX_PARCELAS}" value="${f.parcelas}" aria-label="Quantidade de parcelas"></div>`}</div>
            <button class="link" data-novo-cartao style="align-self:flex-start">+ Cadastrar cartão</button><p class="nota" id="fatura" aria-live="polite">${esc(textoFatura())}</p><p class="nota" id="parcelas-info" aria-live="polite">${esc(textoParcelas())}</p>
            ${idEdicao ? '' : `<div class="campo"><div class="chave"><span>Compra recorrente (todo mês)</span><button data-recorrente class="${f.recorrente ? 'on' : ''}" role="switch" aria-checked="${f.recorrente}" aria-label="Compra recorrente"></button></div></div>`}`);
        }
      }
    }

    return `<div class="fixo-form">
      <div class="form-topo"><a href="#/${voltar ? voltar.rota : 'lancamentos'}" data-cancelar>Cancelar</a><h1>${idEdicao ? 'Editar lançamento' : 'Novo lançamento'}</h1><span style="width:60px"></span></div>
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

    let mesLista = dados.data.slice(0, 7);
    if (dados.cartao && dados.tipo === 'despesa') {
      const id = eraCartao ? base : novoId('k');
      const c = d.cartoes.find((x) => x.id === dados.cartao_id);
      const antigoK = eraCartao ? d.compras_cartao.find((x) => x.id === base) : null;
      // uma parcela mantém a sua posição: a data é a da compra e a fatura anda um mês por parcela
      const fatura = c ? D.somarMesFatura(D.faturaDaCompra(c, dados.data).fatura, (antigoK?.parcela || 1) - 1) : dados.legadoFatura || dados.data.slice(0, 7);
      mesLista = fatura;
      const registro = { id, cartao: c ? c.id : null, fatura, data: dados.data, descricao: dados.descricao.trim(), valor: dados.valor, categoria: dados.categoria || null };
      if (!eraCartao && c && dados.recorrente) {
        // recorrente: guarda a regra e cria as cobranças dos próximos meses (o app completa os meses seguintes ao abrir)
        const r = { id: novoId('q'), cartao: c.id, descricao: registro.descricao, valor: dados.valor, categoria: dados.categoria || null, dia: Number(dados.data.slice(8, 10)), inicio: dados.data, ativa: true, pulados: [] };
        ops.push(['put', 'recorrencias', r], ...D.opsRecorrencias({ ...d, recorrencias: [r] }, hojeISO()));
      } else if (!eraCartao && c && dados.parcelas > 1) {
        // compra parcelada: o valor é o total; cada parcela vai para uma fatura e leva "(n/N)" na descrição
        const grupo = novoId('g');
        for (const p of D.gerarParcelasCompra({ valor: dados.valor, qtd: dados.parcelas, fatura })) {
          ops.push(['put', 'compras_cartao', { ...registro, id: novoId('k'), valor: p.valor, fatura: p.fatura, descricao: `${registro.descricao} (${p.numero}/${dados.parcelas})`, parcela: p.numero, parcelas: dados.parcelas, grupo }]);
        }
      } else {
        ops.push(['put', 'compras_cartao', antigoK ? { ...antigoK, ...registro } : registro]);
      }
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
      if (voltar) { voltar.aoSalvar?.(mesLista); ctx.ir(voltar.rota); } else { mostrarMesNaLista(mesLista); ctx.ir('lancamentos'); }
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
      if (f.tipo !== 'despesa') { f.cartao = false; f.recorrente = false; }
      f.conta = D.ultimaContaUsada(d, f.tipo === 'transferencia' ? 'despesa' : f.tipo) || f.conta || D.contasAtivas(d)[0]?.id || '';
      f.conta_origem = f.conta; f.origem_caixinha = null; f.conta_destino = null; f.destino_caixinha = null;
      redesenhar();
    }));
    raiz.querySelectorAll('[data-cat]').forEach((b) => (b.onclick = () => { f.categoria = f.categoria === b.dataset.cat ? null : b.dataset.cat; f.catManual = true; redesenhar(); }));
    raiz.querySelectorAll('[data-sit]').forEach((b) => (b.onclick = () => { f.situacao = b.dataset.sit; redesenhar(); }));
    q('[data-cartao]')?.addEventListener('click', () => { f.cartao = !f.cartao; if (!f.cartao) { f.recorrente = false; f.parcelas = 1; } if (f.cartao) { f.situacao = 'pago'; f.cartao_id ||= D.ultimoCartaoUsado(d); } redesenhar(); });
    q('#cartao')?.addEventListener('change', (e) => { f.cartao_id = e.target.value || null; atualizarInfoCartao(); });
    q('[data-recorrente]')?.addEventListener('click', () => { f.recorrente = !f.recorrente; f.parcelas = 1; redesenhar(); });
    q('#parcelas')?.addEventListener('input', (e) => { const n = Number.parseInt(e.target.value, 10); f.parcelas = Number.isNaN(n) ? 0 : n; atualizarInfoCartao(); });
    q('[data-novo-cartao]')?.addEventListener('click', () => abrirEditorCartao(ctx, null, { semRender: true, aoSalvar: (id) => { f.cartao_id = id; redesenhar(); } }));

    ligarCampoValor(q('#valor'), f.valor, (v) => { f.valor = v; atualizarInfoCartao(); });
    q('[data-nova-cat]')?.addEventListener('click', () => abrirEditorCategoria(ctx, null, {
      tipo: f.tipo, semRender: true,
      aoSalvar: (cat) => { f.categoria = cat.id; f.catManual = true; redesenhar(); },
    }));

    q('#desc')?.addEventListener('input', (e) => { f.descricao = e.target.value; });
    q('#desc')?.addEventListener('change', () => { aplicarMemoria(); });
    q('#data')?.addEventListener('change', (e) => { f.data = e.target.value; atualizarInfoCartao(); });
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
    conta_destino: null, destino_caixinha: null, origem_caixinha: null, categoria: null, situacao: 'pago', cartao: false, cartao_id: null, parcelas: 1, recorrente: false, legado: false, legadoFatura: null, catManual: false, contaManual: false,
  };
  base.conta_origem = base.conta;
  if (!id) return base;
  if (id.startsWith('k')) {
    const k = d.compras_cartao.find((x) => x.id === id);
    if (!k) return { erroCarga: true };
    return { ...base, tipo: 'despesa', valor: k.valor, descricao: k.descricao, data: k.data || `${k.fatura}-01`, categoria: k.categoria, cartao: true, cartao_id: k.cartao || null, parcelas: 1, recorrente: false, recorrencia_de: k.recorrencia || null, parcela_de: k.parcela ? `${k.parcela}/${k.parcelas}` : null, legado: !k.cartao, legadoFatura: k.fatura, catManual: true, contaManual: true };
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
