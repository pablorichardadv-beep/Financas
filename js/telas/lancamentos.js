import { esc } from '../ui.js';
import { num, hojeISO, mesAtual, mesNome, dataGrupo } from '../format.js';
import * as D from '../domain.js';
import { nomes, linhaItem } from './comum.js';
import { abrirDetalhe } from './detalhe.js';

// O filtro escolhido fica guardado enquanto o app estiver aberto.
const filtro = { mes: null, conta: '', cat: '' };

export default function lancamentos(ctx) {
  const d = ctx.dados;
  const n = nomes(d);
  filtro.mes ||= mesAtual();
  const meses = D.mesesDisponiveis(d, mesAtual());
  if (!meses.includes(filtro.mes)) filtro.mes = meses[0];

  const itens = D.itensDaLista(d)
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => D.mesDoLanc(l) === filtro.mes)
    .filter(({ l }) => !filtro.conta || l.conta === filtro.conta || l.conta_origem === filtro.conta || l.conta_destino === filtro.conta)
    .filter(({ l }) => !filtro.cat || l.categoria === filtro.cat);

  let entradas = 0, saidas = 0;
  const grupos = new Map();
  for (const { l, i } of itens) {
    if (l.tipo === 'receita') entradas += l.valor;
    else if (l.tipo === 'despesa') saidas += l.valor;
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
      const liquido = lista.filter((l) => D.estaPago(l) && D.ehResultado(l)).reduce((s, l) => s + (l.tipo === 'receita' ? l.valor : -l.valor), 0);
      if (liquido) direita = `${liquido < 0 ? '−' : '+'} R$ ${num(liquido)}`;
    }
    return `<div class="grupo"><div class="grupo-tit"><b>${esc(titulo)}</b><span>${direita}</span></div>
      <div class="caixa">${lista.map((l) => linhaItem(l, n)).join('')}</div></div>`;
  });

  const opcao = (v, rot, sel) => `<option value="${esc(v)}" ${sel ? 'selected' : ''}>${esc(rot)}</option>`;
  const cats = [...d.categorias].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo - b.codigo);

  const html = `
    <header class="topo"><h1 class="grande">Lançamentos</h1></header>
    <div class="filtros">
      <label class="pilula on">${esc(mesNome(filtro.mes))}<select data-f="mes" aria-label="Mês">${meses.map((m) => opcao(m, mesNome(m), m === filtro.mes)).join('')}</select></label>
      <label class="pilula">${esc(filtro.conta ? n.conta.get(filtro.conta)?.nome : 'Todas as contas')}<select data-f="conta" aria-label="Conta">${opcao('', 'Todas as contas', !filtro.conta)}${d.contas.map((c) => opcao(c.id, c.nome, c.id === filtro.conta)).join('')}</select></label>
      <label class="pilula">${esc(filtro.cat ? n.cat.get(filtro.cat)?.nome : 'Categorias')}<select data-f="cat" aria-label="Categoria">${opcao('', 'Todas as categorias', !filtro.cat)}${cats.map((c) => opcao(c.id, `${c.nome} (${c.tipo})`, c.id === filtro.cat)).join('')}</select></label>
    </div>
    <div class="dois-res">
      <div><span class="rot">Entradas</span><b class="verde">+ R$ ${num(entradas)}</b></div>
      <div><span class="rot">Saídas</span><b class="verm">− R$ ${num(saidas)}</b></div>
    </div>
    <div class="grupos">${blocos.length ? blocos.join('') : '<p class="vazio">Nada neste filtro.</p>'}</div>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelectorAll('select[data-f]').forEach((s) => s.addEventListener('change', () => { filtro[s.dataset.f] = s.value; ctx.recarregar(); }));
      raiz.querySelectorAll('.item[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
    },
  };
}
