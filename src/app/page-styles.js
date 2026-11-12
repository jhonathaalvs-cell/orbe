// Folhas de estilo de cada tela, na ordem em que precisam ser aplicadas.
// Os caminhos são relativos a src/styles/.
const pageStyles = {
  auth: ["components/components.css", "pages/auth.css"],
  dashboard: ["core/layout.css", "components/components.css", "pages/dashboard.css", "components/dialogs.css", "core/responsive.css", "components/sidebar-nav.css", "components/mobile-nav.css"],
  profile: ["core/layout.css", "components/components.css", "core/responsive.css", "pages/profile.css", "components/sidebar-nav.css", "components/mobile-nav.css"],
  accounts: ["core/layout.css", "components/components.css", "pages/dashboard.css", "core/responsive.css", "components/sidebar-nav.css", "components/mobile-nav.css", "components/dialogs.css", "pages/accounts.css"],
  commitments: ["core/layout.css", "components/components.css", "pages/dashboard.css", "core/responsive.css", "components/sidebar-nav.css", "components/mobile-nav.css", "components/dialogs.css", "pages/commitments.css"],
  goals: ["core/layout.css", "components/components.css", "pages/dashboard.css", "core/responsive.css", "components/sidebar-nav.css", "components/mobile-nav.css", "components/dialogs.css", "pages/goals.css"],
  cards: ["core/layout.css", "components/components.css", "pages/dashboard.css", "core/responsive.css", "components/sidebar-nav.css", "components/mobile-nav.css", "components/dialogs.css", "pages/cards.css"],
};

const pageStyleLoads = new WeakMap();

// Carrega (ou reaproveita) os estilos da tela. Devolve false se a navegação
// já mudou enquanto os arquivos carregavam (isCurrent() === false).
export async function loadPageStyles(page, isCurrent) {
  const requested = pageStyles[page];
  const existing = new Map([...document.head.querySelectorAll("link[data-page-style]")]
    .map((link) => [link.dataset.pageStyle, link]));
  const pending = [];

  for (const file of requested) {
    if (existing.has(file)) {
      const pendingLoad = pageStyleLoads.get(existing.get(file));
      if (pendingLoad) pending.push(pendingLoad);
      continue;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `src/styles/${file}`;
    link.dataset.pageStyle = file;
    const load = new Promise((resolve, reject) => {
      link.onload = resolve;
      link.onerror = () => {
        link.remove();
        existing.delete(file);
        reject(new Error(`Não foi possível carregar os estilos ${file}.`));
      };
      document.head.append(link);
    });
    pageStyleLoads.set(link, load);
    pending.push(load);
    existing.set(file, link);
  }

  await Promise.all(pending);
  if (!isCurrent()) return false;

  requested.forEach((file) => document.head.append(existing.get(file)));
  document.head.querySelectorAll("link[data-page-style]").forEach((link) => {
    if (!requested.includes(link.dataset.pageStyle)) link.remove();
  });
  return true;
}
