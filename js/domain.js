// Regras e cálculos do controle financeiro. Funções puras: recebem os dados (d) e devolvem números/listas.
// d = { contas, categorias, lancamentos, compras_cartao, caixinhas, caixinha_movimentos, emprestimos, honorarios }
// Todos os valores em CENTAVOS.

import { norm } from './format.js';

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
export const totalContas = (d) => soma(Object.values(saldosContas(d)));

export function saldosCaixinhas(d) {
  const s = {};
  for (const c of d.caixinhas) s[c.id] = 0;
  for (const m of d.caixinha_movimentos) if (m.caixinha in s) s[m.caixinha] += m.valor;
  return s;
}
export const totalCaixinhas = (d) => soma(Object.values(saldosCaixinhas(d)));

export const saldoEmprestimo = (e) => soma(e.movimentos.map((m) => m.valor));
export const totalEmprestimos = (d) => soma(d.emprestimos.map(saldoEmprestimo));

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
    if (!f.conta_origem) return { erro: 'Escolha a conta de origem.' };
    if (!f.conta_destino && !f.destino_caixinha) return { erro: 'Escolha o destino.' };
    if (f.conta_destino && f.conta_destino === f.conta_origem) return { erro: 'Origem e destino precisam ser diferentes.' };
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
