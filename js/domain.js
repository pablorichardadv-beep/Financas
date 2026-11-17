// Regras e cálculos do controle financeiro. Funções puras: recebem os dados (d) e devolvem números/listas.
// d = { contas, categorias, lancamentos, compras_cartao, caixinhas, caixinha_movimentos, emprestimos, emprestimo_movimentos, honorarios (parcelas), contratos, cartoes, recorrencias }
// Todos os valores em CENTAVOS.

import { norm, novoId, hojeISO, reais } from './format.js';

const soma = (xs) => xs.reduce((a, b) => a + b, 0);

export const mesDoLanc = (l) => l.mes || (l.data ? l.data.slice(0, 7) : null);
export const estaPago = (l) => l.situacao === 'pago';
/** Em aberto = ainda não saiu/entrou em nenhuma conta ("a pagar", "atrasada", "a receber"). "Guardar" fica de fora. */
export const estaAberto = (l) => l.situacao === 'aberto' || l.situacao === 'atrasado';
/** Filtro de situação da lista: '' (todos), 'receber' / 'pagar' (ainda em aberto; faturas de cartão em aberto contam como "a pagar") ou 'recebidas' / 'pagas' (já liquidadas). */
export const passaSituacao = (l, sit) => {
  if (!sit) return true;
  if (sit === 'receber') return l.tipo === 'receita' && estaAberto(l);
  if (sit === 'pagar') return l.tipo === 'fatura' || (l.tipo === 'despesa' && estaAberto(l));
  if (sit === 'recebidas') return l.tipo === 'receita' && estaPago(l);
  if (sit === 'pagas') return l.tipo === 'despesa' && estaPago(l);
  return true;
};
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

export function emAberto(d, hoje = hojeISO()) {
  let aReceber = 0;
  let aPagar = 0;
  for (const l of d.lancamentos) {
    if (!estaAberto(l)) continue;
    if (l.tipo === 'receita') aReceber += l.valor;
    else if (l.tipo === 'despesa') aPagar += l.valor;
  }
  // faturas de cartão que vencem até o fim deste mês e ainda não foram pagas
  for (const f of faturasEmAberto(d)) if (f.mes <= hoje.slice(0, 7)) aPagar += f.pendente;
  return { aReceber, aPagar, liquido: aReceber - aPagar };
}

export function saldoGeral(d, hoje = hojeISO()) {
  const contas = totalContas(d);
  const caixinhas = totalCaixinhas(d);
  const emprestimo = totalEmprestimos(d);
  const aberto = emAberto(d, hoje).liquido;
  // saldo geral = o que já é seu (contas e caixinhas) + empréstimos a receber. "Em aberto" é mostrado à parte: não entra no total.
  return { contas, caixinhas, emprestimo, aberto, total: contas + caixinhas + emprestimo };
}

// ---------- mês ----------
export function resumoMes(d, mes) {
  let rec = 0, recPago = 0, desp = 0, despPago = 0;
  for (const l of d.lancamentos) {
    if (!ehResultado(l) || mesDoLanc(l) !== mes) continue;
    if (l.tipo === 'receita') { rec += l.valor; if (estaPago(l)) recPago += l.valor; }
    else { desp += l.valor; if (estaPago(l)) despPago += l.valor; }
  }
  for (const f of faturasEmAberto(d)) if (f.mes === mes) desp += f.pendente;   // fatura do cartão ainda não paga = despesa prevista
  return {
    receitas: rec, recebido: recPago, aReceber: rec - recPago,
    despesas: desp, pagas: despPago, aPagar: desp - despPago,
    saldo: rec - desp,
    saldoEfetuado: recPago - despPago,                    // o que já aconteceu: recebido menos pago
    saldoPrevisto: (rec - recPago) - (desp - despPago),   // o que ainda vai acontecer: a receber menos a pagar
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
  for (const f of faturasEmAberto(d)) {
    if (f.mes !== mes) continue;
    total += f.pendente;
    if (f.vencimento < hoje) atrasado += f.pendente;
  }
  return { total, atrasado };
}

export function despesasPorCategoria(d, mes) {
  const porCat = new Map();
  for (const l of d.lancamentos) {
    if (l.tipo !== 'despesa' || mesDoLanc(l) !== mes || l.fatura_cartao) continue;   // pagamento de fatura: conta pelas compras abaixo
    porCat.set(l.categoria || '', (porCat.get(l.categoria || '') || 0) + l.valor);
  }
  // compras da fatura que vence no mês entram por categoria (a fatura paga ou em aberto)
  for (const c of d.cartoes || []) {
    if (mes < controleDesde(c)) continue;
    for (const k of d.compras_cartao || []) if (k.cartao === c.id && k.fatura === mes) porCat.set(k.categoria || '', (porCat.get(k.categoria || '') || 0) + k.valor);
  }
  const nome = new Map(d.categorias.map((c) => [c.id, c.nome]));
  const total = soma([...porCat.values()]);
  return [...porCat.entries()]
    .map(([id, valor]) => ({ id, nome: nome.get(id) || 'Sem categoria', valor, pct: total ? valor / total : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

/** Receitas do mês por categoria (recebidas e a receber). */
export function receitasPorCategoria(d, mes) {
  const porCat = new Map();
  for (const l of d.lancamentos) if (l.tipo === 'receita' && mesDoLanc(l) === mes) porCat.set(l.categoria || '', (porCat.get(l.categoria || '') || 0) + l.valor);
  const nome = new Map(d.categorias.map((c) => [c.id, c.nome]));
  const total = soma([...porCat.values()]);
  return [...porCat.entries()].map(([id, valor]) => ({ id, nome: nome.get(id) || 'Sem categoria', valor, pct: total ? valor / total : 0 })).sort((a, b) => b.valor - a.valor);
}

// ---------- faturas do cartão: em aberto ou paga ----------
// Pagar a fatura = lançar uma despesa na conta com { fatura_cartao: id do cartão, fatura_mes: 'AAAA-MM' }.
// Faturas de meses anteriores a `controle_desde` (do cartão) são histórico: não entram em "a pagar".
export const controleDesde = (c) => c.controle_desde || '0000-00';
export const ehPagamentoFatura = (l) => Boolean(l.fatura_cartao);

export function situacaoFatura(d, c, mes) {
  const total = soma((d.compras_cartao || []).filter((k) => k.cartao === c.id && k.fatura === mes).map((k) => k.valor));
  const pagamentos = (d.lancamentos || []).filter((l) => l.fatura_cartao === c.id && l.fatura_mes === mes).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const pago = soma(pagamentos.filter(estaPago).map((l) => l.valor));
  const controlada = mes >= controleDesde(c);
  const pendente = controlada ? Math.max(0, total - pago) : 0;
  const status = !total ? 'vazia' : !controlada ? 'antiga' : pendente === 0 ? 'paga' : pago > 0 ? 'parcial' : 'aberta';
  return { cartao: c, mes, total, pago, pendente, controlada, status, pagamentos, ...datasDaFatura(c, mes) };
}

/** Todas as faturas com algo a pagar (todos os cartões, do mais antigo para o mais novo). */
export function faturasEmAberto(d) {
  const out = [];
  for (const c of d.cartoes || []) {
    const meses = [...new Set((d.compras_cartao || []).filter((k) => k.cartao === c.id).map((k) => k.fatura))].sort();
    for (const mes of meses) { const f = situacaoFatura(d, c, mes); if (f.pendente > 0) out.push(f); }
  }
  return out;
}

/** A fatura "da vez" do cartão: a mais antiga ainda em aberto; se não houver, a fatura atual (com valor zero a pagar). */
export const faturaDaVezDoCartao = (d, c, hoje) => faturasEmAberto(d).find((f) => f.cartao.id === c.id) || situacaoFatura(d, c, faturaAtualDoCartao(d, c, hoje));

export const faturaCartao = (d, mes) => soma(d.compras_cartao.filter((k) => k.fatura === mes).map((k) => k.valor));

// ---------- honorários ----------
// contrato = { id, cliente, descricao, total, qtd (nº de parcelas), parceria? }
// parcela  = { id, contrato, numero, valor, vencimento (ou null), status: 'aberto' | 'pago' | 'calote', pago_em?, conta?, lancamento_id? }
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

/**
 * Honorários a receber por mês de vencimento (só parcelas em aberto). Parcelas sem data ficam à parte (mes: null).
 * Cada linha: { mes, total, qtd, clientes, atrasado (mês já passado), parcelas }.
 */
export function honorariosPorMes(d, hoje) {
  const por = new Map();
  const cliente = new Map(d.contratos.map((c) => [c.id, c.cliente]));
  for (const p of d.honorarios.filter((x) => x.status === 'aberto')) {
    const mes = p.vencimento ? p.vencimento.slice(0, 7) : null;
    if (!por.has(mes)) por.set(mes, []);
    por.get(mes).push(p);
  }
  const mesHoje = hoje.slice(0, 7);
  return [...por.entries()]
    .sort((a, b) => (a[0] === null) - (b[0] === null) || String(a[0]).localeCompare(String(b[0])))
    .map(([mes, ps]) => ({
      mes, total: soma(ps.map((p) => p.valor)), qtd: ps.length,
      clientes: new Set(ps.map((p) => cliente.get(p.contrato) || '?')).size,
      atrasado: mes !== null && mes < mesHoje,
      parcelas: ps.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')),
    }));
}

/** Recorte das linhas por período: 'todos', 'ano' (ano de hoje), 'prox3', 'prox6' ou 'prox12' (a partir do mês de hoje). */
export function filtrarPeriodoHonorarios(linhas, periodo, hoje) {
  const m0 = hoje.slice(0, 7);
  const [a] = hoje.split('-').map(Number);
  const ate = (k) => somarMesFatura(m0, k - 1);
  if (periodo === 'ano') return linhas.filter((l) => l.mes && l.mes.startsWith(`${a}-`));
  const n = { prox3: 3, prox6: 6, prox12: 12 }[periodo];
  if (n) return linhas.filter((l) => l.mes && l.mes >= m0 && l.mes <= ate(n));
  return linhas;
}

/** Soma `k` meses a uma data AAAA-MM-DD mantendo o dia (se o mês for mais curto, usa o último dia dele). */
export function somarMeses(iso, k) {
  const [y, m, dia] = iso.split('-').map(Number);
  const t = m - 1 + k;
  const ano = y + Math.floor(t / 12);
  const mes = ((t % 12) + 12) % 12;
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/**
 * Parcelas de um contrato novo. Sem `valorParcela`, divide o total igualmente (a diferença de centavos vai para a última).
 * Com `valorParcela`, todas valem isso. Vencimentos mensais a partir de `primeiroVenc`.
 */
export function gerarParcelas({ total, qtd, valorParcela = 0, primeiroVenc = null }) {
  const base = valorParcela > 0 ? valorParcela : Math.floor(total / qtd);
  const lista = Array.from({ length: qtd }, (_, i) => ({ numero: i + 1, valor: base, vencimento: primeiroVenc ? somarMeses(primeiroVenc, i) : null }));
  if (!(valorParcela > 0)) lista[qtd - 1].valor += total - base * qtd;
  return lista;
}

export function validarNovoContrato({ cliente, total, qtd, valorParcela, primeiroVenc }) {
  if (!String(cliente || '').trim()) return { erro: 'Informe o cliente.' };
  if (String(cliente).trim().length > 40) return { erro: 'Use no máximo 40 letras no nome do cliente.' };
  if (!(total > 0)) return { erro: 'Informe o valor total do honorário.' };
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 120) return { erro: 'O número de parcelas deve ficar entre 1 e 120.' };
  if (!(valorParcela > 0)) return { erro: 'Informe o valor de cada parcela.' };
  if (!primeiroVenc) return { erro: 'Informe o vencimento da primeira parcela.' };
  return { ok: true };
}

export function validarEdicaoContrato({ cliente, total }) {
  if (!String(cliente || '').trim()) return { erro: 'Informe o cliente.' };
  if (String(cliente).trim().length > 40) return { erro: 'Use no máximo 40 letras no nome do cliente.' };
  if (!(total > 0)) return { erro: 'Informe o valor total do honorário.' };
  return { ok: true };
}

export function validarParcela({ valor }) {
  if (!(valor > 0)) return { erro: 'Informe o valor da parcela.' };
  return { ok: true };
}

/** Situação e números de um contrato. situacao: 'aberto' (tem parcela a receber) | 'calote' (só calote e recebidas) | 'quitado'. */
export function resumoContrato(d, c, hoje) {
  const parcelas = d.honorarios.filter((p) => p.contrato === c.id).sort((a, b) => a.numero - b.numero);
  const por = (st) => parcelas.filter((p) => p.status === st);
  const abertas = por('aberto');
  const aReceber = soma(abertas.map((p) => p.valor));
  const proxima = abertas.filter((p) => p.vencimento).sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0] || null;
  return {
    parcelas,
    recebido: soma(por('pago').map((p) => p.valor)),
    aReceber,
    calote: soma(por('calote').map((p) => p.valor)),
    soma: soma(parcelas.map((p) => p.valor)),
    atrasado: soma(abertas.filter((p) => p.vencimento && p.vencimento < hoje).map((p) => p.valor)),
    qtdAbertas: abertas.length,
    proxima,
    situacao: abertas.length ? 'aberto' : por('calote').length ? 'calote' : 'quitado',
  };
}

export const clientesConhecidos = (d) => [...new Set(d.contratos.map((c) => c.cliente))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

/** Categoria sugerida para o recebimento de honorários (a de direito, se existir). */
export const categoriaHonorarios = (d) =>
  d.categorias.find((c) => c.tipo === 'receita' && !c.arquivada && norm(c.nome) === 'direito')?.id
  || d.categorias.find((c) => c.tipo === 'receita' && !c.arquivada)?.id || null;

export const rotuloParcela = (p, c) => `${p.numero}/${Math.max(c.qtd || 0, p.numero)}`;

/** Lançamento "a receber" que já existe para esta parcela (ligado por `lanc_previsto`), se ainda estiver em aberto. */
export const lancamentoPrevisto = (d, p) => (p.lanc_previsto ? d.lancamentos.find((l) => l.id === p.lanc_previsto && l.tipo === 'receita' && !estaPago(l)) || null : null);
/** Parcela em aberto que está ligada a este lançamento "a receber". */
export const parcelaDoLancamento = (d, l) => d.honorarios.find((p) => p.lanc_previsto === l.id && p.status !== 'pago') || null;

/**
 * Recebimento de uma parcela: marca como paga e baixa a receita na conta escolhida.
 * Se a parcela já tem um lançamento "a receber", é ele que vira "recebido" (nada é lançado em dobro).
 */
export function opsReceberParcela(d, p, c, { conta, data, categoria = null }) {
  const prev = lancamentoPrevisto(d, p);
  const idL = prev ? prev.id : novoId('l');
  const { mes, ...base } = prev || {};
  const lanc = {
    ...base, id: idL, tipo: 'receita', data, descricao: prev ? prev.descricao : `Honorários – ${c.cliente} (${rotuloParcela(p, c)})`, valor: p.valor,
    conta, categoria: categoria || prev?.categoria || null, situacao: 'pago', honorario_id: p.id,
  };
  return [
    ['put', 'lancamentos', lanc],
    ['put', 'honorarios', { ...p, status: 'pago', pago_em: data, conta, lancamento_id: idL, ...(prev ? { lanc_previsto: idL } : {}) }],
  ];
}

/** Volta a parcela para "em aberto": o lançamento reaproveitado volta a "a receber"; o criado só para o recebimento é apagado. */
export function opsDesfazerRecebimento(p, d = null) {
  const { pago_em, conta, lancamento_id, ...resto } = p;
  const ops = [['put', 'honorarios', { ...resto, status: 'aberto' }]];
  if (!lancamento_id) return ops;
  const l = d && p.lanc_previsto === lancamento_id ? d.lancamentos.find((x) => x.id === lancamento_id) : null;
  if (l) {
    const { honorario_id, ...r } = l;
    const venc = p.vencimento || l.data;
    ops.push(['put', 'lancamentos', { ...r, situacao: 'aberto', data: venc, mes: venc.slice(0, 7) }]);
  } else ops.push(['del', 'lancamentos', lancamento_id]);
  return ops;
}

/** Muda valor e vencimento de uma parcela em aberto e acompanha o lançamento "a receber" ligado a ela. */
export function opsEditarParcela(d, p, { valor, vencimento }) {
  const ops = [['put', 'honorarios', { ...p, valor, vencimento: vencimento || null }]];
  const prev = lancamentoPrevisto(d, p);
  if (prev) {
    const data = vencimento || prev.data;
    ops.push(['put', 'lancamentos', { ...prev, valor, data, mes: data.slice(0, 7) }]);
  }
  return ops;
}

export const opsExcluirContrato = (d, id) => [...d.honorarios.filter((p) => p.contrato === id).map((p) => ['del', 'honorarios', p.id]), ['del', 'contratos', id]];

/** O lançamento é o recebimento de uma parcela de honorário? (então só se altera pela tela do honorário) */
export const ligadaAHonorario = (l) => Boolean(l.honorario_id);

/** Ao excluir o lançamento de uma parcela: se era o recebimento, a parcela volta a ficar "a receber"; se era o "a receber", a parcela perde a ligação. */
export function opsAoExcluirLancamento(d, l) {
  const p = (l.honorario_id && d.honorarios.find((x) => x.id === l.honorario_id)) || d.honorarios.find((x) => x.lanc_previsto === l.id);
  if (!p) return [];
  let q = { ...p };
  if (q.lanc_previsto === l.id) delete q.lanc_previsto;   // o lançamento deixou de existir
  if (l.honorario_id === p.id) { delete q.pago_em; delete q.conta; delete q.lancamento_id; q.status = 'aberto'; }
  return [['put', 'honorarios', q]];
}

// ---------- cartões de crédito ----------
// cartão = { id, banco, bandeira, final (4 dígitos), vencimento (dia do mês), fechamento (dia do mês), arquivado? }
// compra = { id, cartao, fatura ('AAAA-MM' do mês de vencimento), data, descricao, valor, categoria }
export const BANDEIRAS = ['Visa', 'Mastercard', 'Elo', 'American Express', 'Hipercard', 'Outra'];

/** Dia de fechamento sugerido: 7 dias antes do vencimento (o mais comum). */
export const fechamentoSugerido = (vencimento) => (vencimento > 7 ? vencimento - 7 : vencimento + 23);

export const rotuloCartao = (c) => `${c.banco} ${c.bandeira} final ${c.final}`;
export const cartoesAtivos = (d, manterId = null) => d.cartoes.filter((c) => !c.arquivado || c.id === manterId);

const diaNoMes = (ano, mes1) => new Date(ano, mes1, 0).getDate();
const isoDia = (ano, mes1, dia) => `${ano}-${String(mes1).padStart(2, '0')}-${String(Math.min(dia, diaNoMes(ano, mes1))).padStart(2, '0')}`;
const addMes = (ano, mes1, k) => { const t = ano * 12 + (mes1 - 1) + k; return [Math.floor(t / 12), (t % 12) + 1]; };

/** Data de vencimento da fatura do mês `fatura` ('AAAA-MM') e a data em que ela fecha. */
export function datasDaFatura(c, fatura) {
  const [a, m] = fatura.split('-').map(Number);
  const [ac, mc] = c.vencimento > c.fechamento ? [a, m] : addMes(a, m, -1);
  return { vencimento: isoDia(a, m, c.vencimento), fechamento: isoDia(ac, mc, c.fechamento) };
}

/** Em qual fatura entra uma compra feita em `dataISO`: depois do dia de fechamento vai para a fatura seguinte. */
export function faturaDaCompra(c, dataISO) {
  const [a, m, dia] = dataISO.split('-').map(Number);
  const fecha = Math.min(c.fechamento, diaNoMes(a, m));
  const [ac, mc] = dia > fecha ? addMes(a, m, 1) : [a, m];
  const [av, mv] = c.vencimento > c.fechamento ? [ac, mc] : addMes(ac, mc, 1);
  const fatura = `${av}-${String(mv).padStart(2, '0')}`;
  return { fatura, ...datasDaFatura(c, fatura) };
}

export const MAX_PARCELAS = 48;

// compra recorrente = { id, cartao, descricao, valor, categoria, dia (do mês), inicio (data da 1ª cobrança), ativa, cancelada_em?, pulados: ['AAAA-MM'] }
// As cobranças viram compras normais do cartão (com `recorrencia: id`), criadas com `horizonte` meses de antecedência;
// o app completa os meses que faltam toda vez que abre.
export function opsRecorrencias(d, hoje, horizonte = 12) {
  const ops = [];
  const [ah, mh] = hoje.split('-').map(Number);
  const [af, mf] = addMes(ah, mh, horizonte);
  const fim = `${af}-${String(mf).padStart(2, '0')}`;
  for (const r of d.recorrencias) {
    const c = r.ativa && d.cartoes.find((x) => x.id === r.cartao);
    if (!c) continue;
    const tem = new Set(d.compras_cartao.filter((k) => k.recorrencia === r.id && k.data).map((k) => k.data.slice(0, 7)));
    const pulados = new Set(r.pulados || []);
    for (let ym = r.inicio.slice(0, 7); ym <= fim; ym = somarMesFatura(ym, 1)) {
      if (tem.has(ym) || pulados.has(ym)) continue;
      const [a, m] = ym.split('-').map(Number);
      const data = isoDia(a, m, r.dia);
      if (data < r.inicio) continue;
      ops.push(['put', 'compras_cartao', { id: novoId('k'), cartao: c.id, fatura: faturaDaCompra(c, data).fatura, data, descricao: r.descricao, valor: r.valor, categoria: r.categoria || null, recorrencia: r.id }]);
    }
  }
  return ops;
}

/** Cancelar: as cobranças de hoje para trás continuam; as futuras saem das faturas. */
export function opsCancelarRecorrencia(d, r, hoje) {
  return [
    ['put', 'recorrencias', { ...r, ativa: false, cancelada_em: hoje }],
    ...d.compras_cartao.filter((k) => k.recorrencia === r.id && k.data > hoje).map((k) => ['del', 'compras_cartao', k.id]),
  ];
}

/** Novo valor vale para as cobranças futuras; as já lançadas ficam como estão. */
export function opsValorRecorrencia(d, r, valor, hoje) {
  return [
    ['put', 'recorrencias', { ...r, valor }],
    ...d.compras_cartao.filter((k) => k.recorrencia === r.id && k.data > hoje).map((k) => ['put', 'compras_cartao', { ...k, valor }]),
  ];
}

/** Soma `k` meses a um mês 'AAAA-MM'. */
export const somarMesFatura = (ym, k) => { const [a, m] = ym.split('-').map(Number); const [x, y] = addMes(a, m, k); return `${x}-${String(y).padStart(2, '0')}`; };

/**
 * Compra parcelada no cartão: o valor informado é o TOTAL. Divide em partes iguais (o que sobrar em centavos
 * fica na 1ª parcela) e cada parcela cai na fatura do mês seguinte à anterior, a partir de `fatura`.
 */
export function gerarParcelasCompra({ valor, qtd, fatura }) {
  const base = Math.floor(valor / qtd);
  return Array.from({ length: qtd }, (_, i) => ({ numero: i + 1, valor: i === 0 ? base + (valor - base * qtd) : base, fatura: somarMesFatura(fatura, i) }));
}

export const validarParcelas = (qtd) => (Number.isInteger(qtd) && qtd >= 1 && qtd <= MAX_PARCELAS ? { ok: true } : { erro: `O número de parcelas deve ficar entre 1 e ${MAX_PARCELAS}.` });

export function validarCartao(d, { id = null, banco, bandeira, final, vencimento, fechamento }) {
  const b = String(banco || '').trim().replace(/\s+/g, ' ');
  const fim = String(final || '').trim();
  if (!b) return { erro: 'Informe o banco.' };
  if (b.length > 30) return { erro: 'Use no máximo 30 letras no nome do banco.' };
  if (!BANDEIRAS.includes(bandeira)) return { erro: 'Escolha a bandeira.' };
  if (!/^\d{4}$/.test(fim)) return { erro: 'Informe os 4 últimos dígitos do cartão.' };
  const dia = (x) => Number.isInteger(x) && x >= 1 && x <= 31;
  if (!dia(vencimento)) return { erro: 'Informe o dia do vencimento (de 1 a 31).' };
  if (!dia(fechamento)) return { erro: 'Informe o dia do fechamento da fatura (de 1 a 31).' };
  if (d.cartoes.some((c) => c.id !== id && norm(c.banco) === norm(b) && c.bandeira === bandeira && c.final === fim)) return { erro: 'Esse cartão já está cadastrado.' };
  return { ok: { banco: b, bandeira, final: fim, vencimento, fechamento } };
}

export function idUnicoCartao(d, banco, final) {
  const base = `cartao_${slug(banco)}_${final}`;
  let id = base, i = 2;
  while (d.cartoes.some((c) => c.id === id)) id = `${base}_${i++}`;
  return id;
}

export const usoCartao = (d, id) => d.compras_cartao.filter((k) => k.cartao === id).length + d.recorrencias.filter((r) => r.cartao === id && r.ativa).length;
/** Sem compras o cartão pode ser excluído; com compras só arquivado (o histórico continua). */
export const remocaoCartao = (d, id) => ({ acao: usoCartao(d, id) ? 'arquivar' : 'excluir', compras: usoCartao(d, id) });

/** Faturas de um cartão (uma por mês de vencimento), da mais recente para a mais antiga. */
export function faturasDoCartao(d, c) {
  const por = new Map();
  for (const k of d.compras_cartao.filter((x) => x.cartao === c.id)) {
    if (!por.has(k.fatura)) por.set(k.fatura, []);
    por.get(k.fatura).push(k);
  }
  return [...por.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([mes, compras]) => ({
    mes, compras: compras.sort((a, b) => (b.data || '').localeCompare(a.data || '')), total: soma(compras.map((k) => k.valor)), ...datasDaFatura(c, mes),
  }));
}

/** Fatura que está valendo agora: a primeira com vencimento a partir de hoje (se não houver, a do mês de hoje). */
export function faturaAtualDoCartao(d, c, hoje) {
  const fs = faturasDoCartao(d, c).filter((f) => f.vencimento >= hoje).sort((a, b) => a.mes.localeCompare(b.mes));
  return fs[0]?.mes || faturaDaCompra(c, hoje).fatura;
}

/** Faturas de um mês de vencimento: uma linha por cartão e, se houver, uma de compras antigas sem cartão. */
export function faturasDoMes(d, mes) {
  const linhas = [];
  for (const c of d.cartoes) {
    const f = situacaoFatura(d, c, mes);
    if (f.total) linhas.push({ cartao: c, total: f.total, vencimento: f.vencimento, pago: f.pago, pendente: f.pendente, status: f.status });
  }
  const sem = d.compras_cartao.filter((k) => !k.cartao && k.fatura === mes);
  if (sem.length) linhas.push({ cartao: null, total: soma(sem.map((k) => k.valor)), vencimento: null });
  return linhas;
}

/** Último cartão usado numa compra (para sugerir no formulário). */
export const ultimoCartaoUsado = (d) => {
  const k = [...d.compras_cartao].reverse().find((x) => x.cartao && d.cartoes.some((c) => c.id === x.cartao && !c.arquivado));
  return k?.cartao || cartoesAtivos(d)[0]?.id || '';
};

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
    id: k.id, tipo: 'cartao', data: null, data_compra: k.data || null, mes: k.fatura, descricao: k.descricao, valor: k.valor,
    categoria: k.categoria, conta: null, situacao: 'cartao', cartao_id: k.cartao || null, recorrencia: k.recorrencia || null,
  }));
  // uma linha por fatura em aberto, com o valor ainda a pagar (atualiza sozinha a cada compra)
  const faturas = faturasEmAberto(d).map((f) => ({
    id: `f:${f.cartao.id}:${f.mes}`, tipo: 'fatura', data: f.vencimento, mes: f.mes, descricao: `Fatura ${f.cartao.banco} ${f.cartao.bandeira}`, valor: f.pendente,
    categoria: null, conta: null, situacao: 'aberto', cartao_id: f.cartao.id, fatura_total: f.total, fatura_pago: f.pago,
  }));
  return [...d.lancamentos, ...faturas, ...cartao];
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
  } else if (f.cartao && f.tipo === 'despesa') {
    if (!f.cartao_id && !f.legado) return { erro: 'Escolha o cartão.' };
    if (!f.recorrente && f.parcelas !== undefined && f.parcelas !== null) { const p = validarParcelas(f.parcelas); if (p.erro) return p; if (f.parcelas > 1 && f.valor < f.parcelas) return { erro: 'O valor é pequeno demais para tantas parcelas.' }; }
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

export function validarCategoria(d, { id = null, nome, tipo, meta = 0 }) {
  const n = String(nome || '').trim();
  if (!n) return { erro: 'Informe o nome da categoria.' };
  if (n.length > 30) return { erro: 'Use no máximo 30 letras no nome.' };
  if (!['despesa', 'receita'].includes(tipo)) return { erro: 'Escolha se é de despesa ou de receita.' };
  if (d.categorias.some((c) => c.id !== id && c.tipo === tipo && norm(c.nome) === norm(n))) return { erro: 'Já existe uma categoria com esse nome.' };
  if (!Number.isInteger(meta) || meta < 0) return { erro: 'A meta mensal não pode ser negativa.' };
  return { ok: { nome: n, tipo, meta: tipo === 'despesa' ? meta : 0 } };
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
export function migrar(d, hoje = hojeISO()) {
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
  if (!Array.isArray(out.cartoes)) out.cartoes = [];
  if (!Array.isArray(out.recorrencias)) out.recorrencias = [];

  // honorários: cada linha antiga (uma parcela com cliente e valor do contrato) vira parcela de um contrato
  const contratos = [...(d.contratos || [])];
  const chave = new Map();
  const numeros = new Map();
  const novas = (d.honorarios || []).filter((h) => !h.contrato);
  if (novas.length) {
    mudou = true;
    for (const h of novas) {
      const cliente = String(h.cliente || h.descricao || 'Sem cliente').trim();
      const descricao = String(h.descricao || '').replace(/^escrit[óo]rio\s*-\s*/i, '').trim();
      const k = `${norm(cliente)}|${norm(descricao)}`;
      if (!chave.has(k)) {
        const c = { id: `t${String(contratos.length + 1).padStart(3, '0')}`, cliente, descricao, total: 0, qtd: 0, _n: 0 };
        if (h.parceria) c.parceria = h.parceria;
        contratos.push(c); chave.set(k, c);
      }
      const c = chave.get(k);
      const m = String(h.parcela || '').match(/(\d+)\s*de\s*(\d+)/i);
      c._n += 1;
      numeros.set(h, m ? Number(m[1]) : c._n);
      c.qtd = Math.max(c.qtd, m ? Number(m[2]) : 0, numeros.get(h));
      if (!c.total && h.valor_contrato) c.total = h.valor_contrato;
    }
  }
  out.honorarios = (d.honorarios || []).map((h) => {
    if (h.contrato) return h;
    const k = `${norm(String(h.cliente || h.descricao || 'Sem cliente').trim())}|${norm(String(h.descricao || '').replace(/^escrit[óo]rio\s*-\s*/i, '').trim())}`;
    const { cliente, descricao, parceria, valor_contrato, parcela, ...resto } = h;
    return { ...resto, contrato: chave.get(k).id, numero: numeros.get(h) };
  });
  out.contratos = contratos.map(({ _n, ...c0 }) => {
    const c = { ...c0 };
    if (!c.total) c.total = out.honorarios.filter((p) => p.contrato === c.id).reduce((s, p) => s + p.valor, 0);
    return c;
  });

  // cartões: faturas que já venceram antes desta versão são histórico (não viram "a pagar"); vale a partir da fatura de hoje
  out.cartoes = out.cartoes.map((c) => {
    if (c.controle_desde || !Number.isInteger(c.vencimento) || !Number.isInteger(c.fechamento)) return c;
    mudou = true;
    return { ...c, controle_desde: faturaDaCompra(c, hoje).fatura };
  });

  const v = vincularHonorarios(out);
  if (v.mudou) { mudou = true; return { d: v.d, mudou }; }
  return { d: out, mudou };
}

const RE_HONORARIO = /^honor[aá]rios\s*[-–—]\s*(.+?)(?:\s+(\d+)\s+de\s+(\d+))?\s*$/i;
const diasEntre = (a, b) => Math.abs(Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000));

/**
 * Honorários x lançamentos "a receber": liga cada parcela em aberto ao lançamento "Honorários - Cliente" que já existe
 * para ela (mesmo cliente, valor e mês), para receber uma vez só. Lançamentos "Cliente 01 de 02" sem contrato viram contrato.
 * Pura e idempotente: só mexe no que ainda não está ligado.
 */
export function vincularHonorarios(d) {
  let mudou = false;
  const lancs = [...d.lancamentos];
  const parcelas = [...d.honorarios];
  const contratos = [...d.contratos];
  const ligados = new Set(parcelas.flatMap((p) => [p.lanc_previsto, p.lancamento_id]).filter(Boolean));
  const doHonorario = (l) => l.tipo === 'receita' && !l.honorario_id && !ligados.has(l.id) && RE_HONORARIO.exec(l.descricao || '');
  const aberto = (l) => l.situacao === 'aberto' || l.situacao === 'atrasado';

  // 1) parcelas em aberto sem ligação ↔ lançamento "a receber" do mesmo cliente, valor e mês
  parcelas.forEach((p, i) => {
    if (p.status !== 'aberto' || p.lanc_previsto || p.lancamento_id || !p.vencimento) return;
    const c = contratos.find((x) => x.id === p.contrato);
    if (!c) return;
    const achou = lancs
      .filter((l) => aberto(l) && doHonorario(l) && norm(RE_HONORARIO.exec(l.descricao)[1]) === norm(c.cliente) && l.valor === p.valor && (l.data || '').slice(0, 7) === p.vencimento.slice(0, 7))
      .sort((a, b) => diasEntre(a.data, p.vencimento) - diasEntre(b.data, p.vencimento))[0];
    if (!achou) return;
    ligados.add(achou.id); parcelas[i] = { ...p, lanc_previsto: achou.id }; mudou = true;
  });

  // 2) "Cliente 01 de 02" sem contrato nenhum: cria o contrato com as parcelas (as já recebidas ficam como recebidas)
  const grupos = new Map();
  for (const l of lancs) {
    const m = doHonorario(l);
    if (!m || !m[2]) continue;
    const chave = `${norm(m[1])}|${m[3]}`;
    if (!grupos.has(chave)) grupos.set(chave, { cliente: m[1].trim(), qtd: Number(m[3]), porNumero: new Map() });
    grupos.get(chave).porNumero.set(Number(m[2]), [...(grupos.get(chave).porNumero.get(Number(m[2])) || []), l]);
  }
  for (const g of grupos.values()) {
    if (contratos.some((c) => norm(c.cliente) === norm(g.cliente))) continue;
    const todas = Array.from({ length: g.qtd }, (_, k) => g.porNumero.get(k + 1));
    if (g.qtd < 2 || todas.some((x) => !x || x.length !== 1) || !todas.some((x) => aberto(x[0]))) continue;
    const ls = todas.map((x) => x[0]);
    const idC = `t_${norm(g.cliente).replace(/ /g, '_')}_${g.qtd}`;
    contratos.push({ id: idC, cliente: g.cliente, descricao: 'Honorários', total: ls.reduce((a, l) => a + l.valor, 0), qtd: g.qtd });
    ls.forEach((l, k) => {
      const paga = l.situacao === 'pago';
      parcelas.push({ id: `h_${l.id}`, contrato: idC, numero: k + 1, valor: l.valor, vencimento: l.data, status: paga ? 'pago' : 'aberto', ...(paga ? { pago_em: l.data, conta: l.conta, lancamento_id: l.id } : {}), lanc_previsto: l.id });
      if (paga) lancs[lancs.indexOf(l)] = { ...l, honorario_id: `h_${l.id}` };
      ligados.add(l.id);
    });
    mudou = true;
  }
  return { d: mudou ? { ...d, lancamentos: lancs, honorarios: parcelas, contratos } : d, mudou };
}


// ---------- metas, projeção, pendências e gráficos ----------
/** Dias de `a` até `b` (negativo se `b` é antes de `a`). Datas 'AAAA-MM-DD'. */
export const diasAte = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);

/** Metas mensais por categoria de despesa: quanto já foi gasto no mês (compras do cartão contam pela fatura). */
export function metasDoMes(d, mes) {
  const gasto = new Map(despesasPorCategoria(d, mes).map((c) => [c.id, c.valor]));
  return d.categorias.filter((c) => c.tipo === 'despesa' && !c.arquivada && c.meta > 0)
    .map((c) => { const g = gasto.get(c.id) || 0; return { id: c.id, nome: c.nome, meta: c.meta, gasto: g, pct: g / c.meta, restante: c.meta - g, estourou: g > c.meta }; })
    .sort((a, b) => b.pct - a.pct);
}

/**
 * Projeção do saldo em contas para os próximos meses: parte do saldo de hoje e soma o que ainda vai entrar
 * (receitas "a receber" e parcelas de honorário sem lançamento) e sair (despesas "a pagar" e faturas de cartão).
 * O que está atrasado cai no mês atual.
 */
export function projecaoMeses(d, hoje, n = 6) {
  const atual = hoje.slice(0, 7);
  const meses = Array.from({ length: n }, (_, k) => somarMesFatura(atual, k));
  const por = new Map(meses.map((m) => [m, { mes: m, entradas: 0, saidas: 0 }]));
  const poe = (m, campo, v) => { const r = por.get(m < atual ? atual : m); if (r) r[campo] += v; };
  for (const l of d.lancamentos) {
    if (!estaAberto(l) || !ehResultado(l)) continue;
    const m = mesDoLanc(l);
    if (m) poe(m, l.tipo === 'receita' ? 'entradas' : 'saidas', l.valor);
  }
  for (const p of d.honorarios || []) {
    if (p.status !== 'aberto' || !p.vencimento || lancamentoPrevisto(d, p)) continue;
    poe(p.vencimento.slice(0, 7), 'entradas', p.valor);
  }
  for (const f of faturasEmAberto(d)) poe(f.mes, 'saidas', f.pendente);
  let acum = totalContas(d);
  return meses.map((m) => { const r = por.get(m); acum += r.entradas - r.saidas; return { ...r, saldoMes: r.entradas - r.saidas, saldoFinal: acum }; });
}

/** Receitas e despesas dos últimos `n` meses (até `mesFinal`), para o gráfico. */
export function serieMeses(d, mesFinal, n = 6) {
  return Array.from({ length: n }, (_, k) => { const mes = somarMesFatura(mesFinal, k - (n - 1)); const r = resumoMes(d, mes); return { mes, receitas: r.receitas, despesas: r.despesas }; });
}

/** Onde estamos entre o fechamento anterior e o fechamento da fatura, e quantos dias faltam. */
export function progressoFatura(c, mes, hoje) {
  const { vencimento, fechamento } = datasDaFatura(c, mes);
  const anterior = datasDaFatura(c, somarMesFatura(mes, -1)).fechamento;
  const pct = Math.min(1, Math.max(0, diasAte(anterior, hoje) / Math.max(1, diasAte(anterior, fechamento))));
  return { pct, diasParaFechar: diasAte(hoje, fechamento), diasParaVencer: diasAte(hoje, vencimento), fechamento, vencimento };
}

/** Avisos para o Início: o que merece atenção hoje, do mais urgente para o menos urgente. */
export function pendenciasHoje(d, hoje) {
  const out = [];
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const atrasadas = d.lancamentos.filter((l) => l.tipo === 'despesa' && estaAberto(l) && (l.situacao === 'atrasado' || (l.data && l.data < hoje)));
  if (atrasadas.length) out.push({ nivel: 'verm', texto: `${plural(atrasadas.length, 'conta a pagar atrasada', 'contas a pagar atrasadas')} (${reais(soma(atrasadas.map((l) => l.valor)))})`, href: '#/lancamentos' });
  for (const f of faturasEmAberto(d)) {
    const dias = diasAte(hoje, f.vencimento);
    const nome = `Fatura ${f.cartao.banco} ••${f.cartao.final}`;
    if (dias < 0) out.push({ nivel: 'verm', texto: `${nome} venceu há ${plural(-dias, 'dia', 'dias')}: ${reais(f.pendente)}`, href: `#/cartao/${f.cartao.id}` });
    else if (dias <= 7) out.push({ nivel: 'ouro', texto: `${nome} ${dias === 0 ? 'vence hoje' : dias === 1 ? 'vence amanhã' : `vence em ${dias} dias`}: ${reais(f.pendente)}`, href: `#/cartao/${f.cartao.id}` });
  }
  const hon = d.honorarios.filter((p) => p.status === 'aberto' && p.vencimento && p.vencimento < hoje);
  if (hon.length) out.push({ nivel: 'verm', texto: `${plural(hon.length, 'parcela de honorário atrasada', 'parcelas de honorário atrasadas')} (${reais(soma(hon.map((p) => p.valor)))})`, href: '#/honorarios' });
  const semCat = d.compras_cartao.filter((k) => !k.categoria && k.fatura >= hoje.slice(0, 7));
  if (semCat.length) out.push({ nivel: 'ouro', texto: `${plural(semCat.length, 'compra no cartão sem categoria', 'compras no cartão sem categoria')}`, href: '#/semcategoria' });
  const limite = somarDias(hoje, -30);
  const paradas = d.caixinhas.filter((c) => !c.arquivada).filter((c) => { const r = resumoCaixinha(d, c.id); return r.saldo > 0 && (!r.atualizadoEm || r.atualizadoEm < limite); });
  if (paradas.length) out.push({ nivel: 'azul', texto: `${plural(paradas.length, 'caixinha sem rendimento atualizado', 'caixinhas sem rendimento atualizado')} há mais de 30 dias`, href: '#/contas' });
  const genericas = d.caixinhas.filter((c) => !c.arquivada && norm(c.nome) === 'caixinha');
  if (genericas.length) out.push({ nivel: 'azul', texto: `${plural(genericas.length, 'caixinha ainda se chama', 'caixinhas ainda se chamam')} “Caixinha”: dê o nome pelo motivo (Viagem, Reserva…)`, href: '#/contas' });
  return out;
}

export function somarDias(iso, k) {
  const dt = new Date(iso + 'T12:00:00'); dt.setDate(dt.getDate() + k);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

// ---------- copiar contas a pagar de um mês para outro ----------
const CONTA_TIPICA = /\b(aluguel|condominio|cemig|copasa|energia|luz|agua|internet|vivo|claro|tim|oi|unimed|plano|financiamento|consorcio|seguro|mensalidade|escola|faculdade|iptu|ipva|contabilidade|contador|anuidade|oab|academia|salario|pensao|dizimo)\b/;
const RE_N_DE_M = /(\d{1,2})( de )(\d{1,2})(?!\d)/, RE_PARCELA = /(parcela\s+)(\d{1,3})(?!\d)/i;
/** Nome sem o número da parcela, para reconhecer a mesma conta em meses diferentes. */
export const baseDaConta = (desc) => norm(String(desc || '').replace(RE_N_DE_M, ' ').replace(RE_PARCELA, ' '));
/** "03 de 04" -> "04 de 04"; "Parcela 09" -> "Parcela 10". Devolve { descricao, acabou } (acabou = a última parcela já foi). */
export function proximaParcela(desc) {
  const s = String(desc || '');
  let m = s.match(RE_N_DE_M);
  if (m) {
    if (Number(m[1]) >= Number(m[3])) return { descricao: s, acabou: true };
    return { descricao: s.replace(RE_N_DE_M, `${String(Number(m[1]) + 1).padStart(m[1].length, '0')}$2$3`), acabou: false };
  }
  m = s.match(RE_PARCELA);
  if (m) return { descricao: s.replace(RE_PARCELA, `$1${String(Number(m[2]) + 1).padStart(m[2].length, '0')}`), acabou: false };
  return { descricao: s, acabou: false };
}
/** Vencimento das contas copiadas: sempre o último dia do mês de destino. */
const diaNoMesCopia = (_data, mes) => {
  const [a, m] = mes.split('-').map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`;
};
/**
 * Despesas do mês de origem que podem virar "a pagar" no mês de destino.
 * sugerida = parece conta fixa (categoria Fixas, tem parcela a vencer, ou também existiu no mês anterior à origem).
 * jaExiste = o destino já tem uma despesa com o mesmo nome.
 */
export function candidatasCopia(d, origem, destino) {
  const despesas = (mes) => d.lancamentos.filter((l) => l.tipo === 'despesa' && !l.fatura_cartao && !l.legado && mesDoLanc(l) === mes);
  const noDestino = new Set(despesas(destino).map((l) => baseDaConta(l.descricao)));
  const antes = new Set(despesas(somarMesFatura(origem, -1)).map((l) => baseDaConta(l.descricao)));
  const fixas = new Set(d.categorias.filter((c) => /fixa/.test(norm(c.nome))).map((c) => c.id));
  return despesas(origem).map((l) => {
    const prox = proximaParcela(l.descricao), base = baseDaConta(l.descricao);
    const temParcela = prox.descricao !== (l.descricao || '');
    const jaExiste = noDestino.has(base);
    return {
      origem: l.id, descricao: prox.descricao, valor: l.valor, data: diaNoMesCopia(l.data, destino), conta: l.conta || null, categoria: l.categoria || null,
      acabou: prox.acabou, jaExiste, sugerida: !prox.acabou && !jaExiste && (temParcela || fixas.has(l.categoria) || antes.has(base) || CONTA_TIPICA.test(base)),
    };
  }).sort((a, b) => Number(b.sugerida) - Number(a.sugerida) || b.valor - a.valor);
}
/** Cria os lançamentos "a pagar" escolhidos. itens: [{ descricao, valor, data, conta, categoria }] */
export const opsCopiarContas = (itens) => itens.filter((i) => i.valor > 0).map((i) => ['put', 'lancamentos', {
  id: novoId('l'), tipo: 'despesa', descricao: i.descricao, valor: i.valor, data: i.data, conta: i.conta || null, categoria: i.categoria || null, situacao: 'aberto',
}]);
