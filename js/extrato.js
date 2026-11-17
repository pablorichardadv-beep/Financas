// Importar extrato bancário (PDF do Itaú): ler as linhas, comparar com o que já está no app e montar as gravações.
// Funções puras, exceto lerPdf (que usa o pdf.js guardado em js/vendor, sem internet).
import { norm, novoId } from './format.js';
import * as D from './domain.js';

// ---------- leitura do PDF ----------
/** Abre o PDF e devolve os pedaços de texto com posição: [{ p, x, y, t }]. */
export async function lerPdf(bytes) {
  const pdfjs = await import('./vendor/pdf.min.js');
  const workerUrl = new URL('./vendor/pdf.worker.min.js', import.meta.url).href;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  } catch (e) {
    // plano B: sem "worker" separado (alguns Safari recusam o worker em módulo); roda tudo na própria página
    globalThis.pdfjsWorker = await import('./vendor/pdf.worker.min.js');
    doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  }
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    for (const it of tc.items) if (it.str && it.str.trim()) out.push({ p, x: it.transform[4], y: it.transform[5], t: it.str.trim() });
  }
  try { await (doc.destroy ? doc.destroy() : doc.loadingTask?.destroy()); } catch { /* sem importância */ }
  return out;
}

const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_VALOR = /^-?\d{1,3}(\.\d{3})*,\d{2}$/;
const isoDe = (s) => { const m = s.match(RE_DATA); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
/** "-1.000,00" -> -100000 (centavos) */
export const centavosDe = (s) => { const neg = /^-/.test(s.trim()); const n = Number(s.replace(/[^\d]/g, '')); return neg ? -n : n; };

/** Agrupa os pedaços em linhas (mesma página e altura parecida), de cima para baixo e da esquerda para a direita. */
function emLinhas(itens) {
  const ord = [...itens].sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const it of ord) {
    const ult = linhas[linhas.length - 1];
    if (ult && ult.p === it.p && Math.abs(ult.y - it.y) <= 3) ult.cels.push(it);
    else linhas.push({ p: it.p, y: it.y, cels: [it] });
  }
  for (const l of linhas) l.cels.sort((a, b) => a.x - b.x);
  return linhas;
}

/**
 * Lê o extrato de conta corrente do Itaú (PDF do app/internet banking).
 * Devolve { banco, titular, saldoFinal, inicio, fim, linhas: [{ data, tipo, descricao, valor, futuro }], saldosDia: { 'AAAA-MM-DD': centavos } }.
 */
export function lerExtratoItau(itens) {
  const linhas = emLinhas(itens);
  const textoLinha = (l) => l.cels.map((c) => c.t).join(' ');
  const out = { banco: 'Itaú', titular: '', saldoFinal: null, inicio: null, fim: null, linhas: [], saldosDia: {} };
  // cabeçalho: titular (primeira linha), "Saldo em conta" e período
  out.titular = textoLinha(linhas[0] || { cels: [] }).trim();
  for (let i = 0; i < linhas.length; i++) {
    const t = textoLinha(linhas[i]);
    if (/^saldo em conta$/i.test(t) && linhas[i + 1]) out.saldoFinal = centavosDe(textoLinha(linhas[i + 1]).replace('R$', ''));
    const per = t.match(/(\d{2}\/\d{2}\/\d{4})\s+até\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (per) { out.inicio = isoDe(per[1]); out.fim = isoDe(per[2]); }
  }
  // tabelas
  let colunas = null, futuro = false, ativo = false, atual = null;
  const fecha = () => {
    if (!atual) return;
    const valor = atual.valor.find((v) => RE_VALOR.test(v));
    const saldo = atual.saldo.find((v) => RE_VALOR.test(v));
    if (valor) out.linhas.push({ data: atual.data, tipo: atual.tipo.join(' ').trim(), descricao: atual.descricao.join(' ').replace(/\s+/g, ' ').trim(), valor: centavosDe(valor), futuro });
    else if (saldo) out.saldosDia[atual.data] = centavosDe(saldo);
    atual = null;
  };
  for (const l of linhas) {
    const t = textoLinha(l);
    if (/^lançamentos futuros/i.test(t)) { fecha(); futuro = true; ativo = false; continue; }
    if (/^lançamentos$/i.test(t)) { fecha(); futuro = false; ativo = false; continue; }
    if (/^(posição consolidada|limites|aviso)\b/i.test(t)) { fecha(); ativo = false; colunas = null; continue; }
    if (l.cels.some((c) => /^data$/i.test(c.t)) && l.cels.some((c) => /^descrição$/i.test(c.t))) {
      fecha();
      const x = (re) => l.cels.find((c) => re.test(c.t))?.x;
      colunas = { tipo: x(/^lançamentos$/i), descricao: x(/^descrição$/i), valor: x(/^valor/i), saldo: x(/^saldo/i) };
      ativo = true;
      continue;
    }
    if (!ativo || !colunas) continue;
    const primeira = l.cels[0];
    const data = isoDe(primeira.t);
    if (data && primeira.x < colunas.tipo - 5) { fecha(); atual = { data, tipo: [], descricao: [], valor: [], saldo: [] }; }
    if (!atual) continue;
    for (const c of l.cels) {
      if (c === primeira && data) continue;
      const col = c.x >= colunas.saldo - 5 ? 'saldo' : c.x >= colunas.valor - 5 ? 'valor' : c.x >= colunas.descricao - 5 ? 'descricao' : c.x >= colunas.tipo - 5 ? 'tipo' : null;
      if (col) atual[col].push(c.t);
    }
  }
  fecha();
  return out;
}

// ---------- leitura do texto copiado do PDF (plano C: abrir o PDF, Selecionar tudo › Copiar › Colar) ----------
const TIPOS_ITAU = ['PAGAMENTO DE PIX QR CODE', 'PAGAMENTO DE PIX', 'PAGAMENTO DE BOLETO', 'PAGAMENTO DE TARIFA', 'PAGAMENTO DE SEGURO', 'PAGAMENTO DE CONTA',
  'DÉBITO AUTOMÁTICO', 'COMPRA DÉBITO', 'COMPRA CRÉDITO', 'PIX RECEBIDO', 'PIX ENVIADO', 'PIX AUTOMÁTICO', 'TED RECEBIDA', 'TED ENVIADA', 'DOC RECEBIDO',
  'TRANSFERÊNCIA RECEBIDA', 'TRANSFERÊNCIA ENVIADA', 'RENDIMENTOS', 'ENTRADA', 'SAÍDA', 'SAQUE', 'DEPÓSITO', 'ESTORNO', 'IOF', 'JUROS'];
const RE_VALOR_FIM = /(-?\d{1,3}(?:\.\d{3})*,\d{2})\s*$/;
export function lerExtratoTexto(texto) {
  const linhasTxt = String(texto || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out = { banco: 'Itaú', titular: linhasTxt[0] || '', saldoFinal: null, inicio: null, fim: null, linhas: [], saldosDia: {} };
  const todo = linhasTxt.join('\n');
  const sc = todo.match(/saldo em conta\s*\n?\s*R\$\s*(-?[\d.]+,\d{2})/i);
  if (sc) out.saldoFinal = centavosDe(sc[1]);
  const per = todo.match(/(\d{2}\/\d{2}\/\d{4})\s+até\s+(\d{2}\/\d{2}\/\d{4})/i);
  if (per) { out.inicio = isoDe(per[1]); out.fim = isoDe(per[2]); }
  let futuro = false, ativo = false, atual = null;
  const fecha = () => {
    if (!atual) return;
    let corpo = atual.partes.join(' ').replace(/\s+/g, ' ').trim();
    const mv = corpo.match(RE_VALOR_FIM);
    if (mv) {
      corpo = corpo.slice(0, mv.index).trim();
      if (!corpo) out.saldosDia[atual.data] = centavosDe(mv[1]);
      else {
        const sem = corpo.toUpperCase();
        const tipo = TIPOS_ITAU.find((t) => sem.startsWith(t + ' ') || sem === t) || '';
        out.linhas.push({ data: atual.data, tipo, descricao: (tipo ? corpo.slice(tipo.length) : corpo).trim() || corpo, valor: centavosDe(mv[1]), futuro });
      }
    }
    atual = null;
  };
  for (const l of linhasTxt) {
    if (/^lançamentos futuros/i.test(l)) { fecha(); futuro = true; ativo = true; continue; }
    if (/^lançamentos$/i.test(l)) { fecha(); futuro = false; ativo = true; continue; }
    if (/^(posição consolidada|limites\b|aviso\b)/i.test(l)) { fecha(); ativo = false; continue; }
    if (/^data\b.*descri/i.test(l) || /^(saídas|entradas) futuras$/i.test(l)) { fecha(); continue; }
    if (!ativo) continue;
    const m = l.match(/^(\d{2}\/\d{2}\/\d{4})\s*(.*)$/);
    if (m) { fecha(); atual = { data: isoDe(m[1]), partes: [m[2]] }; continue; }
    if (atual) atual.partes.push(l);
  }
  fecha();
  return out;
}

// ---------- comparação com o app ----------
const diasEntre = (a, b) => Math.abs(D.diasAte(a, b));
const cap = (s) => String(s || '').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

/** Efeito do lançamento na conta (positivo entra, negativo sai), pago ou não. */
function efeito(l, conta) {
  if (l.tipo === 'receita') return l.conta === conta ? l.valor : 0;
  if (l.tipo === 'despesa') return l.conta === conta ? -l.valor : 0;
  if (l.tipo === 'transferencia') return (l.conta_origem === conta ? -l.valor : 0) + (l.conta_destino === conta ? l.valor : 0);
  return 0;
}

const PALAVRAS_CAT = [
  [/rend pago|rendiment/, 'rendiment'], [/superm|mercado|hortifruti|acougue|padaria/, 'supermercado'], [/posto|combust/, 'gasolina'],
  [/drogaria|farmac|droga/, 'farmac'], [/cemig|copasa|telefonica|vivo|claro|tim |unimed|tar pacote|seguro/, 'fixa'],
];

/**
 * Compara as linhas do extrato com os lançamentos da conta.
 * Cada item ganha status:
 *  'no_app'      — já está lançado (mesmo valor e sentido, data até 4 dias de diferença);
 *  'baixar'      — bate com um lançamento "a pagar"/"a receber": basta marcar como pago;
 *  'divergente'  — há um lançamento parecido com valor um pouco diferente (até R$ 5,00);
 *  'novo'        — não está no app (sugere descrição, categoria ou transferência);
 *  'futuro'      — saída/entrada agendada no banco.
 * Também lista o que está no app (pago, nesta conta, no período) e não aparece no extrato.
 */
export function conciliar(d, conta, ext) {
  const usados = new Set();
  const naConta = d.lancamentos.filter((l) => efeito(l, conta) !== 0 && l.data);
  const inicio = ext.linhas.reduce((m, l) => (l.data < m ? l.data : m), ext.inicio || '9999');
  const fim = ext.fim || ext.linhas.reduce((m, l) => (l.data > m ? l.data : m), '');
  const melhor = (it, filtro) => naConta
    .filter((l) => !usados.has(l.id) && filtro(l))
    .sort((a, b) => diasEntre(a.data, it.data) - diasEntre(b.data, it.data))[0];

  const itens = ext.linhas.map((x, i) => ({ ...x, idx: i, status: null, lanc: null }));
  const ordem = [...itens].sort((a, b) => a.data.localeCompare(b.data));
  // 1) já lançado e pago: valor exato
  for (const it of ordem) {
    if (it.futuro) continue;
    const l = melhor(it, (l) => D.estaPago(l) && efeito(l, conta) === it.valor && diasEntre(l.data, it.data) <= 4);
    if (l) { usados.add(l.id); it.status = 'no_app'; it.lanc = l; }
  }
  // 2) "a pagar"/"a receber" que bate (em qualquer conta ou sem conta), até 10 dias
  for (const it of ordem) {
    if (it.status || it.futuro) continue;
    const alvo = d.lancamentos.find((l) => !usados.has(l.id) && D.estaAberto(l) && l.tipo === (it.valor > 0 ? 'receita' : 'despesa') && l.valor === Math.abs(it.valor)
      && (!l.conta || l.conta === conta) && (!l.data || diasEntre(l.data, it.data) <= 10));
    if (alvo) { usados.add(alvo.id); it.status = 'baixar'; it.lanc = alvo; }
  }
  // 3) valor parecido (erro de digitação): mesmo sentido, até R$ 5,00 e 5% de diferença, até 2 dias
  for (const it of ordem) {
    if (it.status || it.futuro) continue;
    const l = melhor(it, (l) => D.estaPago(l) && Math.sign(efeito(l, conta)) === Math.sign(it.valor) && diasEntre(l.data, it.data) <= 2
      && Math.abs(Math.abs(efeito(l, conta)) - Math.abs(it.valor)) <= Math.min(500, Math.abs(it.valor) * 0.05));
    if (l) { usados.add(l.id); it.status = 'divergente'; it.lanc = l; }
  }
  // o que o app aprendeu: descrição do banco -> lançamento correspondente (para sugerir descrição e categoria)
  const aprendido = new Map();
  for (const it of itens) if (it.lanc && it.lanc.tipo !== 'transferencia') aprendido.set(norm(it.descricao), it.lanc);
  for (const l of d.lancamentos) if (l.extrato_desc && !aprendido.has(norm(l.extrato_desc))) aprendido.set(norm(l.extrato_desc), l);

  const titular = norm(ext.titular);
  const catPorTrecho = (trecho, tipo) => d.categorias.find((c) => c.tipo === tipo && !c.arquivada && norm(c.nome).includes(trecho));
  for (const it of itens) {
    if (it.status) continue;
    it.status = it.futuro ? 'futuro' : 'novo';
    const nd = norm(it.descricao), nt = norm(it.tipo);
    const ehTransf = (titular && nd === titular) || /cofrinho|aplicacao|resgate/.test(nd) || /^saque/.test(nt);
    if (ehTransf && !it.futuro) {
      it.sugestao = { transferencia: true, descricao: /^saque/.test(nt) ? 'Saque' : /cofrinho|aplicacao/.test(nd) ? 'Aplicação no cofrinho' : 'Transferência entre contas', destino: /^saque/.test(nt) ? 'conta:carteira' : '' };
      continue;
    }
    const tipo = it.valor > 0 ? 'receita' : 'despesa';
    const ap = aprendido.get(nd);
    let categoria = ap && ap.tipo === tipo ? ap.categoria : null;
    if (!categoria) for (const [re, trecho] of PALAVRAS_CAT) if (re.test(nd + ' ' + nt)) { categoria = catPorTrecho(trecho, tipo)?.id || null; if (categoria) break; }
    it.sugestao = { transferencia: false, tipo, descricao: ap && ap.tipo === tipo ? ap.descricao : /rend pago/.test(nd) ? 'Rendimentos' : cap(it.descricao), categoria };
  }

  const soNoApp = naConta.filter((l) => !usados.has(l.id) && D.estaPago(l) && l.data >= inicio && l.data <= fim).sort((a, b) => a.data.localeCompare(b.data));

  // saldo do banco x saldo do app, dia a dia (o primeiro dia em que não bate ajuda a achar o erro)
  const ex = D.extratoConta(d, conta);
  const saldoAppEm = (data) => { let s = ex.base; for (const dia of ex.dias) if (dia.data <= data) s = dia.saldo; return s; };
  const dias = Object.entries(ext.saldosDia).sort((a, b) => a[0].localeCompare(b[0])).map(([data, banco]) => ({ data, banco, app: saldoAppEm(data) }));
  const primeiroErro = dias.find((x) => x.banco !== x.app) || null;
  const saldoApp = saldoAppEm(fim || '9999-12-31');
  // saldo do banco no fim do período = último saldo do dia + movimentos depois dele
  let saldoBanco = ext.saldoFinal;
  if (dias.length) {
    const ult = dias[dias.length - 1];
    saldoBanco = ult.banco + itens.filter((x) => !x.futuro && x.data > ult.data).reduce((s, x) => s + x.valor, 0);
  }
  return { itens, soNoApp, dias, primeiroErro, saldoApp, saldoBanco, saldoInformado: ext.saldoFinal, inicio, fim };
}

/**
 * Gravações escolhidas na tela. escolhas: [{ item, acao: 'criar'|'baixar'|'corrigir'|'agendar', descricao, categoria, destino }]
 * destino de transferência: 'conta:<id>' ou 'caixinha:<id>'.
 */
export function opsImportacao(d, conta, escolhas) {
  const ops = [];
  for (const e of escolhas) {
    const it = e.item, valor = Math.abs(it.valor);
    if (e.acao === 'corrigir' && it.lanc) {
      ops.push(['put', 'lancamentos', { ...it.lanc, valor, extrato_desc: it.descricao }]);
    } else if (e.acao === 'baixar' && it.lanc) {
      const p = D.parcelaDoLancamento ? D.parcelaDoLancamento(d, it.lanc) : null;
      const c = p && d.contratos.find((x) => x.id === p.contrato);
      if (p && c) ops.push(...D.opsReceberParcela(d, p, c, { conta, data: it.data, categoria: it.lanc.categoria || null }));
      else { const l = { ...it.lanc, situacao: 'pago', data: it.data, conta, extrato_desc: it.descricao }; delete l.mes; ops.push(['put', 'lancamentos', l]); }
    } else if (e.acao === 'criar' && e.destino) {
      const [tipoD, idD] = e.destino.split(':');
      const aqui = { tipo: 'conta', id: conta }, la = { tipo: tipoD, id: idD };
      const t = { data: it.data, valor, descricao: e.descricao || 'Transferência', origem: it.valor < 0 ? aqui : la, destino: it.valor < 0 ? la : aqui };
      ops.push(...D.opsTransferencia(d, t));
    } else if (e.acao === 'criar' || e.acao === 'agendar') {
      ops.push(['put', 'lancamentos', {
        id: novoId('l'), tipo: it.valor > 0 ? 'receita' : 'despesa', descricao: e.descricao || cap(it.descricao), valor, data: it.data, conta,
        categoria: e.categoria || null, situacao: e.acao === 'agendar' ? 'aberto' : 'pago', extrato_desc: it.descricao, origem: 'extrato',
      }]);
    }
  }
  return ops;
}
