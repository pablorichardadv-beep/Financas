// Banco local (IndexedDB). Tudo fica no aparelho; nada é enviado para a internet.
// Cada "tabela" é um object store com chave "id" (a tabela "meta" usa "chave").

const NOME_DB = 'controle-financeiro';
const VERSAO_DB = 1;
export const TABELAS = ['contas', 'categorias', 'lancamentos', 'compras_cartao', 'caixinhas', 'caixinha_movimentos', 'emprestimos', 'honorarios'];
const META = 'meta';

let dbPromessa = null;

export function abrir() {
  if (dbPromessa) return dbPromessa;
  dbPromessa = new Promise((resolve, reject) => {
    const req = indexedDB.open(NOME_DB, VERSAO_DB);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const t of TABELAS) if (!db.objectStoreNames.contains(t)) db.createObjectStore(t, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'chave' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromessa;
}

const pedido = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
const fim = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });

/** Lê tudo para a memória (o volume é pequeno: alguns milhares de registros por ano). */
export async function carregarTudo() {
  const db = await abrir();
  const tx = db.transaction([...TABELAS, META], 'readonly');
  const d = {};
  await Promise.all(TABELAS.map(async (t) => { d[t] = await pedido(tx.objectStore(t).getAll()); }));
  const meta = await pedido(tx.objectStore(META).getAll());
  d.meta = Object.fromEntries(meta.map((m) => [m.chave, m.valor]));
  return d;
}

export async function gravar(tabela, objeto) {
  const db = await abrir();
  const tx = db.transaction(tabela, 'readwrite');
  tx.objectStore(tabela).put(objeto);
  await fim(tx);
}

/** Várias gravações/exclusões na mesma transação (tudo ou nada). ops: [['put', tabela, obj], ['del', tabela, id]] */
export async function lote(ops) {
  const db = await abrir();
  const tabelas = [...new Set(ops.map((o) => o[1]))];
  const tx = db.transaction(tabelas, 'readwrite');
  for (const [op, tabela, v] of ops) {
    if (op === 'put') tx.objectStore(tabela).put(v);
    else tx.objectStore(tabela).delete(v);
  }
  await fim(tx);
}

export async function definirMeta(chave, valor) {
  await gravar(META, { chave, valor });
}

/** Normaliza a carga/backup para o formato usado pelo app (idempotente). */
export function normalizar(dados) {
  const d = {};
  for (const t of TABELAS) d[t] = Array.isArray(dados[t]) ? dados[t] : [];
  d.lancamentos = d.lancamentos.map((l) => {
    const x = { ...l };
    if (x.status_codigo === 'N' && x.situacao === 'aberto') x.situacao = 'atrasado';
    if (x.status_codigo === 'G' && x.situacao === 'aberto') x.situacao = 'guardar';
    return x;
  });
  return d;
}

/** Substitui TODO o conteúdo do banco (usado na carga inicial e ao restaurar um backup). */
export async function substituirTudo(dados, metaExtra = {}) {
  const d = normalizar(dados);
  const db = await abrir();
  const tx = db.transaction([...TABELAS, META], 'readwrite');
  for (const t of TABELAS) {
    const s = tx.objectStore(t);
    s.clear();
    for (const o of d[t]) s.put(o);
  }
  for (const [chave, valor] of Object.entries(metaExtra)) tx.objectStore(META).put({ chave, valor });
  await fim(tx);
}

/** Monta o conteúdo do arquivo de backup. */
export function montarBackup(d) {
  const dados = {};
  for (const t of TABELAS) dados[t] = d[t];
  return { app: 'controle-financeiro', versao: 1, exportado_em: new Date().toISOString(), ...dados };
}

/** Confere se um JSON parece um backup/carga válido. Devolve texto de erro ou null. */
export function validarBackup(obj) {
  if (!obj || typeof obj !== 'object') return 'Arquivo inválido.';
  for (const t of ['contas', 'categorias', 'lancamentos']) {
    if (!Array.isArray(obj[t])) return `Arquivo sem a lista "${t}". Não parece um backup deste app.`;
  }
  return null;
}
