import { esc } from '../ui.js';
import { num, reais, mesAtual, mesNome, mesLongo, dataGrupo } from '../format.js';
import * as D from '../domain.js';
import { nomes, linhaItem } from './comum.js';
import { abrirDetalhe } from './detalhe.js';

// O filtro escolhido fica guardado enquanto o app estiver aberto.
const filtro = { mes: null, sit: '', conta: '', cat: '' };
const SITUACOES = [['', 'Todos'], ['receber', 'A receber'], ['pagar', 'A pagar'], ['recebidas', 'Recebidas'], ['pagas', 'Pagas']];

/** Faz a lista abrir no mês indicado (usado depois de salvar um lançamento, para ele aparecer). */
export const mostrarMesNaLista = (mes) => { filtro.mes = mes; };

export default function lancamentos(ctx) {
  const d = ctx.dados;
  const n = nomes(d);
  filtro.mes ||= mesAtual();
  const meses = D.mesesDisponiveis(d, mesAtual());
  if (!meses.includes(filtro.mes)) filtro.mes = meses[0];

  const itens = D.itensDaLista(d)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => D.mesDoLanc(l) === filtro.mes)
    .filter(({ l }) => D.passaSituacao(l, filtro.sit))
    .filter(({ l }) => !filtro.conta || l.conta === filtro.conta || l.conta_origem === filtro.conta || l.conta_destino === filtro.conta)
    .filter(({ l }) => !filtro.cat || l.categoria === filtro.cat);

  // com uma conta escolhida: saldo ao fim de cada dia e saldo atual da conta
  const ext = filtro.conta ? D.extratoConta(d, filtro.conta) : null;
  const porDia = new Map((ext?.dias || []).map((x) => [x.data, x]));
  const sinal = (v) => `${v < 0 ? '−' : '+'} R$ ${num(v)}`;

  let entradas = 0, saidas = 0;
  const grupos = new Map();
  for (const { l, i } of itens) {
    if (l.tipo === 'receita') entradas += l.valor;
    else if (l.tipo === 'despesa' || l.tipo === 'fatura') saidas += l.valor;
    const chave = l.tipo === 'cartao' ? '~cartao' : l.data || '~semdata';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push({ l, i });
  }
  // sem data primeiro, depois datas (mais novas antes), cartão por último
  const ordem = [...grupos.keys()].sort((a, b) => {
    const peso = (k) => (k === '~semdata' ? 2 : k === '~cartao' ? 0 : 1);
    return peso(b) - peso(a) || (peso(a) === 1 ? b.localeCompare(a) : 0);
  });

  const blocos = ordem.map((k) => {
    const lista = grupos.get(k).sort((a, b) => b.i - a.i).map((x) => x.l);
    let titulo, direita = '';
    if (k === '~semdata') titulo = 'SEM DATA · EM ABERTO';
    else if (k === '~cartao') {
      titulo = `CARTÃO · FATURA ${mesNome(filtro.mes).toUpperCase()}`;
      direita = `− R$ ${num(lista.reduce((s, l) => s + l.valor, 0))}`;
    } else {
      const todosAbertos = lista.every((l) => !D.estaPago(l) && l.tipo !== 'transferencia');
      titulo = dataGrupo(k) + (todosAbertos ? ' · PREVISTO' : '');
      const dia = porDia.get(k);
      if (dia) {
        direita = `<span class="var ${dia.variacao < 0 ? 'verm' : 'verde'}">${sinal(dia.variacao)}</span><b class="saldo-dia ${dia.saldo < 0 ? 'verm' : ''}">Saldo ${reais(dia.saldo)}</b>`;
      } else if (!ext) {
        const liquido = lista.filter((l) => D.estaPago(l) && D.ehResultado(l)).reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0);
        if (liquido) direita = sinal(liquido);
      }
    }
    return `<div class="grupo"><div class="grupo-tit"><b>${esc(titulo)}</b><span class="dir">${direita}</span></div>
      <div class="caixa">${lista.map((l) => linhaItem(l, n)).join('')}</div></div>`;
  });

  const opcao = (v, rot, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(rot)}</option>`;
  const cats = [...d.categorias].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo - b.codigo);

  const html = `
    <header class="topo"><h1 class="grande">Lançamentos</h1></header>
    <div class="filtros">
      <label class="pilula on">${esc(mesNome(filtro.mes))}<select data-f="mes" aria-label="Mês">${meses.map((m) => opcao(m, mesNome(m), m === filtro.mes)).join('')}</select></label>
      <label class="pilula${filtro.sit ? ' on' : ''}">${esc(SITUACOES.find((s) => s[0] === filtro.sit)[1])}<select data-f="sit" aria-label="Situação">${SITUACOES.map(([v, t]) => opcao(v, t, v === filtro.sit)).join('')}</select></label>
      <label class="pilula">${esc(filtro.conta ? n.conta.get(filtro.conta)?.nome : 'Todas as contas')}<select data-f="conta" aria-label="Conta">${opcao('', 'Todas as contas', !filtro.conta)}${d.contas.map((c) => opcao(c.id, c.nome, c.id === filtro.conta)).join('')}</select></label>
      <label class="pilula">${esc(filtro.cat ? n.cat.get(filtro.cat)?.nome : 'Categorias')}<select data-f="cat" aria-label="Categoria">${opcao('', 'Todas as categorias', !filtro.cat)}${cats.map((c) => opcao(c.id, `${c.nome} (${c.tipo})`, c.id === filtro.cat)).join('')}</select></label>
    </div>
    ${ext ? `<div class="dois" aria-label="Saldo da conta">
      <div class="card mini"><span class="rot">Saldo atual · ${esc(n.conta.get(filtro.conta)?.nome)}</span><span class="num ${ext.atual < 0 ? 'verm' : ''}">${reais(ext.atual)}</span></div>
      <div class="card mini"><span class="rot">No início de ${esc(mesLongo(filtro.mes).split(' de ')[0].toLowerCase())}</span><span class="num ${D.saldoAntesDe(ext, filtro.mes + '-01') < 0 ? 'verm' : ''}">${reais(D.saldoAntesDe(ext, filtro.mes + '-01'))}</span></div>
    </div>` : ''}
    <div class="dois-res">
      ${filtro.sit === 'receber' ? `<div><span class="rot">A receber</span><b class="verde">+ R$ ${num(entradas)}</b></div>`
        : filtro.sit === 'pagar' ? `<div><span class="rot">A pagar</span><b class="verm">− R$ ${num(saidas)}</b></div>`
        : filtro.sit === 'recebidas' ? `<div><span class="rot">Recebidas</span><b class="verde">+ R$ ${num(entradas)}</b></div>`
        : filtro.sit === 'pagas' ? `<div><span class="rot">Pagas</span><b class="verm">− R$ ${num(saidas)}</b></div>`
        : `<div><span class="rot">Entradas</span><b class="verde">+ R$ ${num(entradas)}</b></div>
      <div><span class="rot">Saídas</span><b class="verm">− R$ ${num(saidas)}</b></div>`}
    </div>
    ${['pagar', 'pagas'].includes(filtro.sit) ? `<p class="nota">${filtro.sit === 'pagar' ? 'A fatura do cartão em aberto entra aqui com o valor que falta pagar; ' : ''}as compras do cartão, uma a uma, ficam de fora: elas saem da conta quando você paga a fatura.</p>` : ''}
    <div class="grupos">${blocos.length ? blocos.join('') : '<p class="vazio">Nada neste filtro.</p>'}</div>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { filtro[s.dataset.f] = s.value; ctx.recarregar(); }));
      raiz.querySelectorAll('.item[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
    },
  };
}
