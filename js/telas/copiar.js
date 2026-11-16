// Copiar contas a pagar do mês anterior: escolha as despesas, ajuste os valores e elas entram como "a pagar". Rota: #/copiar
import { esc, aviso, ligarCampoValor } from '../ui.js';
import { reais, hojeISO, mesLongo, dataBR } from '../format.js';
import * as D from '../domain.js';
import { badgeCat } from '../visual.js';

let destino = null;

export default function copiar(ctx) {
  const d = ctx.dados;
  const atual = hojeISO().slice(0, 7);
  const opcoes = [0, 1, 2, 3].map((k) => D.somarMesFatura(atual, k));
  if (!opcoes.includes(destino)) destino = opcoes[1];
  const origem = D.somarMesFatura(destino, -1);
  const itens = D.candidatasCopia(d, origem, destino);
  const cat = new Map(d.categorias.map((c) => [c.id, c]));
  const html = `
    <header class="topo"><div><a class="link" href="#/mes">‹ Mês</a><h1 class="grande">Copiar contas</h1></div></header>
    <section class="card">
      <div class="campo"><label for="cdest">Prever as contas de</label><select id="cdest">${opcoes.map((m) => `<option value="${m}" ${m === destino ? 'selected' : ''}>${esc(mesLongo(m))}</option>`).join('')}</select></div>
      <p class="nota">Abaixo estão as despesas de <b>${esc(mesLongo(origem))}</b>. Marque as que se repetem em ${esc(mesLongo(destino))}, ajuste o valor se mudou, e elas entram como <b>a pagar</b>, no mesmo dia do mês. Já vêm marcadas as que parecem fixas ou parceladas.</p>
      <div class="seg peq"><button data-marcar="sug">Só as sugeridas</button><button data-marcar="todas">Todas</button><button data-marcar="nenhuma">Nenhuma</button></div>
    </section>
    <section class="card" style="gap:2px"><div class="lista">${itens.length ? itens.map((i, k) => `<label class="item copia ${i.jaExiste || i.acabou ? 'apagada' : ''}">
      <input type="checkbox" data-k="${k}" ${i.sugerida ? 'checked' : ''}>${badgeCat(cat.get(i.categoria))}
      <span class="t"><b>${esc(i.descricao || 'Sem descrição')}</b><small>${dataBR(i.data)}${i.jaExiste ? ' · já lançada neste mês' : i.acabou ? ' · última parcela já foi' : ''}</small></span>
      <input class="cvalor" data-v="${k}" inputmode="numeric" autocomplete="off" aria-label="Valor de ${esc(i.descricao)}"></label>`).join('')
      : `<p class="vazio">Não há despesas em ${esc(mesLongo(origem))} para copiar. Lance as contas pelo <b>+</b> ou pelo Assistente.</p>`}</div></section>
    <div class="copia-barra"><button class="btn" data-copiar disabled>Marque as contas</button></div>`;
  return {
    html,
    montar(raiz) {
      raiz.querySelector('#cdest').onchange = (e) => { destino = e.target.value; ctx.recarregar(); };
      const btn = raiz.querySelector('[data-copiar]');
      const caixas = [...raiz.querySelectorAll('[data-k]')];
      const atualizar = () => {
        const sel = caixas.filter((c) => c.checked).map((c) => Number(c.dataset.k));
        const total = sel.reduce((s, k) => s + valores[k].obter(), 0);
        btn.disabled = !sel.length;
        btn.textContent = sel.length ? `Lançar ${sel.length} ${sel.length === 1 ? 'conta' : 'contas'} a pagar · ${reais(total)}` : 'Marque as contas';
      };
      const valores = itens.map((i, k) => ligarCampoValor(raiz.querySelector(`[data-v="${k}"]`), i.valor, () => atualizar(), { substituir: true }));
      caixas.forEach((c) => (c.onchange = atualizar));
      raiz.querySelectorAll('[data-marcar]').forEach((b) => (b.onclick = () => {
        caixas.forEach((c) => { const i = itens[Number(c.dataset.k)]; c.checked = b.dataset.marcar === 'todas' ? true : b.dataset.marcar === 'sug' ? i.sugerida : false; });
        atualizar();
      }));
      btn.onclick = async () => {
        const escolhidos = caixas.filter((c) => c.checked).map((c) => { const k = Number(c.dataset.k); return { ...itens[k], valor: valores[k].obter() }; });
        const ops = D.opsCopiarContas(escolhidos);
        if (!ops.length) return;
        btn.disabled = true;
        await ctx.gravar(ops);
        aviso(`${ops.length} ${ops.length === 1 ? 'conta lançada' : 'contas lançadas'} como a pagar em ${mesLongo(destino)}`);
        ctx.ir('projecao');
      };
      atualizar();
    },
  };
}
