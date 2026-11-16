// Ajustes: backup, restauração e instruções de instalação.
import { esc, confirmar } from '../ui.js';
import { hojeISO, dataBR } from '../format.js';
import { montarBackup, validarBackup, substituirTudo, definirMeta } from '../db.js';

const instalado = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export default function ajustes(ctx) {
  const d = ctx.dados;
  const ult = d.meta.ultimo_backup;
  const qtd = `${d.lancamentos.length} lançamentos, ${d.cartoes.length} cartões, ${d.compras_cartao.length} compras no cartão, ${d.contratos.length} honorários (${d.honorarios.length} parcelas)`;

  const html = `
    <header class="topo"><h1 class="grande">Ajustes</h1><a class="link" href="#/">Fechar</a></header>
    <section class="card" style="gap:2px"><h2>Cadastros</h2>
      <div class="lista">
        <a class="item" href="#/categorias"><span class="t"><b>Categorias</b><small>Criar, renomear, arquivar ou excluir</small></span><span class="rot">›</span></a>
        <a class="item" href="#/contas"><span class="t"><b>Contas</b><small>Criar, renomear, arquivar ou excluir</small></span><span class="rot">›</span></a>
      </div></section>
    <section class="card">
      <h2>Backup dos dados</h2>
      <p class="nota">Seus dados ficam só neste iPhone. Se você apagar o app ou trocar de aparelho, eles se perdem — por isso salve um backup no Dropbox, no iCloud Drive ou em “Arquivos” com frequência.</p>
      <p class="nota"><b>Último backup:</b> ${ult ? esc(dataBR(ult.slice(0, 10))) : 'nunca feito'}<br><b>Guardado agora:</b> ${esc(qtd)}</p>
      <button class="btn" data-exportar>Salvar backup</button>
      <label class="btn sec" style="display:flex;align-items:center;justify-content:center">Restaurar backup ou carregar dados<input type="file" accept=".json,application/json" data-importar hidden></label>
      <div class="erro" id="msg" role="status"></div>
    </section>
    ${instalado() ? '' : `<section class="card"><h2>Instalar no iPhone</h2>
      <p class="nota">1. Abra este endereço no <b>Safari</b>.<br>2. Toque em <b>Compartilhar</b> (quadrado com seta).<br>3. Escolha <b>Adicionar à Tela de Início</b>.<br>Depois, abra sempre pelo ícone: funciona sem internet.</p></section>`}
    <section class="card"><h2>Sobre</h2><p class="nota">Controle Financeiro · versão 12 · dados da planilha a partir de 01/11/2026.</p></section>`;

  return {
    html,
    montar(raiz) {
      const msg = raiz.querySelector('#msg');

      raiz.querySelector('[data-exportar]').onclick = async () => {
        const conteudo = JSON.stringify(montarBackup(ctx.dados), null, 1);
        const nome = `backup-financeiro-${hojeISO()}.json`;
        const arquivo = new File([conteudo], nome, { type: 'application/json' });
        try {
          if (navigator.canShare?.({ files: [arquivo] })) {
            await navigator.share({ files: [arquivo], title: 'Backup Controle Financeiro' });
          } else {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(arquivo);
            a.download = nome;
            document.body.append(a); a.click(); a.remove();
          }
          await definirMeta('ultimo_backup', new Date().toISOString());
          await ctx.recarregar();
          ctx.aviso('Backup salvo');
        } catch (e) {
          if (e?.name !== 'AbortError') { msg.textContent = 'Não foi possível salvar o backup: ' + e; }
        }
      };

      raiz.querySelector('[data-importar]').onchange = async (e) => {
        const arq = e.target.files[0];
        e.target.value = '';
        if (!arq) return;
        let obj;
        try { obj = JSON.parse(await arq.text()); } catch { msg.textContent = 'Esse arquivo não é um JSON válido.'; return; }
        const erro = validarBackup(obj);
        if (erro) { msg.textContent = erro; return; }
        const vazio = ctx.dados.contas.length === 0 && ctx.dados.lancamentos.length === 0;
        if (!vazio) {
          const ok = await confirmar('Restaurar backup?', `Isto substitui TODOS os dados atuais (${qtd}) pelos do arquivo “${arq.name}”.`, 'Substituir tudo', true);
          if (!ok) return;
        }
        const agora = new Date().toISOString();
        await substituirTudo(obj, { seed_aplicado: ctx.dados.meta.seed_aplicado || agora, ultimo_backup: vazio ? null : agora });
        await ctx.recarregar();
        ctx.aviso(vazio ? 'Dados carregados' : 'Backup restaurado');
      };
    },
  };
}
