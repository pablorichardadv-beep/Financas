// Honorários: resumo, próximos vencimentos e a lista de contratos (um por cliente/ação). Rota: #/honorarios
import { esc, icone, folha } from '../ui.js';
import { reais, hojeISO, dataBR, mesNome } from '../format.js';
import * as D from '../domain.js';
import { abrirEditorContrato, abrirParcela } from './contrato.js';

const PERIODOS = [['todos', 'Todos os meses'], ['prox3', 'Próximos 3 meses'], ['prox6', 'Próximos 6 meses'], ['prox12', 'Próximos 12 meses'], ['ano', 'Este ano']];
let periodo = 'todos';

export default function honorarios(ctx) {
  const d = ctx.dados;
  const hoje = hojeISO();
  const r = D.resumoHonorarios(d, hoje);
  const calotes = d.honorarios.filter((h) => h.status === 'calote');
  const porContrato = new Map(d.contratos.map((c) => [c.id, c]));

  const itens = d.contratos.map((c) => ({ c, s: D.resumoContrato(d, c, hoje) }));
  const porNome = (a, b) => a.c.cliente.localeCompare(b.c.cliente, 'pt-BR');
  const emAberto = itens.filter((x) => x.s.situacao === 'aberto').sort((a, b) => (a.s.proxima?.vencimento || '9999').localeCompare(b.s.proxima?.vencimento || '9999') || porNome(a, b));
  const soCalote = itens.filter((x) => x.s.situacao === 'calote').sort(porNome);
  const quitados = itens.filter((x) => x.s.situacao === 'quitado').sort(porNome);

  const linhaContrato = ({ c, s }) => {
    const partes = [];
    if (c.descricao) partes.push(esc(c.descricao));
    if (s.situacao === 'aberto') partes.push(`${s.qtdAbertas} em aberto${s.proxima ? ' · próxima ' + dataBR(s.proxima.vencimento) : ''}`);
    const tag = s.atrasado ? '<span class="tag verm">Atrasado</span>' : s.calote && s.situacao === 'aberto' ? '<span class="tag verm">Tem calote</span>' : '';
    const valor = s.situacao === 'calote' ? s.calote : s.situacao === 'quitado' ? s.recebido : s.aReceber;
    const ps = d.honorarios.filter((p) => p.contrato === c.id);
    const pagas = ps.filter((p) => p.status === 'pago').length;
    const atras = ps.filter((p) => p.status === 'aberto' && p.vencimento && p.vencimento < hoje).length;
    const perdidas = ps.filter((p) => p.status === 'calote').length;
    const pc = (n) => (ps.length ? (n / ps.length) * 100 : 0);
    const progresso = ps.length > 1 ? `<span class="prog-parc" role="img" aria-label="${pagas} de ${ps.length} parcelas recebidas"><span class="seg"><i class="ok" style="width:${pc(pagas)}%"></i><i class="at" style="width:${pc(atras)}%"></i><i class="ca" style="width:${pc(perdidas)}%"></i></span><small>${pagas} de ${ps.length} recebidas${atras ? ` · <b class="verm">${atras} ${atras === 1 ? 'atrasada' : 'atrasadas'}</b>` : ''}</small></span>` : '';
    return `<a class="item" href="#/honorario/${esc(c.id)}"><span class="t"><b>${esc(c.cliente)}</b><small>${partes.join(' · ')}${tag}</small>${progresso}</span>
      <span class="v ${s.situacao === 'calote' ? 'verm' : ''}">${reais(valor)} <span class="rot">›</span></span></a>`;
  };
  const grupo = (titulo, lista) => (lista.length ? `<section class="card" style="gap:2px"><h2>${titulo}</h2><div class="lista">${lista.map(linhaContrato).join('')}</div></section>` : '');

  const linhasMes = D.filtrarPeriodoHonorarios(D.honorariosPorMes(d, hoje), periodo, hoje);
  const totalPeriodo = linhasMes.reduce((s, l) => s + l.total, 0);
  const maiorMes = Math.max(1, ...linhasMes.map((l) => l.total));
  const rotuloMes = (l) => (l.mes ? mesNome(l.mes) : 'Sem data de vencimento');
  const linhaMes = (l) => `<button class="item" data-mes="${l.mes || ''}"><span class="t"><b>${esc(rotuloMes(l))}${l.atrasado ? ' <span class="tag verm">Atrasado</span>' : ''}</b><small>${l.qtd} ${l.qtd === 1 ? 'parcela' : 'parcelas'} · ${l.clientes} ${l.clientes === 1 ? 'cliente' : 'clientes'}</small>
      <span class="barra-fina"><i style="width:${Math.max(3, Math.round((l.total / maiorMes) * 100))}%"></i></span></span><span class="v">${reais(l.total)} <span class="rot">›</span></span></button>`;
  const cartaoMeses = `<section class="card mes-honor" style="gap:2px"><div class="linha-tit"><h2>A receber por mês</h2><b>${reais(totalPeriodo)}</b></div>
    <div class="filtros" style="margin:4px 0 2px"><label class="pilula on">${esc(PERIODOS.find((p) => p[0] === periodo)[1])}<select data-periodo aria-label="Período">${PERIODOS.map(([v, t]) => `<option value="${v}" ${v === periodo ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
    <div class="lista">${linhasMes.length ? linhasMes.map(linhaMes).join('') : '<p class="vazio">Nada a receber neste período.</p>'}</div>
    <p class="nota">Soma das parcelas em aberto pelo mês de vencimento. Toque em um mês para ver as parcelas.</p></section>`;

  const proximas = d.honorarios.filter((h) => h.status === 'aberto')
    .sort((a, b) => (a.vencimento || '9999').localeCompare(b.vencimento || '9999')).slice(0, 6);
  const linhaParcela = (p) => {
    const c = porContrato.get(p.contrato);
    const atras = p.vencimento && p.vencimento < hoje;
    return `<button class="item" data-parcela="${esc(p.id)}"><span class="t"><b>${esc(c?.cliente || '?')}</b><small>${p.vencimento ? dataBR(p.vencimento) : 'sem data'} · parcela ${esc(c ? D.rotuloParcela(p, c) : p.numero)}${atras ? '<span class="tag verm">Atrasada</span>' : ''}</small></span>
      <span class="v">${reais(p.valor)}</span></button>`;
  };

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Honorários</h1></div><button class="btn-ic" data-novo aria-label="Novo honorário">${icone.mais()}</button></header>
    <div class="dois">
      <div class="card mini"><span class="rot">A receber</span><span class="num">${reais(r.aReceber)}</span>${r.atrasado ? `<span class="selo ouro">${reais(r.atrasado)} atrasado</span>` : '<span class="selo ok">Nada atrasado</span>'}</div>
      <div class="card mini"><span class="rot">Calote</span><span class="num">${reais(r.calote)}</span><span class="selo verm">${calotes.length} ${calotes.length === 1 ? 'parcela' : 'parcelas'}</span></div>
    </div>
    ${d.honorarios.some((h) => h.status === 'aberto') ? cartaoMeses : ''}
    ${proximas.length ? `<section class="card" style="gap:2px"><h2>Próximos vencimentos</h2><div class="lista">${proximas.map(linhaParcela).join('')}</div></section>` : ''}
    ${d.contratos.length ? '' : '<section class="card"><h2>Nenhum honorário ainda</h2><p class="nota">Toque no + para cadastrar um honorário com o cliente, o valor total, as parcelas e os vencimentos.</p></section>'}
    ${grupo('Contratos em aberto', emAberto)}
    ${grupo('Somente calote', soCalote)}
    ${grupo('Quitados', quitados)}
    <p class="nota" style="text-align:center">Cada honorário tem o total e as parcelas, cada uma com valor e vencimento. Ao receber uma parcela, o app lança a receita na conta escolhida.</p>`;

  return {
    html,
    montar(raiz) {
      raiz.querySelector('[data-novo]').onclick = () => abrirEditorContrato(ctx, null);
      raiz.querySelector('[data-periodo]')?.addEventListener('change', (e) => { periodo = e.target.value; ctx.recarregar(); });
      raiz.querySelectorAll('[data-mes]').forEach((b) => (b.onclick = () => abrirMes(ctx, linhasMes.find((l) => (l.mes || '') === b.dataset.mes))));
      raiz.querySelectorAll('[data-parcela]').forEach((b) => (b.onclick = () => abrirParcela(ctx, b.dataset.parcela)));
    },
  };
}

// parcelas de um mês (abre ao tocar numa linha de "A receber por mês")
function abrirMes(ctx, linha) {
  if (!linha) return;
  const d = ctx.dados;
  const nome = new Map(d.contratos.map((c) => [c.id, c]));
  const hoje = hojeISO();
  const f = folha(`
    <div><h2>${esc(linha.mes ? mesNome(linha.mes) : 'Sem data de vencimento')}</h2><p class="rot">${reais(linha.total)} em ${linha.qtd} ${linha.qtd === 1 ? 'parcela' : 'parcelas'}</p></div>
    <div class="lista">${linha.parcelas.map((p) => {
      const c = nome.get(p.contrato);
      const atras = p.vencimento && p.vencimento < hoje;
      return `<button class="item" data-parcela="${esc(p.id)}"><span class="t"><b>${esc(c?.cliente || '?')}</b><small>${p.vencimento ? dataBR(p.vencimento) : 'sem data'} · parcela ${esc(c ? D.rotuloParcela(p, c) : p.numero)}${atras ? '<span class="tag verm">Atrasada</span>' : ''}</small></span><span class="v">${reais(p.valor)} <span class="rot">›</span></span></button>`;
    }).join('')}</div>
    <button class="btn sec" data-fechar>Fechar</button>`);
  f.el.querySelector('[data-fechar]').onclick = f.fechar;
  f.el.querySelectorAll('[data-parcela]').forEach((b) => (b.onclick = () => { f.fechar(); abrirParcela(ctx, b.dataset.parcela); }));
}
