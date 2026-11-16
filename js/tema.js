// Tema do app: 'auto' (segue o iPhone), 'claro' ou 'escuro'. Carregado antes do CSS pintar, para não piscar.
// A escolha fica só neste aparelho (não entra no backup).
(function () {
  var CHAVE = 'tema';
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function ler() { try { var v = localStorage.getItem(CHAVE); return v === 'claro' || v === 'escuro' ? v : 'auto'; } catch (e) { return 'auto'; } }
  function aplicar() {
    var pref = ler();
    var escuro = pref === 'escuro' || (pref === 'auto' && mq && mq.matches);
    document.documentElement.setAttribute('data-tema', escuro ? 'escuro' : 'claro');
    var m = document.getElementById('cor-tema');
    if (m) m.setAttribute('content', escuro ? '#0E141C' : '#1F3A5F');
  }
  window.Tema = {
    ler: ler,
    definir: function (v) { try { if (v === 'auto') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, v); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } aplicar(); },
  };
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', aplicar); else if (mq.addListener) mq.addListener(aplicar); }
  aplicar();
})();
