// Assistente offline: escreva ou dite (microfone do teclado) um lançamento ou uma pergunta. Rota: #/assistente
import { esc } from '../ui.js';
import { reais, hojeISO } from '../format.js';
import { interpretar, EXEMPLOS } from '../assistente.js';
import { prepararNovo } from './novo.js';
import { abrirDetalhe } from './detalhe.js';

let ultimoTexto = '';

export default function assistente(ctx) {
  const d = ctx.dados;
  const html = `
    <header class="topo"><div><a class="link" href="#/">‹ Início</a><h1 class="grande">Assistente</h1></div></header>
    <section class="card" aria-label="Pergunte ou lance">
      <label class="rot" for="fala">Escreva ou dite o que quer fazer</label>
      <textarea id="fala" class="fala" rows="3" autocomplete="off" autocapitalize="sentences" placeholder="Ex.: gastei 80 no supermercado ontem no Itaú">${esc(ultimoTexto)}</textarea>
      <p class="nota">Para falar, toque no <b>microfone do teclado</b> do iPhone. O app só entende; nada é gravado sem você conferir e salvar. Tudo é feito no aparelho, sem internet.</p>
      <button class="btn" data-entender>Entender</button>
    </section>
    <div id="resultado" aria-live="polite"></div>
    <section class="card" aria-label="Exemplos"><h2>Experimente</h2>
      <div class="chips">${EXEMPLOS.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div></section>`;

  function mostrar(r) {
    const alvo = document.getElementById('resultado');
    if (!alvo) return;
    if (r.tipo === 'lancamento') {
      alvo.innerHTML = `<section class="card ass-res"><h2>Entendi assim</h2>
        <div class="lista">${r.linhas.map(([a, b]) => `<div class="item"><span class="rot">${esc(a)}</span><b style="font-size:14.5px">${a === 'Valor' ? reais(b) : esc(b)}</b></div>`).join('')}</div>
        <p class="nota">Confira e ajuste no formulário antes de salvar. O que ficou “você escolhe” é preenchido lá.</p>
        <button class="btn" data-confirmar>Revisar e salvar</button><button class="btn sec" data-corrigir>Corrigir a frase</button></section>`;
      alvo.querySelector('[data-confirmar]').onclick = () => {
        const x = r.rascunho, p = { manter: true, tipo: x.tipo, valor: x.valor, descricao: x.descricao, data: x.data, situacao: x.situacao };
        if (x.tipo === 'transferencia') { if (x.conta_origem) p.conta_origem = x.conta_origem; if (x.conta_destino) p.conta_destino = x.conta_destino; }
        else {
          if (x.categoria) { p.categoria = x.categoria; p.catManual = true; }
          if (x.cartao) { p.cartao = true; p.cartao_id = x.cartao_id; p.parcelas = x.parcelas; }
          else if (x.conta) { p.conta = x.conta; p.contaManual = true; }
        }
        prepararNovo(p);
        ctx.ir('novo');
      };
      alvo.querySelector('[data-corrigir]').onclick = () => document.getElementById('fala').focus();
    } else if (r.tipo === 'relatorio') {
      const linha = (l) => {
        const interno = `<span class="t"><b>${esc(l.titulo)}</b>${l.detalhe ? `<small>${esc(l.detalhe)}</small>` : ''}</span><span class="v ${l.cor || ''}">${reais(l.valor)}</span>`;
        return l.id ? `<button class="item" data-id="${esc(l.id)}">${interno}</button>` : l.href ? `<a class="item" href="${esc(l.href)}">${interno}</a>` : `<div class="item">${interno}</div>`;
      };
      alvo.innerHTML = `<section class="card ass-res"><h2>${esc(r.titulo)}</h2>
        <div class="destaque"><span class="rot">${esc(r.destaque.rotulo)}</span><b class="grande-num ${r.destaque.cor || ''}">${reais(r.destaque.valor)}</b></div>
        ${r.linhas.length ? `<div class="lista">${r.linhas.map(linha).join('')}</div>` : ''}
        ${r.nota ? `<p class="nota">${esc(r.nota)}</p>` : ''}
        ${r.href ? `<a class="link" href="${esc(r.href)}">Abrir a tela completa ›</a>` : ''}</section>`;
      alvo.querySelectorAll('[data-id]').forEach((b) => (b.onclick = () => abrirDetalhe(ctx, b.dataset.id)));
    } else {
      alvo.innerHTML = `<section class="card ass-res"><p class="vazio" style="padding:14px 6px">${esc(r.mensagem)}</p></section>`;
    }
    alvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  return {
    html,
    montar(raiz) {
      const campo = raiz.querySelector('#fala');
      const rodar = () => { ultimoTexto = campo.value; mostrar(interpretar(campo.value, ctx.dados, hojeISO())); };
      raiz.querySelector('[data-entender]').onclick = () => { campo.blur(); rodar(); };
      campo.addEventListener('input', () => { ultimoTexto = campo.value; });
      raiz.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { campo.value = b.dataset.ex; rodar(); }));
    },
  };
}
