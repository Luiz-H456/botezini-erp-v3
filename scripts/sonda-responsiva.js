/**
 * Sonda de responsividade do ERP: mede transbordo, sobreposição e alvo de
 * toque pequeno em dezenas de larguras.
 *
 * POR QUE ELA VEIO PARAR AQUI. O ERP fica atrás de login, e quem trabalhou na
 * responsividade não tem as credenciais. A tela de login foi medida; as onze
 * telas de dentro, não. Esta sonda é para VOCÊ rodar logado — é o que fecha o
 * buraco.
 *
 * COMO RODAR. Com o app aberto e logado, abra o console (F12), cole este
 * arquivo inteiro e depois:
 *
 *     const larguras = []; for (let w = 360; w <= 1600; w += 40) larguras.push(w);
 *     await __abrir(location.pathname);
 *     console.table(__resumir(await __medir(larguras)));
 *
 * Um cuidado: o ERP é uma SPA e a sessão vive no navegador, então o iframe
 * abre JÁ LOGADO na mesma tela. Navegue até a tela que quer medir antes de
 * chamar `__abrir`.
 *
 * O QUE É DEFEITO E O QUE NÃO É. Elemento que passa da borda DENTRO de um
 * contêiner que rola está alcançável — o kanban e as tabelas do ERP são assim
 * de propósito. Só é defeito quando nada oferece rolagem e o conteúdo some.
 *
 * O que vale a pena olhar primeiro, porque é onde este tipo de defeito mora:
 * o kanban do PCP, as tabelas do financeiro, os modais em tela estreita e
 * qualquer coisa com largura fixa em px.
 */

window.__sonda = function (doc, vw) {
  const achados = [];
  const de = doc.documentElement;

  const rola = de.scrollWidth - vw;
  if (rola > 1) achados.push({ t: 'rolagem-lateral', px: rola });

  const win = doc.defaultView;
  const vis = (el, r) => {
    const c = win.getComputedStyle(el);
    return c.display !== 'none' && c.visibility !== 'hidden' && c.opacity !== '0'
      && r.width > 0 && r.height > 0;
  };
  const nome = (el) => el.tagName.toLowerCase()
    + (el.id ? '#' + el.id : '')
    + (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');

  // Elemento que passa da borda direita. Só o mais externo: se um filho vaza,
  // o pai vaza junto, e listar a árvore toda esconde a causa.
  const culpados = [];
  for (const el of doc.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    const excesso = Math.round(r.right - vw);
    if (excesso > 1) {
      if (!culpados.some(c => c.el.contains(el))) culpados.push({ el, excesso });
    }
  }
  for (const c of culpados) achados.push({ t: 'passa-da-borda', el: nome(c.el), px: c.excesso });

  // Irmãos diretos ocupando o mesmo pixel. Absolute/fixed sobrepor é projeto.
  const posicionado = (el) => ['absolute', 'fixed'].includes(win.getComputedStyle(el).position);
  const cont = 'nav, header, .nav-inner, .nav-links, .nav-tabs, .mobile-tabs, .lp-nav, '
    + '.lp-nav-actions, .hero-ctas, .lp-hero-cta, .acoes-envio, .footer-info, .footer-nav, '
    + '.crumbs, .lp-stats, .lp-hero-meta, .balanco-grid, .cards-linha';
  for (const pai of doc.querySelectorAll(cont)) {
    const filhos = [...pai.children].filter(c => {
      const r = c.getBoundingClientRect();
      return vis(c, r) && !posicionado(c);
    });
    for (let i = 0; i < filhos.length; i++) {
      for (let j = i + 1; j < filhos.length; j++) {
        const a = filhos[i].getBoundingClientRect(), b = filhos[j].getBoundingClientRect();
        const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (dx > 2 && dy > 2) {
          achados.push({
            t: 'sobreposicao', el: nome(filhos[i]) + ' x ' + nome(filhos[j]),
            px: Math.round(Math.min(dx, dy)),
          });
        }
      }
    }
  }

  if (vw <= 640) {
    for (const el of doc.querySelectorAll('a, button, [role=button], summary, input, select')) {
      const r = el.getBoundingClientRect();
      if (!vis(el, r)) continue;
      if (el.closest('p, li, .lp-article, .lp-fontes')) continue; // link no meio de texto
      if (r.height < 40 || r.width < 40) {
        achados.push({ t: 'alvo-pequeno', el: nome(el), px: Math.round(r.width) + 'x' + Math.round(r.height) });
      }
    }
  }

  for (const el of doc.querySelectorAll('input, textarea, select')) {
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    const fs = parseFloat(win.getComputedStyle(el).fontSize);
    if (fs < 16) achados.push({ t: 'zoom-ios', el: nome(el), px: fs });
  }

  return achados;
};

// Varre uma página em várias larguras dentro de um iframe.
window.__varrer = async function (url, larguras) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;left:-99999px;top:0;height:900px;border:0';
  document.body.appendChild(f);
  const out = {};
  try {
    for (const w of larguras) {
      f.style.width = w + 'px';
      await new Promise(r => { f.onload = r; f.src = url; });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const achados = window.__sonda(f.contentDocument, w);
      if (achados.length) out[w] = achados;
    }
  } finally {
    f.remove();
  }
  return out;
};
'sonda pronta';
