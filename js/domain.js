// Regras e cálculos do controle financeiro. Funções puras: recebem os dados (d) e devolvem números/listas.
// d = { contas, categorias, lancamentos, compras_cartao, caixinhas, caixinha_movimentos, emprestimos, emprestimo_movimentos, honorarios }
// Todos os valores em CENTAVOS.

import { norm, novoId } from './format.js';

const soma = (xs) => xs.reduce((a, b) => a + b, 0);

export const mesDoLanc = (l) => l.mes || (l.data ? l.data.slice(0, 7) : null);
export const estaPago = (l) => l.situacao === 'pago';
/** Em aberto = ainda não saiu/entrou em nenhuma conta ("a pagar", "atrasada", "a receber"). "Guardar" fica de fora. */
export const estaAberto = (l) => l.situacao === 'aberto' || l.situacao === 'atrasado';
export const ehResultado = (l) => l.tipo === 'receita' || l.tipo === 'despesa';

// ---------- saldos ----------
export function saldosContas(d) {
  const s = {};
  for (const c of d.contas) s[c.id] = c.saldo_abertura || 0;
  for (const l of d.lancamentos) {
    if (!estaPago(l)) continue;
    if (l.tipo === 'receita' && l.conta in s) s[l.conta] += l.valor;
    else if (l.tipo === 'despesa' && l.conta in s) s[l.conta] -= l.valor;
    else if (l.tipo === 'transferencia') {
      if (l.conta_origem in s) s[l.conta_origem] -= l.valor;
      if (l.conta_destino in s) s[l.conta_destino] += l.valor;
    }
  }
  return s;
}

/** Quanto um lançamento PAGO mexe no saldo de uma conta (0 se não mexe ou se ainda está em aberto). */
export function efeitoNaConta(l, id) {
  if (!estaPago(l)) return 0;
  if (l.tipo === 'receita') return l.conta === id ? l.valor : 0;
  if (l.tipo === 'despesa') return l.conta === id ? -l.valor : 0;
  if (l.tipo === 'transferencia') return (l.conta_origem === id ? -l.valor : 0) + (l.conta_destino === id ? l.valor : 0);
  return 0;
}

/**
 * Extrato da conta dia a dia.
 *  - base: saldo inicial + o que foi pago sem data;
 *  - dias: [{ data, variacao, saldo }] em ordem crescente, só dias em que a conta se mexeu; saldo = saldo ao fim do dia;
 *  - atual: saldo atual (igual ao de saldosContas).
 */
export function extratoConta(d, id) {
  let base = d.contas.find((c) => c.id === id)?.saldo_abertura || 0;
  const porDia = new Map();
  for (const l of d.lancamentos) {
    const e = efeitoNaConta(l, id);
    if (!e) continue;
    if (!l.data) base += e;
    else porDia.set(l.data, (porDia.get(l.data) || 0) + e);
  }
  let acc = base;
  const dias = [...porDia.keys()].sort().map((data) => {
    acc += porDia.get(data);
    return { data, variacao: porDia.get(data), saldo: acc };
  });
  return { base, dias, atual: acc };
}

/** Saldo da conta antes de começar o dia `data` (ex.: no início do mês). */
export function saldoAntesDe(extrato, data) {
  let s = extrato.base;
  for (const x of extrato.dias) { if (x.data >= data) break; s = x.saldo; }
  return s;
}
export const totalContas = (d) => soma(Object.values(saldosContas(d)));

const maisRecentePrimeiro = (a, b) => (b.data || '').localeCompare(a.data || '') || String(b.id).localeCompare(String(a.id));

// ---------- caixinhas ----------
// caixinha = { id, nome (o motivo, ex.: "Viagem"), banco (ex.: "Itaú"), arquivada? }
// movimento = { id, caixinha, data, valor (+ entra / − sai), tipo: saldo_inicial | aporte | resgate | rendimento, descricao, lancamento_id? }
export function saldosCaixinhas(d) {
  const s = {};
  for (const c of d.caixinhas) s[c.id] = 0;
  for (const m of d.caixinha_movimentos) if (m.caixinha in s) s[m.caixinha] += m.valor;
  return s;
}
export const totalCaixinhas = (d) => soma(Object.values(saldosCaixinhas(d)));
export const rotuloCaixinha = (c) => (c.banco ? `${c.nome} (${c.banco})` : c.nome);

/** Saldo da caixinha considerando só os movimentos até `data` (inclusive). */
export const saldoCaixinhaEm = (d, id, data) => soma(d.caixinha_movimentos.filter((m) => m.caixinha === id && m.data <= data).map((m) => m.valor));

export function resumoCaixinha(d, id) {
  const movs = d.caixinha_movimentos.filter((m) => m.caixinha === id).sort(maisRecentePrimeiro);
  const rend = movs.filter((m) => m.tipo === 'rendimento');
  return {
    movs,
    saldo: soma(movs.map((m) => m.valor)),
    rendimento: soma(rend.map((m) => m.valor)),
    atualizadoEm: rend.length ? rend[0].data : null,
    inicio: movs.length ? movs[movs.length - 1].data : null,
  };
}

/** Bancos já conhecidos (das contas e das caixinhas), para sugerir ao criar uma caixinha. */
export function bancosConhecidos(d) {
  const vistos = new Map();
  for (const c of d.caixinhas) if (c.banco) vistos.set(norm(c.banco), c.banco);
  for (const c of d.contas) if (c.tipo !== 'dinheiro' && !c.arquivada && !vistos.has(norm(c.nome))) vistos.set(norm(c.nome), c.nome);
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------- empréstimos ----------
// emprestimo = { id, nome, sentido: 'dado' (emprestei, tenho a receber) | 'tomado' (peguei emprestado, devo), arquivada? }
// movimento = { id, emprestimo, data, valor, tipo: principal | pagamento, descricao, lancamento_id? }
// O valor do movimento é o efeito no patrimônio: dinheiro que VAI para o empréstimo é positivo (emprestei / paguei),
// dinheiro que VEM dele é negativo (recebi / peguei). Assim o saldo é sempre a soma dos movimentos:
// positivo = a receber, negativo = a pagar.
export function saldosEmprestimos(d) {
  const s = {};
  for (const e of d.emprestimos) s[e.id] = 0;
  for (const m of d.emprestimo_movimentos) if (m.emprestimo in s) s[m.emprestimo] += m.valor;
  return s;
}
export const saldoEmprestimo = (d, id) => soma(d.emprestimo_movimentos.filter((m) => m.emprestimo === id).map((m) => m.valor));
export const totalEmprestimos = (d) => soma(Object.values(saldosEmprestimos(d)));

export function resumoEmprestimo(d, e) {
  const movs = d.emprestimo_movimentos.filter((m) => m.emprestimo === e.id).sort(maisRecentePrimeiro);
  const saldo = soma(movs.map((m) => m.valor));
  const principal = soma(movs.filter((m) => m.tipo === 'principal').map((m) => Math.abs(m.valor)));
  const pago = soma(movs.filter((m) => m.tipo === 'pagamento').map((m) => Math.abs(m.valor)));
  return { movs, saldo, principal, pago, quitado: movs.length > 0 && saldo === 0, ultimo: movs.length ? movs[0].data : null };
}

/** direcao: 'para' = dinheiro vai para o empréstimo (emprestei / paguei); 'de' = vem dele (recebi / peguei). */
export function movimentoEmprestimo(e, direcao, valor) {
  const principal = e.sentido === 'tomado' ? direcao === 'de' : direcao === 'para';
  return { valor: direcao === 'para' ? valor : -valor, tipo: principal ? 'principal' : 'pagamento' };
}

export function emAberto(d) {
  let aReceber = 0;
  let aPagar = 0;
  for (const l of d.lancamentos) {
    if (!estaAberto(l)) continue;
    if (l.tipo === 'receita') aReceber += l.valor;
    else if (l.tipo === 'despesa') aPagar += l.valor;
  }
  return { aReceber, aPagar, liquido: aReceber - aPagar };
}

export function saldoGeral(d) {
  const contas = totalContas(d);
  const caixinhas = totalCaixinhas(d);
  const emprestimo = totalEmprestimos(d);
  const aberto = emAberto(d).liquido;
  return { contas, caixinhas, emprestimo, aberto, total: contas + caixinhas + emprestimo + aberto };
}

// ---------- mês ----------
export function resumoMes(d, mes) {
  let rec = 0, recPago = 0, desp = 0, despPago = 0;
  for (const l of d.lancamentos) {
    if (!ehResultado(l) || mesDoLanc(l) !== mes) continue;
    if (l.tipo === 'receita') { rec += l.valor; if (estaPago(l)) recPago += l.valor; }
    else { desp += l.valor; if (estaPago(l)) despPago += l.valor; }
  }
  return {
    receitas: rec, recebido: recPago, aReceber: rec - recPago,
    despesas: desp, pagas: despPago, aPagar: desp - despPago,
    saldo: rec - desp,
  };
}

/** "A pagar" do mês, com o que está atrasado (marcado como atrasada ou com data já vencida). */
export function aPagarMes(d, mes, hoje) {
  let total = 0, atrasado = 0;
  for (const l of d.lancamentos) {
    if (l.tipo !== 'despesa' || !estaAberto(l) || mesDoLanc(l) !== mes) continue;
    total += l.valor;
    if (l.situacao === 'atrasado' || (l.data && l.data < hoje)) atrasado += l.valor;
  }
  return { total, atrasado };
}

export function despesasPorCategoria(d, mes) {
  const porCat = new Map();
  for (const l of d.lancamentos) {
    if (l.tipo !== 'despesa' || mesDoLanc(l) !== mes) continue;
    porCat.set(l.categoria || '', (porCat.get(l.categoria || '') || 0) + l.valor);
  }
  const nome = new Map(d.categorias.map((c) => [c.id, c.nome]));
  const total = soma([...porCat.values()]);
  return [...porCat.entries()]
    .map(([id, valor]) => ({ id, nome: nome.get(id) || 'Sem categoria', valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export const faturaCartao = (d, mes) => soma(d.compras_cartao.filter((k) => k.fatura === mes).map((k) => k.valor));

// ---------- honorários ----------
export function resumoHonorarios(d, hoje) {
  let aReceber = 0, atrasado = 0, calote = 0;
  for (const h of d.honorarios) {
    if (h.status === 'calote') { calote += h.valor; continue; }
    if (h.status === 'pago') continue;
    aReceber += h.valor;
    if (h.vencimento && h.vencimento < hoje) atrasado += h.valor;
  }
  return { aReceber, atrasado, calote };
}

// ---------- listas e apoio ao formulário ----------
export function mesesDisponiveis(d, mesAtual) {
  const set = new Set([mesAtual]);
  for (const l of d.lancamentos) { const m = mesDoLanc(l); if (m) set.add(m); }
  for (const k of d.compras_cartao) set.add(k.fatura);
  return [...set].sort().reverse();
}

/** Lançamentos + compras no cartão numa lista única (cartão aparece com tipo "cartao"). */
export function itensDaLista(d) {
  const cartao = d.compras_cartao.map((k) => ({
    id: k.id, tipo: 'cartao', data: null, mes: k.fatura, descricao: k.descricao, valor: k.valor,
    categoria: k.categoria, conta: null, situacao: 'cartao',
  }));
  return [...d.lancamentos, ...cartao];
}

/** Categorias ordenadas pelas mais usadas (para os chips do formulário). Arquivadas ficam de fora, exceto `manterId`. */
export function categoriasPorUso(d, tipo, manterId = null) {
  const uso = new Map();
  for (const l of itensDaLista(d)) if (l.categoria) uso.set(l.categoria, (uso.get(l.categoria) || 0) + 1);
  const alvo = tipo === 'receita' ? 'receita' : 'despesa';
  return d.categorias
    .filter((c) => c.tipo === alvo && (!c.arquivada || c.id === manterId))
    .sort((a, b) => (uso.get(b.id) || 0) - (uso.get(a.id) || 0) || a.codigo - b.codigo);
}

/** Última categoria/conta usada para cada descrição (preenche o formulário sozinho). */
export function memoriaDescricoes(d) {
  const ordenados = [...d.lancamentos].filter(ehResultado).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const mem = new Map();
  for (const l of ordenados) mem.set(norm(l.descricao), { descricao: l.descricao, tipo: l.tipo, categoria: l.categoria, conta: l.conta });
  return mem;
}

export function ultimaContaUsada(d, tipo) {
  const l = [...d.lancamentos].filter((x) => x.tipo === tipo && x.conta && estaPago(x)).sort((a, b) => (b.data || '').localeCompare(a.data || ''))[0];
  const c = l && d.contas.find((x) => x.id === l.conta);
  return c && !c.arquivada ? c.id : null;
}

/** Valida e normaliza um lançamento vindo do formulário. Devolve { erro } ou { ok: objeto }. */
export function validarLancamento(f) {
  if (!(f.valor > 0)) return { erro: 'Informe um valor maior que zero.' };
  if (f.tipo !== 'transferencia' && !String(f.descricao || '').trim()) return { erro: 'Informe a descrição.' };
  if (!f.data) return { erro: 'Informe a data.' };
  if (f.tipo === 'transferencia') {
    if (!f.conta_origem && !f.origem_caixinha) return { erro: 'Escolha a origem.' };
    if (!f.conta_destino && !f.destino_caixinha) return { erro: 'Escolha o destino.' };
    if (f.conta_destino && f.conta_destino === f.conta_origem) return { erro: 'Origem e destino precisam ser diferentes.' };
    if (f.destino_caixinha && f.destino_caixinha === f.origem_caixinha) return { erro: 'Origem e destino precisam ser diferentes.' };
  } else if (f.situacao === 'pago' && !f.conta && !f.cartao) {
    return { erro: 'Escolha a conta.' };
  }
  return { ok: f };
}

// ---------- cadastro de contas e categorias ----------
export const contasAtivas = (d, manterId = null) => d.contas.filter((c) => !c.arquivada || c.id === manterId);

/** Quantos lançamentos usam a conta (como conta, origem ou destino). */
export const usoConta = (d, id) => d.lancamentos.filter((l) => l.conta === id || l.conta_origem === id || l.conta_destino === id).length;

/** Quantos lançamentos e compras no cartão usam a categoria. */
export const usoCategoria = (d, id) =>
  d.lancamentos.filter((l) => l.categoria === id).length + d.compras_cartao.filter((k) => k.categoria === id).length;

const slug = (s) => norm(s).replace(/ /g, '_').slice(0, 24) || 'conta';

export function idUnicoConta(d, nome) {
  const base = slug(nome);
  let id = base, i = 2;
  while (d.contas.some((c) => c.id === id)) id = `${base}_${i++}`;
  return id;
}

export function idNovaCategoria(d, tipo) {
  const pre = tipo === 'receita' ? 'r' : 'd';
  const n = d.categorias.map((c) => Number(String(c.id).replace(/^\D+/, '')) || 0);
  return { id: `${pre}${Math.max(0, ...n) + 1}`, codigo: Math.max(0, ...d.categorias.map((c) => c.codigo || 0)) + 1 };
}

const TIPOS_CONTA = ['conta', 'conta_pj', 'dinheiro'];

/** Valida os dados do editor de conta. Devolve { erro } ou { ok }. */
export function validarConta(d, { id = null, nome, tipo }) {
  const n = String(nome || '').trim();
  if (!n) return { erro: 'Informe o nome da conta.' };
  if (n.length > 30) return { erro: 'Use no máximo 30 letras no nome.' };
  if (!TIPOS_CONTA.includes(tipo)) return { erro: 'Escolha o tipo da conta.' };
  if (d.contas.some((c) => c.id !== id && norm(c.nome) === norm(n))) return { erro: 'Já existe uma conta com esse nome.' };
  return { ok: { nome: n, tipo } };
}

export function validarCategoria(d, { id = null, nome, tipo }) {
  const n = String(nome || '').trim();
  if (!n) return { erro: 'Informe o nome da categoria.' };
  if (n.length > 30) return { erro: 'Use no máximo 30 letras no nome.' };
  if (!['despesa', 'receita'].includes(tipo)) return { erro: 'Escolha se é de despesa ou de receita.' };
  if (d.categorias.some((c) => c.id !== id && c.tipo === tipo && norm(c.nome) === norm(n))) return { erro: 'Já existe uma categoria com esse nome.' };
  return { ok: { nome: n, tipo } };
}

/**
 * O que se pode fazer ao remover uma conta:
 *  - 'excluir'  : nunca foi usada em lançamento -> pode apagar de vez;
 *  - 'arquivar' : tem histórico e saldo zero -> some das listas, mas o histórico fica;
 *  - 'bloqueado': tem histórico e ainda tem saldo -> transferir o saldo antes.
 */
export function remocaoConta(d, id) {
  const uso = usoConta(d, id);
  if (uso === 0) return { acao: 'excluir', uso };
  const saldo = saldosContas(d)[id] || 0;
  if (saldo === 0) return { acao: 'arquivar', uso, saldo };
  return { acao: 'bloqueado', uso, saldo };
}

export function remocaoCategoria(d, id) {
  const uso = usoCategoria(d, id);
  return { acao: uso === 0 ? 'excluir' : 'arquivar', uso };
}

// ---------- transferências (conta, caixinha ou empréstimo em cada ponta) ----------
const PONTAS = {
  origem: [['conta', 'conta_origem'], ['caixinha', 'origem_caixinha'], ['emprestimo', 'origem_emprestimo']],
  destino: [['conta', 'conta_destino'], ['caixinha', 'destino_caixinha'], ['emprestimo', 'destino_emprestimo']],
};
export const CHAVES_PONTAS = [...PONTAS.origem, ...PONTAS.destino].map((x) => x[1]);

/** Uma ponta de uma transferência: { tipo: 'conta'|'caixinha'|'emprestimo', id } ou null. lado: 'origem' | 'destino'. */
export function ponta(l, lado) {
  for (const [tipo, chave] of PONTAS[lado]) if (l[chave]) return { tipo, id: l[chave] };
  return null;
}
const chavesDaPonta = (lado, p) => {
  const chave = p && PONTAS[lado].find((x) => x[0] === p.tipo)?.[1];
  return chave ? { [chave]: p.id } : {};
};
/** A transferência mexe num empréstimo? (então só se altera pela tela do empréstimo) */
export const ligadaAEmprestimo = (l) => Boolean(l.origem_emprestimo || l.destino_emprestimo);

/**
 * Operações de gravação para uma transferência.
 * t = { data, valor, descricao, origem: {tipo,id}|null, destino: {tipo,id}|null }
 * opcoes.id/antigo: edita um lançamento existente (os movimentos ligados a ele são refeitos);
 * opcoes.semLancamento: grava só o movimento da caixinha/empréstimo, sem mexer em nenhuma conta.
 */
export function opsTransferencia(d, t, { id = null, antigo = null, semLancamento = false } = {}) {
  const idL = id || novoId('l');
  const ops = [];
  for (const m of d.caixinha_movimentos) if (m.lancamento_id === idL) ops.push(['del', 'caixinha_movimentos', m.id]);
  for (const m of d.emprestimo_movimentos) if (m.lancamento_id === idL) ops.push(['del', 'emprestimo_movimentos', m.id]);
  if (!semLancamento) {
    const l = { ...(antigo || {}), id: idL, tipo: 'transferencia', data: t.data, descricao: t.descricao, valor: t.valor, situacao: 'pago' };
    for (const k of [...CHAVES_PONTAS, 'conta', 'categoria', 'mes', 'status_codigo']) delete l[k];
    Object.assign(l, chavesDaPonta('origem', t.origem), chavesDaPonta('destino', t.destino));
    ops.push(['put', 'lancamentos', l]);
  }
  const lid = semLancamento ? null : idL;
  for (const lado of ['origem', 'destino']) {
    const p = t[lado];
    if (!p) continue;
    if (p.tipo === 'caixinha') {
      ops.push(['put', 'caixinha_movimentos', {
        id: novoId('c'), caixinha: p.id, data: t.data, descricao: t.descricao,
        valor: lado === 'destino' ? t.valor : -t.valor, tipo: lado === 'destino' ? 'aporte' : 'resgate', lancamento_id: lid,
      }]);
    } else if (p.tipo === 'emprestimo') {
      const e = d.emprestimos.find((x) => x.id === p.id);
      ops.push(['put', 'emprestimo_movimentos', {
        id: novoId('m'), emprestimo: p.id, data: t.data, descricao: t.descricao,
        ...movimentoEmprestimo(e, lado === 'destino' ? 'para' : 'de', t.valor), lancamento_id: lid,
      }]);
    }
  }
  return ops;
}

/** Tudo que precisa ser apagado junto com um movimento: ele e, se houver, o lançamento ligado e os outros movimentos desse lançamento. */
export function opsExcluirMovimento(d, tabela, m) {
  const ops = [['del', tabela, m.id]];
  if (m.lancamento_id) {
    ops.push(['del', 'lancamentos', m.lancamento_id]);
    for (const x of d.caixinha_movimentos) if (x.lancamento_id === m.lancamento_id && x.id !== m.id) ops.push(['del', 'caixinha_movimentos', x.id]);
    for (const x of d.emprestimo_movimentos) if (x.lancamento_id === m.lancamento_id && x.id !== m.id) ops.push(['del', 'emprestimo_movimentos', x.id]);
  }
  return ops;
}

// ---------- cadastro de caixinhas ----------
export function idUnicoCaixinha(d, banco, nome) {
  const base = slug(`${banco} ${nome}`);
  let id = base, i = 2;
  while (d.caixinhas.some((c) => c.id === id)) id = `${base}_${i++}`;
  return id;
}

export function validarCaixinha(d, { id = null, nome, banco }) {
  const n = String(nome || '').trim();
  const b = String(banco || '').trim();
  if (!n) return { erro: 'Informe o nome (o motivo), por exemplo Viagem.' };
  if (!b) return { erro: 'Informe o banco.' };
  if (n.length > 30 || b.length > 30) return { erro: 'Use no máximo 30 letras no nome e no banco.' };
  if (d.caixinhas.some((c) => c.id !== id && norm(c.nome) === norm(n) && norm(c.banco) === norm(b))) return { erro: 'Já existe uma caixinha com esse nome nesse banco.' };
  return { ok: { nome: n, banco: b } };
}

const usoLigado = (d, campos, id) => d.lancamentos.filter((l) => campos.some((k) => l[k] === id)).length;

/**
 *  - 'excluir'  : nenhum movimento veio de lançamento -> pode apagar (leva os movimentos junto);
 *  - 'arquivar' : há lançamentos ligados e o saldo é zero;
 *  - 'bloqueado': há lançamentos ligados e ainda tem saldo -> resgatar antes.
 */
export function remocaoCaixinha(d, id) {
  const movs = d.caixinha_movimentos.filter((m) => m.caixinha === id);
  const ligados = movs.filter((m) => m.lancamento_id).length + usoLigado(d, ['origem_caixinha', 'destino_caixinha'], id);
  const saldo = soma(movs.map((m) => m.valor));
  if (ligados === 0) return { acao: 'excluir', movimentos: movs.length, saldo };
  return { acao: saldo === 0 ? 'arquivar' : 'bloqueado', movimentos: movs.length, saldo, ligados };
}

// ---------- cadastro de empréstimos ----------
export function idUnicoEmprestimo(d, nome) {
  const base = slug(nome);
  let id = base, i = 2;
  while (d.emprestimos.some((e) => e.id === id)) id = `${base}_${i++}`;
  return id;
}

export function validarEmprestimo(d, { id = null, nome, sentido }) {
  const n = String(nome || '').trim();
  if (!n) return { erro: 'Informe o nome (por exemplo, o nome da pessoa).' };
  if (n.length > 30) return { erro: 'Use no máximo 30 letras no nome.' };
  if (!['dado', 'tomado'].includes(sentido)) return { erro: 'Escolha se você emprestou ou pegou emprestado.' };
  if (d.emprestimos.some((e) => e.id !== id && norm(e.nome) === norm(n))) return { erro: 'Já existe um empréstimo com esse nome.' };
  return { ok: { nome: n, sentido } };
}

/** Igual à caixinha: 'excluir' se nenhum movimento mexeu em conta; senão 'arquivar' (quitado) ou 'bloqueado' (em aberto). */
export function remocaoEmprestimo(d, id) {
  const movs = d.emprestimo_movimentos.filter((m) => m.emprestimo === id);
  const ligados = movs.filter((m) => m.lancamento_id).length + usoLigado(d, ['origem_emprestimo', 'destino_emprestimo'], id);
  const saldo = soma(movs.map((m) => m.valor));
  if (ligados === 0) return { acao: 'excluir', movimentos: movs.length, saldo };
  return { acao: saldo === 0 ? 'arquivar' : 'bloqueado', movimentos: movs.length, saldo, ligados };
}

// ---------- migração de formato (dados antigos -> atual) ----------
/**
 * Devolve { d, mudou }. Não altera o objeto recebido. Pode rodar várias vezes (só converte o que ainda está no formato antigo):
 *  - caixinha sem "banco": o nome antigo (ex.: "Itaú") vira o banco e o nome passa a "Caixinha", para você trocar pelo motivo;
 *  - movimento de caixinha sem "tipo": entrada = aporte, saída = resgate; aporte que combina com um lançamento de transferência (mesma data e valor) fica ligado a ele;
 *  - empréstimo com lista "movimentos" dentro dele: os movimentos vão para a tabela própria.
 */
export function migrar(d) {
  let mudou = false;
  const out = { ...d };
  out.caixinhas = (d.caixinhas || []).map((c) => {
    if (c.banco !== undefined) return c;
    mudou = true;
    const banco = String(c.nome || '').replace(/^caixinha\s+/i, '').trim() || String(c.nome || '');
    return { ...c, banco, nome: 'Caixinha' };
  });
  // aportes antigos da planilha: liga ao lançamento de transferência correspondente (mesma caixinha, data e valor), para editar/excluir juntos
  const usados = new Set((d.caixinha_movimentos || []).map((m) => m.lancamento_id).filter(Boolean));
  out.caixinha_movimentos = (d.caixinha_movimentos || []).map((m) => {
    let x = m;
    if (!x.tipo) { mudou = true; x = { ...x, tipo: x.valor < 0 ? 'resgate' : 'aporte' }; }
    if (x.lancamento_id === undefined && x.valor > 0) {
      const l = (d.lancamentos || []).find((t) => t.tipo === 'transferencia' && t.destino_caixinha === x.caixinha && t.data === x.data && t.valor === x.valor && !usados.has(t.id));
      if (l) { usados.add(l.id); mudou = true; x = { ...x, lancamento_id: l.id }; }
    }
    return x;
  });
  const movs = [...(d.emprestimo_movimentos || [])];
  out.emprestimos = (d.emprestimos || []).map((e) => {
    if (!Array.isArray(e.movimentos) && e.sentido) return e;
    mudou = true;
    const { movimentos = [], ...resto } = e;
    movimentos.forEach((m, i) => movs.push({
      id: `m_${e.id}_${i + 1}`, emprestimo: e.id, data: m.data, valor: m.valor, tipo: m.valor < 0 ? 'pagamento' : 'principal', descricao: m.obs || '',
    }));
    return { sentido: 'dado', ...resto };
  });
  out.emprestimo_movimentos = movs;
  return { d: out, mudou };
}
