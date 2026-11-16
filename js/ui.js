// Auxiliares de interface: escape de HTML, ícones, avisos e folhas (modais).

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (corpo, w = 24, sw = 1.8) =>
  `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

export const icone = {
  inicio: () => svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  lista: () => svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  mais: () => svg('<path d="M12 5v14M5 12h14"/>', 26, 2.2),
  mes: () => svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  contas: () => svg('<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7l12-3v3M17 14h2"/>'),
  ajustes: () => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 22),
};

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

let tAviso;
export function aviso(texto) {
  document.querySelector('.aviso')?.remove();
  const el = document.createElement('div');
  el.className = 'aviso';
  el.setAttribute('role', 'status');
  el.textContent = texto;
  document.body.append(el);
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.remove(), 2400);
}

/** Abre uma folha inferior com o HTML dado. Devolve { el, fechar }. */
export function folha(html, aoFechar) {
  const fundo = document.createElement('div');
  fundo.className = 'fundo';
  fundo.innerHTML = `<div class="folha" role="dialog" aria-modal="true">${html}</div>`;
  const fechar = () => { fundo.remove(); aoFechar?.(); };
  fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(); });
  document.body.append(fundo);
  return { el: fundo.firstElementChild, fechar };
}

/** Confirmação simples (Promise<boolean>). */
export function confirmar(titulo, texto, rotuloOk = 'Confirmar', perigo = false) {
  return new Promise((resolve) => {
    let respondeu = false;
    const f = folha(`<h2>${esc(titulo)}</h2><p class="nota">${esc(texto)}</p>
      <button class="btn ${perigo ? 'perigo' : ''}" data-ok>${esc(rotuloOk)}</button>
      <button class="btn sec" data-nao>Cancelar</button>`, () => { if (!respondeu) resolve(false); });
    f.el.querySelector('[data-ok]').onclick = () => { respondeu = true; resolve(true); f.fechar(); };
    f.el.querySelector('[data-nao]').onclick = () => f.fechar();
  });
}
