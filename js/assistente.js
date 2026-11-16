// Assistente offline: entende frases em português (digitadas ou ditadas no teclado) e devolve
//  - um rascunho de lançamento (que o app abre no formulário para você conferir e salvar), ou
//  - um relatório calculado com os dados do próprio app.
// Funções puras: sem internet, sem gravar nada. interpretar(texto, d, hoje) -> { tipo: 'lancamento' | 'relatorio' | 'nada', ... }
import { norm, hojeISO, dataBR, mesLongo } from './format.js';
import * as D from './domain.js';

// ---------- números ----------
const UNID = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, treze: 13,
  quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50,
  sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100, duzentos: 200, trezentos: 300, quatrocentos: 400, quinhentos: 500,
  seiscentos: 600, setecentos: 700, oitocentos: 800, novecentos: 900,
};
const ehPalavraNumero = (t) => t in UNID || t === 'mil';

/** "mil e quinhentos" -> 1500 (em reais). tokens já normalizados. */
function palavrasParaNumero(tokens) {
  let atual = 0, total = 0;
  for (const t of tokens) {
    if (t === 'e') continue;
    if (t === 'mil') { total += (atual || 1) * 1000; atual = 0; } else if (t in UNID) atual += UNID[t];
    else return null;
  }
  return total + atual;
}

const centavos = (reais) => Math.round(reais * 100);

// ---------- datas ----------
const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS_SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
const pad = (n) => String(n).padStart(2, '0');
const iso = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
const diasNoMes = (a, m) => new Date(a, m, 0).getDate();

function mesDaPalavra(t) {
  const i = MESES.indexOf(t);
  return i >= 0 ? i + 1 : null;
}

/** Procura uma data na frase. Devolve { data, usados: [trechos para remover] } ou null. */
function acharData(t, hoje) {
  const [A, M, Dd] = hoje.split('-').map(Number);
  let m;
  if ((m = t.match(/\banteontem\b/))) return { data: D.somarDias(hoje, -2), usados: [m[0]] };
  if ((m = t.match(/\bontem\b/))) return { data: D.somarDias(hoje, -1), usados: [m[0]] };
  if ((m = t.match(/\bamanha\b/))) return { data: D.somarDias(hoje, 1), usados: [m[0]] };
  if ((m = t.match(/\bhoje\b/))) return { data: hoje, usados: [m[0]] };
  if ((m = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const dia = Number(m[1]), mes = Number(m[2]); let ano = m[3] ? Number(m[3]) : A; if (ano < 100) ano += 2000;
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes(ano, mes)) return { data: iso(ano, mes, dia), usados: [m[0]] };
  }
  if ((m = t.match(/\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(\d{4}))?\b/)) && mesDaPalavra(m[2])) {
    const mes = mesDaPalavra(m[2]), ano = m[3] ? Number(m[3]) : A, dia = Number(m[1]);
    if (dia >= 1 && dia <= diasNoMes(ano, mes)) return { data: iso(ano, mes, dia), usados: [m[0]] };
  }
  if ((m = t.match(/\bdia\s+(\d{1,2})\b/))) {
    const dia = Number(m[1]);
    if (dia >= 1 && dia <= diasNoMes(A, M)) return { data: iso(A, M, dia), usados: [m[0]] };
  }
  if ((m = t.match(/\b(?:na|no|ultim[ao]|passad[ao])?\s*(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:[- ]feira)?\b/))) {
    const alvo = DIAS_SEMANA.indexOf(m[1]);
    const dow = new Date(hoje + 'T12:00:00').getDay();
    const volta = ((dow - alvo + 7) % 7) || 7;
    return { data: D.somarDias(hoje, -volta), usados: [m[0]] };
  }
  return null;
}

// ---------- período dos relatórios ----------
/** { mes: 'AAAA-MM', rotulo, explicito } a partir de "este mês", "outubro", "mês passado"... */
export function acharPeriodo(t, hoje, futuro = false) {
  const atual = hoje.slice(0, 7);
  if (/\b(mes passado|ultimo mes|mes anterior)\b/.test(t)) return { mes: D.somarMesFatura(atual, -1), explicito: true };
  if (/\b(proximo mes|mes que vem|mes seguinte)\b/.test(t)) return { mes: D.somarMesFatura(atual, 1), explicito: true };
  if (/\b(este mes|neste mes|mes atual|esse mes|nesse mes)\b/.test(t)) return { mes: atual, explicito: true };
  const ano = (t.match(/\b(20\d{2})\b/) || [])[1];
  for (let i = 0; i < 12; i++) {
    if (new RegExp(`\\b${MESES[i]}\\b`).test(t)) {
      let a = Number(ano || atual.slice(0, 4));
      if (!ano && futuro && pad(i + 1) < atual.slice(5)) a += 1;     // "em janeiro" olhando para frente = próximo janeiro
      return { mes: `${a}-${pad(i + 1)}`, explicito: true };
    }
  }
  return { mes: atual, explicito: false };
}

// ---------- vocabulário ----------
const RUIDO = new Set(['no', 'na', 'nos', 'nas', 'do', 'da', 'dos', 'das', 'de', 'em', 'com', 'para', 'pra', 'pro', 'um', 'uma', 'o', 'a', 'os', 'as', 'e', 'ao', 'por', 'meu', 'minha',
  'reais', 'real', 'conto', 'contos', 'pila', 'r$', 'hoje', 'ontem', 'anteontem', 'amanha', 'cartao', 'credito', 'debito', 'conta', 'fatura', 'vezes', 'vez', 'parcelas', 'parcelado',
  'dia', 'foi', 'que', 'eu', 'me', 'se', 'ja', 'la', 'ate', 'valor', 'total', 'lancamento', 'lance', 'lancar', 'registre', 'registrar', 'anote', 'anotar', 'adicione', 'adicionar']);
const VERBOS_DESPESA = /\b(gastei|gasto|gastar|paguei|pago|pagar|comprei|compra|comprar|despesa|saiu|debitou|debito|abasteci|pedi)\b/;
const VERBOS_RECEITA = /\b(recebi|receber|recebo|receberei|entrou|entrada|receita|ganhei|depositaram|caiu|cairam)\b/;
const PERGUNTA = /\b(quanto|quantos|quantas|qual|quais|quem|mostre|mostra|mostrar|relatorio|resumo|balanco|saldo|projecao|maiores|maior|me diga|diga|liste|listar|total)\b|\?/;

const SINONIMOS_CATEGORIA = [
  [/\b(mercado|supermercado|feira|padaria|acougue|hortifruti)\b/, 'supermercado'],
  [/\b(posto|combustivel|gasolina|etanol|abasteci|abastecimento)\b/, 'gasolina'],
  [/\b(cinema|netflix|spotify|passeio|show|viagem|bar|churrasco)\b/, 'lazer'],
  [/\b(farmacia|remedio|remedios|medico|consulta|exame)\b/, 'saude'],
  [/\b(restaurante|lanche|pizza|ifood|almoco|jantar|cafe)\b/, 'alimentacao'],
  [/\b(luz|agua|internet|telefone|aluguel|condominio|iptu|energia)\b/, 'fixas'],
];

/** Texto da frase em minúsculas e sem acentos, mantendo pontuação útil (vírgula e ponto de valores, barra de datas, ?). */
const limpa = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ,./$?%-]/g, ' ').replace(/\s+/g, ' ').trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const contem = (t, palavra) => new RegExp(`(^|[^a-z0-9])${escapar(palavra)}($|[^a-z0-9])`).test(t);

function acharCategoria(d, t, tipo) {
  const cats = d.categorias.filter((c) => c.tipo === tipo && !c.arquivada);
  const exata = cats.filter((c) => contem(t, norm(c.nome))).sort((a, b) => b.nome.length - a.nome.length)[0];
  if (exata) return exata;
  const porPalavra = cats.find((c) => norm(c.nome).split(/\s+/).some((p) => p.length >= 4 && contem(t, p)));
  if (porPalavra) return porPalavra;
  if (tipo === 'despesa') {
    for (const [re, alvo] of SINONIMOS_CATEGORIA) {
      if (re.test(t)) { const c = cats.find((x) => norm(x.nome).includes(alvo)); if (c) return c; }
    }
  }
  return null;
}

function acharConta(d, t) {
  const contas = D.contasAtivas(d);
  const exatas = contas.filter((c) => contem(t, norm(c.nome)));
  if (exatas.length) return exatas.sort((a, b) => b.nome.length - a.nome.length)[0];
  // primeira palavra do nome, se só uma conta a tiver ("itau" para "Itaú PJ")
  const prim = (c) => norm(c.nome).split(/\s+/)[0];
  for (const c of contas) {
    const p = prim(c);
    if (p.length >= 3 && contem(t, p) && contas.filter((x) => prim(x) === p).length === 1) return c;
  }
  return null;
}

function acharCartao(d, t) {
  const ativos = (d.cartoes || []).filter((c) => !c.arquivado);
  const porBanco = ativos.filter((c) => contem(t, norm(c.banco)));
  if (porBanco.length === 1) return porBanco[0];
  if (porBanco.length > 1) { const porFinal = porBanco.find((c) => contem(t, c.final)); return porFinal || porBanco[0]; }
  return null;
}

// ---------- lançamento ----------
function acharValor(t) {
  // tira datas, "dia N", parcelas e finais de cartão para não confundir com o valor
  const limpo = t
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\bdia\s+\d{1,2}\b/g, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s+de\\s+(${MESES.join('|')})(\\s+de\\s+\\d{4})?\\b`, 'g'), ' ')
    .replace(/\b(em\s+)?\d{1,2}\s*(x|vezes|parcelas)\b/g, ' ')
    .replace(/\bfinal\s+\d{4}\b/g, ' ');
  let m = limpo.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
  if (m) return { valor: centavos(parseFloat(m[1].replace(',', '.')) * 1000), trecho: m[0] };
  const re = /(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?(?!\d)(?:\s*(?:reais|real|conto|contos|pila|pilas))?/g;
  const todos = [...limpo.matchAll(re)].filter((x) => x[0].trim());
  if (todos.length) {
    const preferido = todos.find((x) => /r\$|reais|real|conto|pila/.test(x[0])) || todos[0];
    const inteiro = Number(preferido[1].replace(/\./g, ''));
    const cent = preferido[2] ? Number(preferido[2].padEnd(2, '0')) : 0;
    return { valor: inteiro * 100 + cent, trecho: preferido[0] };
  }
  // por extenso: "cinquenta reais", "mil e quinhentos"
  const toks = limpo.split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i++) {
    if (!ehPalavraNumero(toks[i])) continue;
    let j = i; const run = [];
    while (j < toks.length && (ehPalavraNumero(toks[j]) || (toks[j] === 'e' && j + 1 < toks.length && ehPalavraNumero(toks[j + 1]) && run.length))) { run.push(toks[j]); j++; }
    const n = palavrasParaNumero(run);
    if (n && n > 0) return { valor: n * 100, trecho: run.join(' ') };
    i = j;
  }
  return null;
}

function acharParcelas(t) {
  const m = t.match(/\b(?:em\s+|parcelad[oa]\s+em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas)\b/) || t.match(/\bem\s+([a-z]+)\s+(?:vezes|parcelas)\b/);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? Number(m[1]) : UNID[m[1]];
  return n >= 2 && n <= 48 ? { n, trecho: m[0] } : null;
}

function interpretarLancamento(d, texto, hoje) {
  const t = limpa(texto);
  const val = acharValor(t);
  if (!val || !(val.valor > 0)) return null;

  const dataAch = acharData(t, hoje);
  const parc = acharParcelas(t);
  const ehTransf = /\btransfer/.test(t);
  let tipo = ehTransf ? 'transferencia' : VERBOS_RECEITA.test(t) && !VERBOS_DESPESA.test(t.replace(/\bpagar\b/, '')) ? 'receita' : 'despesa';
  if (!ehTransf && /\b(recebi|recebo|receber|entrou|ganhei|receita)\b/.test(t)) tipo = 'receita';

  const futuro = /\b(vou|preciso|tenho que|tenho de|devo|terei que)\s+(pagar|receber)\b|\ba (pagar|receber)\b|\bvence\b|\bvencimento\b|\bvai entrar\b/.test(t);
  const usouCartao = tipo === 'despesa' && /\b(cartao|credito|fatura)\b/.test(t);
  const cartao = usouCartao ? acharCartao(d, t) : null;

  // conta: ignora o trecho "cartão <banco>" para não confundir com a conta do mesmo banco
  const tConta = usouCartao ? t.replace(/\b(cartao|credito)\s+(do|da|de)?\s*\w+/g, ' ') : t;
  let conta = null, conta_origem = null, conta_destino = null;
  if (tipo === 'transferencia') {
    const cs = D.contasAtivas(d), prim = (c) => norm(c.nome).split(/\s+/)[0];
    const pos = (c) => { const i = t.indexOf(norm(c.nome)); if (i >= 0) return i; const p = prim(c); return p.length >= 3 && cs.filter((x) => prim(x) === p).length === 1 ? t.search(new RegExp(`(^|[^a-z0-9])${escapar(p)}($|[^a-z0-9])`)) : -1; };
    const achadas = cs.map((c) => ({ c, i: pos(c) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i);
    const ordem = achadas.map((x) => x.c);
    if (ordem.length >= 2) {
      const iPara = Math.max(t.indexOf(' para '), t.indexOf(' pra '));
      const primeiroAntes = iPara < 0 || achadas[0].i < iPara;
      [conta_origem, conta_destino] = primeiroAntes ? [ordem[0].id, ordem[1].id] : [ordem[1].id, ordem[0].id];
    } else if (ordem.length === 1) {
      conta_origem = ordem[0].id;
    }
  } else if (!usouCartao) conta = acharConta(d, tConta);

  const categoria = tipo === 'transferencia' ? null : acharCategoria(d, t, tipo);

  // descrição: palavras da frase original (com acento) que sobram depois de tirar valor, data, verbos, contas e palavras de ligação
  const nomesConta = new Set(D.contasAtivas(d).flatMap((c) => norm(c.nome).split(/\s+/)));
  const nomesBanco = new Set(cartao ? norm(cartao.banco).split(/\s+/) : []);
  const ehNumeroPalavra = /\b(reais|real|conto|contos|pila)\b/.test(t) || ehPalavraNumero(limpa(val.trecho).split(' ')[0]);
  const lixo = (nt) => RUIDO.has(nt) || /^[\d.,/$r]+$/.test(nt) || /^\d+x$/.test(nt) || VERBOS_DESPESA.test(nt) || VERBOS_RECEITA.test(nt) || /^transfer/.test(nt)
    || ['vence', 'vencimento', 'vou', 'preciso', 'tenho', 'pagar', 'receber', 'feira', 'final'].includes(nt)
    || nomesConta.has(nt) || nomesBanco.has(nt) || (dataAch && (MESES.includes(nt) || DIAS_SEMANA.includes(nt))) || (ehNumeroPalavra && ehPalavraNumero(nt)) || (cartao && nt === cartao.final);
  const palavras = String(texto).split(/\s+/).map((p) => p.replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}]+$/gu, '')).filter((p) => p && !lixo(limpa(p)));
  let descricao = palavras.join(' ');
  const memoria = D.memoriaDescricoes(d).get(norm(descricao));
  if (tipo === 'transferencia') descricao = descricao || '';
  else if (!descricao) descricao = categoria ? categoria.nome : usouCartao ? 'Compra no cartão' : tipo === 'receita' ? 'Receita' : 'Despesa';
  else if (memoria?.descricao) descricao = memoria.descricao;
  else descricao = cap(descricao);

  const data = dataAch ? dataAch.data : hoje;
  const situacao = tipo === 'transferencia' ? 'pago' : (futuro || (data > hoje)) && !usouCartao ? 'aberto' : 'pago';
  const catFinal = categoria?.id || memoria?.categoria || null;
  const contaFinal = tipo === 'transferencia' ? null : usouCartao ? null : conta?.id || memoria?.conta || null;

  const rascunho = {
    tipo, valor: val.valor, descricao, data, situacao, categoria: catFinal,
    conta: contaFinal, conta_origem, conta_destino,
    cartao: usouCartao, cartao_id: cartao?.id || null, parcelas: usouCartao && parc ? parc.n : 1,
  };
  const n = (id) => d.categorias.find((c) => c.id === id)?.nome;
  const nc = (id) => d.contas.find((c) => c.id === id)?.nome;
  const linhas = [['Tipo', tipo === 'receita' ? 'Receita' : tipo === 'transferencia' ? 'Transferência' : usouCartao ? 'Despesa no cartão' : 'Despesa'], ['Valor', val.valor]];
  if (descricao) linhas.push(['Descrição', descricao]);
  linhas.push(['Data', dataBR(data)]);
  if (tipo === 'transferencia') linhas.push(['Saiu de', nc(conta_origem) || '— você escolhe'], ['Entrou em', nc(conta_destino) || '— você escolhe']);
  else if (usouCartao) linhas.push(['Cartão', cartao ? `${cartao.banco} ••${cartao.final}` : 'o último usado'], ['Parcelas', rascunho.parcelas > 1 ? `${rascunho.parcelas}x` : 'à vista']);
  else linhas.push([tipo === 'receita' ? 'Entrou em' : 'Saiu de', nc(contaFinal) || 'conta de sempre']);
  if (tipo !== 'transferencia') linhas.push(['Categoria', n(catFinal) || '— você escolhe']);
  if (tipo !== 'transferencia' && !usouCartao) linhas.push(['Situação', situacao === 'pago' ? (tipo === 'receita' ? 'Recebida' : 'Paga') : (tipo === 'receita' ? 'A receber' : 'A pagar')]);
  return { tipo: 'lancamento', rascunho, linhas };
}

// ---------- relatórios ----------
const itemLanc = (l, n) => ({ id: l.id, titulo: l.descricao || 'Sem descrição', detalhe: `${l.data ? dataBR(l.data) : ''}${n.cat.get(l.categoria) ? ' · ' + n.cat.get(l.categoria) : ''}`.replace(/^ · /, ''), valor: l.valor, cor: l.tipo === 'receita' ? 'verde' : 'verm' });
const itemCompra = (k, n) => ({ id: k.id, titulo: k.descricao || 'Compra no cartão', detalhe: `${k.data ? dataBR(k.data) : ''} · cartão${n.cat.get(k.categoria) ? ' · ' + n.cat.get(k.categoria) : ''}`.replace(/^ · /, ''), valor: k.valor, cor: 'verm' });
const nomesDe = (d) => ({ cat: new Map(d.categorias.map((c) => [c.id, c.nome])), conta: new Map(d.contas.map((c) => [c.id, c.nome])) });

/** Despesas do mês como o app as conta: lançamentos (sem pagamento de fatura) + compras do cartão da fatura do mês. */
function despesasDoMes(d, mes) {
  const n = nomesDe(d);
  const itens = d.lancamentos.filter((l) => l.tipo === 'despesa' && !l.fatura_cartao && D.mesDoLanc(l) === mes).map((l) => itemLanc(l, n));
  for (const c of d.cartoes || []) {
    if (mes < D.controleDesde(c)) continue;
    for (const k of d.compras_cartao || []) if (k.cartao === c.id && k.fatura === mes) itens.push(itemCompra(k, n));
  }
  return itens;
}

function relatorio(d, texto, hoje) {
  const t = limpa(texto);
  const olhaFrente = /\b(projecao|vou ter|vai sobrar|vai ficar|vence|vencem|vencimento|a pagar|a receber|receber|honorario|honorarios)\b/.test(t) && !/\b(recebi|gastei|paguei)\b/.test(t);
  const per = acharPeriodo(t, hoje, olhaFrente);
  const mes = per.mes;
  const n = nomesDe(d);
  const rotuloMes = mesLongo(mes);
  const conta = acharConta(d, t);
  const dif = (a) => a.sort((x, y) => y.valor - x.valor);

  // honorários
  if (/\b(honorario|honorarios|clientes?|devendo|devem|devedores)\b/.test(t)) {
    const apenasAtrasados = /\batrasad/.test(t);
    const cl = new Map(d.contratos.map((c) => [c.id, c]));
    let ps = d.honorarios.filter((p) => p.status === 'aberto');
    if (apenasAtrasados) ps = ps.filter((p) => p.vencimento && p.vencimento < hoje);
    else if (per.explicito) ps = ps.filter((p) => p.vencimento && p.vencimento.slice(0, 7) === mes);
    ps.sort((a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999'));
    const total = ps.reduce((s, p) => s + p.valor, 0);
    return {
      tipo: 'relatorio', titulo: apenasAtrasados ? 'Honorários atrasados' : per.explicito ? `Honorários a receber em ${rotuloMes}` : 'Honorários a receber',
      destaque: { rotulo: apenasAtrasados ? 'Atrasado' : 'A receber', valor: total, cor: apenasAtrasados ? 'verm' : 'azul' },
      linhas: ps.slice(0, 15).map((p) => { const c = cl.get(p.contrato); return { href: `#/honorario/${p.contrato}`, titulo: c?.cliente || 'Cliente', detalhe: `${p.vencimento ? dataBR(p.vencimento) : 'sem data'} · parcela ${c ? D.rotuloParcela(p, c) : p.numero}${p.vencimento && p.vencimento < hoje ? ' · atrasada' : ''}`, valor: p.valor, cor: p.vencimento && p.vencimento < hoje ? 'verm' : '' }; }),
      nota: ps.length > 15 ? `Mostrando 15 de ${ps.length} parcelas. Veja todas na tela Honorários.` : ps.length ? 'Toque em uma parcela para abrir o honorário.' : 'Nenhuma parcela encontrada.',
    };
  }

  // projeção
  if (/\b(projecao|projetar|como vou chegar|vou ter|vou chegar|vai sobrar|vai ficar)\b/.test(t) || /\bquanto (vou|vai) (ter|sobrar|ficar)\b/.test(t)) {
    const p = D.projecaoMeses(d, hoje, 12);
    if (per.explicito) {
      const m = p.find((x) => x.mes === mes);
      if (!m) return { tipo: 'nada', mensagem: 'A projeção cobre os próximos 12 meses. Escolha um mês dentro desse período.' };
      return { tipo: 'relatorio', titulo: `Projeção para ${rotuloMes}`, destaque: { rotulo: 'Saldo previsto no fim do mês', valor: m.saldoFinal, cor: m.saldoFinal < 0 ? 'verm' : 'azul' },
        linhas: [{ titulo: 'Entra no mês', valor: m.entradas, cor: 'verde' }, { titulo: 'Sai no mês', valor: m.saidas, cor: 'verm' }, { titulo: 'Sobra no mês', valor: m.saldoMes, cor: m.saldoMes < 0 ? 'verm' : '' }],
        nota: 'Estimativa com o que já está lançado como a receber e a pagar, parcelas de honorários e faturas de cartão.', href: '#/projecao' };
    }
    return { tipo: 'relatorio', titulo: 'Projeção dos próximos meses', destaque: { rotulo: 'Saldo hoje em contas', valor: D.totalContas(d), cor: 'azul' },
      linhas: p.slice(0, 6).map((m) => ({ titulo: mesLongo(m.mes), detalhe: `entra ${(m.entradas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · sai ${(m.saidas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, valor: m.saldoFinal, cor: m.saldoFinal < 0 ? 'verm' : 'azul' })),
      nota: 'Estimativa com o que já está lançado como a receber e a pagar.', href: '#/projecao' };
  }

  // cartão / fatura
  if (/\b(fatura|faturas|cartao|cartoes)\b/.test(t)) {
    const alvo = acharCartao(d, t);
    const cartoes = (d.cartoes || []).filter((c) => !c.arquivado && (!alvo || c.id === alvo.id));
    if (!cartoes.length) return { tipo: 'nada', mensagem: 'Não encontrei cartão cadastrado. Cadastre em Contas › Cartões de crédito.' };
    const sits = cartoes.map((c) => D.situacaoFatura(d, c, per.explicito ? mes : D.faturaDaVezDoCartao(d, c, hoje).mes));
    const total = sits.reduce((s, x) => s + x.total, 0), pend = sits.reduce((s, x) => s + x.pendente, 0);
    const STATUS = { aberta: 'em aberto', parcial: 'paga em parte', paga: 'paga', antiga: 'anterior ao controle', vazia: 'sem compras' };
    const linhas = sits.map((s) => ({ id: `f:${s.cartao.id}:${s.mes}`, titulo: `${s.cartao.banco} ••${s.cartao.final} · ${mesLongo(s.mes)}`, detalhe: `vence ${dataBR(s.vencimento)} · ${STATUS[s.status]}`, valor: s.total, cor: 'verm' }));
    if (sits.length === 1) for (const k of d.compras_cartao.filter((x) => x.cartao === sits[0].cartao.id && x.fatura === sits[0].mes).sort((a, b) => b.valor - a.valor).slice(0, 10)) linhas.push(itemCompra(k, n));
    return { tipo: 'relatorio', titulo: sits.length === 1 ? `Fatura ${sits[0].cartao.banco} ••${sits[0].cartao.final}` : 'Faturas dos cartões', destaque: { rotulo: pend > 0 ? 'Falta pagar' : 'Total da fatura', valor: pend > 0 ? pend : total, cor: 'verm' },
      linhas, nota: pend > 0 && pend !== total ? `Total da fatura: ${(total / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` : 'Toque na fatura para pagar ou ver as compras.' };
  }

  // vencimentos (contas a pagar)
  if (/\b(vence|vencem|vencimento|vencimentos|a pagar|contas a pagar|pagamentos|pendentes)\b/.test(t) && !/\bgastei\b/.test(t)) {
    let ini = hoje, fim = per.explicito ? null : D.somarDias(hoje, 7), rotulo = 'Contas a pagar nos próximos 7 dias';
    if (/\bhoje\b/.test(t)) { fim = hoje; rotulo = 'Contas que vencem hoje'; }
    else if (/\bamanha\b/.test(t)) { ini = fim = D.somarDias(hoje, 1); rotulo = 'Contas que vencem amanhã'; }
    else if (/\bsemana\b/.test(t)) { fim = D.somarDias(hoje, 7); rotulo = 'Contas a pagar nos próximos 7 dias'; }
    else if (per.explicito || /\ba pagar\b/.test(t)) { fim = null; rotulo = `Contas a pagar em ${rotuloMes}`; }
    const itens = [];
    for (const l of d.lancamentos) {
      if (l.tipo !== 'despesa' || !D.estaAberto(l)) continue;
      const dt = l.data || (l.mes ? `${l.mes}-28` : null);
      if (fim === null ? D.mesDoLanc(l) !== mes : !(dt && dt >= ini && dt <= fim)) continue;
      itens.push({ ...itemLanc(l, n), _d: dt || '' });
    }
    for (const f of D.faturasEmAberto(d)) {
      if (fim === null ? f.mes !== mes : !(f.vencimento >= ini && f.vencimento <= fim)) continue;
      itens.push({ id: `f:${f.cartao.id}:${f.mes}`, titulo: `Fatura ${f.cartao.banco} ••${f.cartao.final}`, detalhe: `vence ${dataBR(f.vencimento)}`, valor: f.pendente, cor: 'verm', _d: f.vencimento });
    }
    itens.sort((a, b) => a._d.localeCompare(b._d));
    return { tipo: 'relatorio', titulo: rotulo, destaque: { rotulo: 'Total a pagar', valor: itens.reduce((s, i) => s + i.valor, 0), cor: 'verm' }, linhas: itens.slice(0, 20).map(({ _d, ...x }) => x), nota: itens.length ? 'Toque em um item para pagar ou ver detalhes.' : 'Nada a pagar neste período.' };
  }

  // quanto falta receber (sem honorários)
  if (/\b(a receber|falta receber|vou receber|receber)\b/.test(t) && !/\brecebi\b/.test(t)) {
    const itens = d.lancamentos.filter((l) => l.tipo === 'receita' && D.estaAberto(l) && D.mesDoLanc(l) === mes).map((l) => itemLanc(l, n));
    return { tipo: 'relatorio', titulo: `A receber em ${rotuloMes}`, destaque: { rotulo: 'A receber', valor: itens.reduce((s, i) => s + i.valor, 0), cor: 'verde' }, linhas: itens.slice(0, 20), nota: itens.length ? '' : 'Nada a receber neste mês.' };
  }

  // saldo
  if (/\b(saldo|quanto (eu )?tenho|dinheiro|patrimonio)\b/.test(t) && !/\bsaldo do mes\b/.test(t)) {
    if (conta) {
      const s = D.saldosContas(d)[conta.id] || 0;
      return { tipo: 'relatorio', titulo: `Saldo · ${conta.nome}`, destaque: { rotulo: 'Saldo atual', valor: s, cor: s < 0 ? 'verm' : 'azul' }, linhas: [], href: '#/contas' };
    }
    const g = D.saldoGeral(d, hoje), s = D.saldosContas(d);
    return { tipo: 'relatorio', titulo: 'Saldo geral', destaque: { rotulo: 'Saldo geral', valor: g.total, cor: 'azul' },
      linhas: [{ titulo: 'Em contas', valor: g.contas }, { titulo: 'Caixinhas', valor: g.caixinhas }, { titulo: 'Empréstimos a receber', valor: g.emprestimo }, { titulo: 'Em aberto (a receber − a pagar)', valor: g.aberto, cor: g.aberto < 0 ? 'verm' : '' },
        ...D.contasAtivas(d).map((c) => ({ titulo: `· ${c.nome}`, valor: s[c.id] || 0 }))], href: '#/contas' };
  }

  // maiores despesas
  if (/\b(maiores|maior|mais cara|mais caras|top)\b/.test(t)) {
    const itens = dif(despesasDoMes(d, mes)).slice(0, 8);
    return { tipo: 'relatorio', titulo: `Maiores despesas · ${rotuloMes}`, destaque: { rotulo: 'Soma das maiores', valor: itens.reduce((s, i) => s + i.valor, 0), cor: 'verm' }, linhas: itens, nota: itens.length ? '' : 'Sem despesas neste mês.' };
  }

  // gasto por categoria
  const gastoVerbo = /\b(gast\w*|despes\w*|paguei|saiu|consumi)\b/.test(t);
  const cat = acharCategoria(d, t, 'despesa');
  if (cat && (gastoVerbo || /\bquanto\b/.test(t))) {
    const itens = despesasDoMes(d, mes).filter((i) => {
      const l = d.lancamentos.find((x) => x.id === i.id) || d.compras_cartao.find((x) => x.id === i.id);
      return l && l.categoria === cat.id;
    });
    const total = (D.despesasPorCategoria(d, mes).find((c) => c.id === cat.id) || { valor: 0 }).valor;
    const m = D.metasDoMes(d, mes).find((x) => x.id === cat.id);
    return { tipo: 'relatorio', titulo: `${cat.nome} · ${rotuloMes}`, destaque: { rotulo: 'Gasto no mês', valor: total, cor: 'verm' }, linhas: dif(itens).slice(0, 60),
      nota: m ? (m.estourou ? `Meta de ${(m.meta / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}: passou ${(-m.restante / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` : `Meta de ${(m.meta / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}: faltam ${(m.restante / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`) : (itens.length ? '' : 'Nenhum gasto nesta categoria no mês.') };
  }

  // resumo geral / gastos / receitas do mês
  const r = D.resumoMes(d, mes);
  if (/\b(resumo|relatorio|balanco|como estou|como esta)\b/.test(t)) {
    const cats = D.despesasPorCategoria(d, mes).slice(0, 6);
    return { tipo: 'relatorio', titulo: `Resumo · ${rotuloMes}`, destaque: { rotulo: 'Saldo do mês', valor: r.saldo, cor: r.saldo < 0 ? 'verm' : 'azul' },
      linhas: [{ titulo: 'Receitas', detalhe: `recebido ${(r.recebido / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, valor: r.receitas, cor: 'verde' }, { titulo: 'Despesas', detalhe: `pago ${(r.pagas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, valor: r.despesas, cor: 'verm' },
        ...cats.map((c) => ({ titulo: `· ${c.nome}`, detalhe: `${(c.pct * 100).toFixed(0)}% das despesas`, valor: c.valor, cor: 'verm' }))], href: '#/mes' };
  }
  if (gastoVerbo) {
    const cats = D.despesasPorCategoria(d, mes).slice(0, 8);
    return { tipo: 'relatorio', titulo: `Despesas · ${rotuloMes}`, destaque: { rotulo: 'Total de despesas', valor: r.despesas, cor: 'verm' },
      linhas: cats.map((c) => ({ titulo: c.nome, detalhe: `${(c.pct * 100).toFixed(0)}% das despesas`, valor: c.valor, cor: 'verm' })), nota: `Já pagas: ${(r.pagas / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · a pagar: ${(r.aPagar / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, href: '#/mes' };
  }
  if (/\b(receb\w*|receita\w*|entrou|entrada\w*|faturei|faturamento)\b/.test(t)) {
    const itens = d.lancamentos.filter((l) => l.tipo === 'receita' && D.mesDoLanc(l) === mes).sort((a, b) => b.valor - a.valor).map((l) => itemLanc(l, n));
    return { tipo: 'relatorio', titulo: `Receitas · ${rotuloMes}`, destaque: { rotulo: 'Total de receitas', valor: r.receitas, cor: 'verde' }, linhas: itens.slice(0, 20), nota: `Já recebido: ${(r.recebido / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} · a receber: ${(r.aReceber / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`, href: '#/mes' };
  }
  return null;
}

export const EXEMPLOS = [
  'Gastei 80 no supermercado ontem no Itaú',
  'Recebi 1.500 do Fulano hoje',
  'Comprei 300 no cartão em 3 vezes',
  'Quanto gastei no mês?',
  'Quanto gastei com supermercado?',
  'Qual a fatura do cartão?',
  'Honorários atrasados',
  'Contas a pagar esta semana',
  'Quanto vou ter em janeiro?',
  'Saldo geral',
];

/** Ponto de entrada. */
export function interpretar(texto, d, hoje = hojeISO()) {
  const t = limpa(texto || '');
  if (!t) return { tipo: 'nada', mensagem: 'Escreva ou dite uma frase.' };
  const pergunta = PERGUNTA.test(t) || /\b(honorarios|contas a pagar|vence|vencem)\b/.test(t);
  if (pergunta && !(/\bgastei \d|\brecebi \d|\bpaguei \d/.test(t))) {
    const r = relatorio(d, texto, hoje);
    if (r) return r;
  }
  const l = interpretarLancamento(d, texto, hoje);
  if (l) return l;
  if (/\b(gastei|paguei|comprei|recebi|ganhei)\b/.test(t)) return { tipo: 'nada', mensagem: 'Entendi que é um lançamento, mas não achei o valor. Diga, por exemplo: “gastei 80 no supermercado”.' };
  const r = relatorio(d, texto, hoje);
  if (r) return r;
  if (VERBOS_DESPESA.test(t) || VERBOS_RECEITA.test(t)) return { tipo: 'nada', mensagem: 'Entendi que é um lançamento, mas não achei o valor. Diga, por exemplo: “gastei 80 no supermercado”.' };
  return { tipo: 'nada', mensagem: 'Não entendi essa frase. Veja os exemplos abaixo.' };
}
