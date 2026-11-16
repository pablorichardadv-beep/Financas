// Service worker: guarda os arquivos do app para abrir sem internet.
// Ao publicar uma versão nova, troque o número de VERSAO para o iPhone baixar os arquivos atualizados.
const VERSAO = 'v9';
const CACHE = 'financas-' + VERSAO;
const ARQUIVOS = [
  './', './index.html', './style.css', './manifest.webmanifest',
  './js/app.js', './js/db.js', './js/domain.js', './js/format.js', './js/ui.js',
  './js/telas/comum.js', './js/telas/detalhe.js', './js/telas/inicio.js', './js/telas/lancamentos.js', './js/telas/novo.js',
  './js/telas/mes.js', './js/telas/cadastros.js', './js/telas/categorias.js', './js/telas/caixinhas.js', './js/telas/emprestimos.js', './js/telas/contas.js', './js/telas/honorarios.js', './js/telas/contrato.js', './js/telas/cartoes.js', './js/telas/ajustes.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' ignora o cache HTTP do servidor (o GitHub Pages guarda arquivos por ~10 min), para pegar sempre a versão nova
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('financas-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Cache primeiro (abre na hora, mesmo sem sinal); atualiza em segundo plano quando há internet.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((emCache) => {
      const rede = fetch(req, { cache: 'no-cache' }).then((resp) => {
        if (resp.ok) caches.open(CACHE).then((c) => c.put(req, resp.clone()));
        return resp;
      }).catch(() => emCache);
      return emCache || rede;
    }),
  );
});
