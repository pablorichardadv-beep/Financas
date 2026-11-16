import { esc } from '../ui.js';
import { reais, hojeISO, dataBR } from '../format.js';
import * as D from '../domain.js';

export default function honorarios(ctx) {
  const d = ctx.dados;
  const hoje = hojeISO();
  const r = D.resumoHonorarios(d, hoje);
  const abertos = d.honorarios.filter((h) => h.status === 'aberto').sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
  const calotes = d.honorarios.filter((h) => h.status === 'calote');

  const linha = (h) => {
    const atras = h.vencimento && h.vencimento < hoje;
    return `<div class="item"><span class="t"><b>${esc(h.cliente || h.descricao)}</b><small>${esc(h.vencimento ? dataBR(h.vencimento) : 'sem data')}${h.parcela ? ' · parcela ' + esc(h.parcela) : ''}${atras ? '<span class="tag verm">Atrasada</span>' : ''}</small></span><span class="v">${reais(h.valor)}</span></div>`;
  };

  const html = `
    <header class="topo"><h1 class="grande">Honorários</h1></header>
    <div class="dois">
      <div class="card mini"><span class="rot">A receber</span><span class="num">${reais(r.aReceber)}</span>${r.atrasado ? `<span class="selo ouro">${reais(r.atrasado)} atrasado</span>` : '<span class="selo ok">Nada atrasado</span>'}</div>
      <div class="card mini"><span class="rot">Calote</span><span class="num">${reais(r.calote)}</span><span class="selo verm">${calotes.length} parcelas</span></div>
    </div>
    <section class="card" style="gap:2px"><h2>Próximos recebimentos</h2><div class="lista">${abertos.length ? abertos.map(linha).join('') : '<p class="vazio">Nada em aberto.</p>'}</div></section>
    <p class="nota" style="text-align:center">Por enquanto esta tela é só de consulta. Marcar parcela como recebida entra na próxima etapa; até lá, lance a entrada em “Novo lançamento”.</p>`;
  return { html };
}
