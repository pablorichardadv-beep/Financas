// Importar extrato do banco (PDF do Itaú): compara com o app e mostra o que falta, o que está diferente e o que só existe no app.
import { esc, aviso } from '../ui.js';
import { reais, dataBR, norm } from '../format.js';
import * as D from '../domain.js';
import { lerPdf, lerExtratoItau, conciliar, opsImportacao } from '../extrato.js';
import { abrirDetalhe } from './detalhe.js';
import { badgeCat } from '../visual.js';

let estado = null;   // { conta, ext, arquivo }

export default function importar(ctx) {
  const d = ctx.dados;
  const contas = D.contasAtivas(d);
  const padrao = estado?.conta || contas.find((c) => norm(c.nome).includes('itau'))?.id || contas[0]?.id;
  const conc = estado ? conciliar(d, estado.conta, estado.ext) : null;
  const cat = new Map(d.categorias.map((c) => [c.id, c]));
  const nomeConta = (id) => d.contas.find((c) => c.id === id)?.nome || '';
  const destinos = [
    ...contas.filter((c) => c.id !== estado?.conta).map((c) => [`conta:${c.id}`, c.nome]),
    ...d.caixinhas.filter((c) => !c.arquivada).map((c) => [`caixinha:${c.id}`, `Caixinha ${c.nome === 'Caixinha' ? c.banco : c.nome}`]),
  ];
  const opcoesCat = (tipo, sel) => `<option value="">Sem categoria</option>${d.categorias.filter((c) => c.tipo === tipo && !c.arquivada).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((c) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}`;
  const valorTxt = (v) => `<span class="v ${v < 0 ? 'verm' : 'verde'}">${v < 0 ? '−' : '+'} ${reais(Math.abs(v))}</span>`;

  let corpo = '';
  if (conc) {
    const por = (s) => conc.itens.filter((i) => i.status === s);
    const novos = por('novo'), dif = por('divergente'), baixar = por('baixar'), fut = por('futuro'), ok = por('no_app');
    const bate = conc.saldoApp === conc.saldoBanco;
    const ultimoOk = conc.primeiroErro ? [...conc.dias].filter((x) => x.data < conc.primeiroErro.data && x.banco === x.app).pop() : null;
    const linhaNovo = (i) => {
      const s = i.sugestao;
      const campos = s.transferencia
        ? `<label class="mini">Para onde foi / de onde veio<select data-dest="${i.idx}"><option value="">Escolha…</option>${destinos.map(([v, t]) => `<option value="${esc(v)}" ${v === s.destino ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="__desp">Não é transferência (lançar como ${i.valor < 0 ? 'despesa' : 'receita'})</option></select></label>`
        : `<label class="mini">Categoria<select data-cat="${i.idx}">${opcoesCat(s.tipo, s.categoria)}</select></label>`;
      return `<div class="imp-item" data-item="${i.idx}"><label class="imp-top"><input type="checkbox" data-sel="${i.idx}" checked>
        <span class="t"><b>${esc(i.descricao)}</b><small>${dataBR(i.data)} · ${esc(i.tipo.toLowerCase())}</small></span>${valorTxt(i.valor)}</label>
        <div class="imp-campos"><label class="mini">Descrição no app<input data-desc="${i.idx}" value="${esc(s.descricao)}"></label>${campos}</div></div>`;
    };
    const secao = (titulo, nota, conteudo, n) => (n ? `<section class="card imp-sec"><h2>${titulo} <span class="rot">(${n})</span></h2>${nota ? `<p class="nota">${nota}</p>` : ''}${conteudo}</section>` : '');
    corpo = `
    <section class="card imp-res">
      <h2>${esc(nomeConta(estado.conta))} × extrato do banco</h2><span class="rot">Período: ${conc.inicio ? dataBR(conc.inicio) : ''} a ${conc.fim ? dataBR(conc.fim) : ''}</span>
      <div class="tres"><div><span class="rot">Saldo no banco</span><b>${reais(conc.saldoBanco)}</b></div><div><span class="rot">Saldo no app</span><b>${reais(conc.saldoApp)}</b></div>
        <div><span class="rot">Diferença</span><b class="${bate ? 'verde' : 'verm'}">${bate ? 'bate ✓' : reais(conc.saldoApp - conc.saldoBanco)}</b></div></div>
      ${!bate && conc.primeiroErro ? `<p class="nota">${ultimoOk ? `Os saldos batem em ${dataBR(ultimoOk.data)} e deixam` : 'Os saldos deixam'} de bater em <b>${dataBR(conc.primeiroErro.data)}</b>: comece a conferência por esse dia.</p>` : ''}
      ${conc.saldoInformado != null && conc.saldoInformado !== conc.saldoBanco ? `<p class="nota">O banco mostra saldo de ${reais(conc.saldoInformado)} no topo do PDF: a diferença de ${reais(conc.saldoInformado - conc.saldoBanco)} é rendimento ou movimento que ainda não virou lançamento no extrato.</p>` : ''}
      <p class="nota" data-depois></p>
    </section>
    ${secao('Faltam no app', 'Estão no banco e não no app. Confira a descrição e a categoria; desmarque o que não quiser lançar.', novos.map(linhaNovo).join(''), novos.length)}
    ${secao('Valor diferente', 'Achei um lançamento parecido, mas com valor diferente do banco.', dif.map((i) => `<div class="imp-item"><label class="imp-top"><input type="checkbox" data-sel="${i.idx}" checked>
      <span class="t"><b>Corrigir “${esc(i.lanc.descricao)}” para ${reais(Math.abs(i.valor))}</b><small>${dataBR(i.data)} · no app está ${reais(i.lanc.valor)} · no banco: ${esc(i.descricao)}</small></span>${valorTxt(i.valor)}</label></div>`).join(''), dif.length)}
    ${secao('Já caíram no banco', 'Estavam como “a pagar” ou “a receber” no app. Marque para dar baixa nesta conta.', baixar.map((i) => `<div class="imp-item"><label class="imp-top"><input type="checkbox" data-sel="${i.idx}" checked>
      <span class="t"><b>${esc(i.lanc.descricao)}</b><small>${dataBR(i.data)} · no banco: ${esc(i.descricao)}</small></span>${valorTxt(i.valor)}</label></div>`).join(''), baixar.length)}
    ${secao('Agendados no banco', 'O banco já mostra estas saídas para os próximos dias. Marque para lançar como “a pagar”.', fut.map((i) => `<div class="imp-item" data-item="${i.idx}"><label class="imp-top"><input type="checkbox" data-sel="${i.idx}">
      <span class="t"><b>${esc(i.descricao)}</b><small>${dataBR(i.data)} · ${esc(i.tipo.toLowerCase())}</small></span>${valorTxt(i.valor)}</label>
      <div class="imp-campos"><label class="mini">Descrição no app<input data-desc="${i.idx}" value="${esc(i.sugestao.descricao)}"></label><label class="mini">Categoria<select data-cat="${i.idx}">${opcoesCat(i.sugestao.tipo, i.sugestao.categoria)}</select></label></div></div>`).join(''), fut.length)}
    ${secao('Só no app', 'Estão pagos nesta conta, no período do extrato, mas não aparecem no banco. Pode ser data errada, conta errada ou lançamento em dobro. Toque para conferir.', `<div class="lista">${conc.soNoApp.map((l) => `<button class="item" data-abrir="${esc(l.id)}">${badgeCat(cat.get(l.categoria))}<span class="t"><b>${esc(l.descricao || 'Sem descrição')}</b><small>${dataBR(l.data)}</small></span><span class="v">${reais(l.valor)}</span></button>`).join('')}</div>`, conc.soNoApp.length)}
    <section class="card imp-sec"><details><summary><b>Já estão no app</b> <span class="rot">(${ok.length} conferidos)</span></summary><div class="lista">${ok.map((i) => `<div class="item"><span class="t"><b>${esc(i.lanc.descricao || i.descricao)}</b><small>${dataBR(i.data)} · no banco: ${esc(i.descricao)}</small></span>${valorTxt(i.valor)}</div>`).join('')}</div></details></section>
    ${novos.length + dif.length + baixar.length ? '' : `<p class="tudo-ok" style="text-align:center">Tudo conferido: o app está igual ao banco neste período.</p>`}
    ${novos.length + dif.length + baixar.length + fut.length ? '<div class="copia-barra"><button class="btn" data-gravar>Gravar</button></div>' : ''}`;
  }

  const html = `
    <header class="topo"><div><a class="link" href="#/contas">‹ Contas</a><h1 class="grande">Importar extrato</h1></div></header>
    <section class="card">
      <div class="campo"><label for="iconta">Conta</label><select id="iconta">${contas.map((c) => `<option value="${esc(c.id)}" ${c.id === padrao ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></div>
      <label class="btn ${conc ? 'sec' : ''}" style="display:flex;align-items:center;justify-content:center">${conc ? 'Escolher outro PDF' : 'Escolher o PDF do extrato'}<input type="file" accept=".pdf,application/pdf" data-pdf hidden></label>
      <p class="nota">No app do Itaú: <b>Extrato › escolha o período › Compartilhar › Salvar em Arquivos</b> (PDF). O PDF é lido aqui no iPhone, sem internet, e nada é gravado sem você conferir.</p>
      <div class="erro" id="imsg" role="status"></div>
    </section>
    ${corpo}`;

  return {
    html,
    montar(raiz) {
      const msg = raiz.querySelector('#imsg');
      raiz.querySelector('#iconta').onchange = (e) => { if (estado) { estado.conta = e.target.value; ctx.recarregar(); } };
      raiz.querySelector('[data-pdf]').onchange = async (e) => {
        const arq = e.target.files?.[0];
        if (!arq) return;
        msg.textContent = 'Lendo o PDF…';
        try {
          const itens = await lerPdf(new Uint8Array(await arq.arrayBuffer()));
          const ext = lerExtratoItau(itens);
          if (!ext.linhas.length) { msg.textContent = 'Não encontrei lançamentos neste PDF. Por enquanto o app lê o extrato de conta corrente do Itaú.'; return; }
          estado = { conta: raiz.querySelector('#iconta').value, ext, arquivo: arq.name };
          ctx.recarregar();
        } catch (err) {
          console.warn('importar', err); msg.textContent = 'Não consegui ler este PDF. Confira se é o extrato da conta em PDF (não uma foto).';
        }
      };
      raiz.querySelectorAll('[data-abrir]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.abrir)));
      if (!conc) return;
      const item = (idx) => conc.itens[Number(idx)];
      const escolhas = () => [...raiz.querySelectorAll('[data-sel]:checked')].map((cx) => {
        const it = item(cx.dataset.sel);
        const acao = it.status === 'novo' ? 'criar' : it.status === 'divergente' ? 'corrigir' : it.status === 'baixar' ? 'baixar' : 'agendar';
        const dest = raiz.querySelector(`[data-dest="${it.idx}"]`)?.value;
        return { item: it, acao, descricao: raiz.querySelector(`[data-desc="${it.idx}"]`)?.value.trim(), categoria: raiz.querySelector(`[data-cat="${it.idx}"]`)?.value || null,
          destino: dest && dest !== '__desp' ? dest : null, pendente: it.sugestao?.transferencia && !dest };
      });
      const btn = raiz.querySelector('[data-gravar]');
      const depois = raiz.querySelector('[data-depois]');
      const atualizar = () => {
        const es = escolhas();
        const efeito = es.reduce((s, e) => s + (e.acao === 'agendar' ? 0 : e.acao === 'corrigir' ? (e.item.valor - (e.item.valor < 0 ? -e.item.lanc.valor : e.item.lanc.valor)) : e.acao === 'baixar' ? e.item.valor : e.item.valor), 0);
        const fica = conc.saldoApp + efeito;
        if (depois) depois.innerHTML = es.length ? `Depois de gravar, o app fica com <b>${reais(fica)}</b>${fica === conc.saldoBanco ? ' — <b class="verde">igual ao banco ✓</b>' : ` (diferença de ${reais(fica - conc.saldoBanco)})`}.` : '';
        if (btn) { btn.disabled = !es.length; btn.textContent = es.length ? `Gravar ${es.length} ${es.length === 1 ? 'alteração' : 'alterações'}` : 'Marque o que quer gravar'; }
      };
      raiz.querySelectorAll('[data-sel], [data-dest]').forEach((x) => (x.onchange = atualizar));
      raiz.querySelectorAll('[data-dest]').forEach((s) => s.addEventListener('change', () => {
        const it = item(s.dataset.dest);
        if (s.value === '__desp') {   // vira lançamento comum: troca o campo por categoria
          it.sugestao = { transferencia: false, tipo: it.valor > 0 ? 'receita' : 'despesa', descricao: raiz.querySelector(`[data-desc="${it.idx}"]`).value, categoria: null };
          s.closest('label').outerHTML = `<label class="mini">Categoria<select data-cat="${it.idx}">${opcoesCat(it.sugestao.tipo, null)}</select></label>`;
        }
      }));
      btn?.addEventListener('click', async () => {
        const es = escolhas();
        if (es.some((e) => e.pendente)) { aviso('Escolha para onde foi cada transferência (ou “Não é transferência”).'); return; }
        const ops = opsImportacao(ctx.dados, estado.conta, es);
        if (!ops.length) return;
        btn.disabled = true;
        await ctx.gravar(ops);
        aviso(`${es.length} ${es.length === 1 ? 'alteração gravada' : 'alterações gravadas'}`);
        ctx.recarregar();
      });
      atualizar();
    },
  };
}
