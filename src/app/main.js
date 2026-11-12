import { firebaseReady, observeAuth } from "../services/firebase/firebase.js";
import { loadPageStyles } from "./page-styles.js";

const appRoot = document.querySelector("#app");
let renderVersion = 0;
let currentUser = null;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./public/service-worker.js").catch(() => {}));
}

// Telas que ocupam toda a página (login e dashboard).
async function renderPage(path, mount, isAuthenticated, stylePage) {
  const version = ++renderVersion;
  document.body.classList.toggle("authenticated", isAuthenticated);
  appRoot.setAttribute("aria-busy", "true");

  try {
    if (!await loadPageStyles(stylePage, () => version === renderVersion)) return;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Não foi possível carregar ${path}.`);
    const markup = await response.text();
    if (version !== renderVersion) return;
    const contentSelector = {
      "src/pages/dashboard/index.html": "#dashboardRoot",
      "src/pages/login/index.html": "#authGate",
    }[path];
    if (contentSelector) {
      const pageDocument = new DOMParser().parseFromString(markup, "text/html");
      const pageContent = pageDocument.querySelector(contentSelector);
      if (!pageContent) throw new Error("O conteúdo da página não foi encontrado.");
      appRoot.innerHTML = contentSelector === "#dashboardRoot" ? pageContent.innerHTML : pageContent.outerHTML;
    } else {
      appRoot.innerHTML = markup;
    }
    await mount(version);
  } catch (error) {
    if (version !== renderVersion) return;
    appRoot.innerHTML = `<section class="page-load-error"><h1>Não foi possível abrir esta página</h1><p>${error.message}</p><button type="button" id="retryPage">Tentar novamente</button></section>`;
    document.querySelector("#retryPage").addEventListener("click", () => {
      if (firebaseReady) observeAuth((user) => user ? showDashboard(user) : showLogin());
      else showLogin();
    });
  } finally {
    if (version === renderVersion) appRoot.setAttribute("aria-busy", "false");
  }
}

function showLogin() {
  currentUser = null;
  return renderPage("src/pages/login/index.html", async () => {
    const { mountLoginPage } = await import("../pages/login/login.js");
    mountLoginPage();
  }, false, "auth");
}

function showDashboard(user) {
  currentUser = user;
  return renderPage("src/pages/dashboard/index.html", async () => {
    const { mountDashboardPage } = await import("../pages/dashboard/dashboard.js");
    mountDashboardPage(user);
  }, true, "dashboard");
}

// Telas internas: trocam só o miolo (.content) e mantêm menu e cabeçalho.
// A chave é o valor de data-page usado no menu.
const subPages = {
  perfil: {
    style: "profile",
    path: "src/pages/profile/index.html",
    selector: "#profileRoot",
    title: "Meu perfil",
    loadError: "Não foi possível carregar a página de perfil.",
    missingError: "O conteúdo do perfil não foi encontrado.",
    openError: "Não foi possível abrir o perfil",
    awaitMount: true,
    load: async () => (await import("../pages/profile/profile.js")).mountProfilePage,
  },
  contas: {
    style: "accounts",
    path: "src/pages/accounts/index.html",
    title: "Contas e carteiras",
    loadError: "Não foi possível carregar contas e carteiras.",
    openError: "Não foi possível abrir contas e carteiras",
    load: async () => (await import("../pages/accounts/accounts.js")).mountAccountsPage,
  },
  compromissos: {
    style: "commitments",
    path: "src/pages/commitments/index.html",
    title: "Compromissos",
    loadError: "Não foi possível carregar os compromissos.",
    openError: "Não foi possível abrir compromissos",
    load: async () => (await import("../pages/commitments/commitments.js")).mountCommitmentsPage,
  },
  metas: {
    style: "goals",
    path: "src/pages/goals/index.html",
    title: "Metas",
    loadError: "Não foi possível carregar suas metas.",
    openError: "Não foi possível abrir suas metas",
    load: async () => (await import("../pages/goals/goals.js")).mountGoalsPage,
  },
  cartoes: {
    style: "cards",
    path: "src/pages/cards/index.html",
    title: "Cartões",
    loadError: "Não foi possível carregar seus cartões.",
    openError: "Não foi possível abrir seus cartões",
    load: async () => (await import("../pages/cards/cards.js")).mountCardsPage,
  },
};

async function showSubPage(user, route) {
  if (!user) return showLogin();
  const version = ++renderVersion;
  appRoot.setAttribute("aria-busy", "true");
  try {
    if (!await loadPageStyles(route.style, () => version === renderVersion)) return;
    const response = await fetch(route.path);
    if (!response.ok) throw new Error(route.loadError);
    const markup = await response.text();
    if (version !== renderVersion) return;
    let html = markup;
    if (route.selector) {
      const pageRoot = new DOMParser().parseFromString(markup, "text/html").querySelector(route.selector);
      if (!pageRoot) throw new Error(route.missingError);
      html = pageRoot.innerHTML;
    }
    const content = appRoot.querySelector(".content");
    if (!content) return showDashboard(user);
    content.innerHTML = html;
    document.querySelector("#pageTitle").textContent = route.title;
    const mount = await route.load();
    if (version !== renderVersion) return;
    if (route.awaitMount) await mount(user);
    else mount(user);
  } catch (error) {
    if (version === renderVersion) {
      const content = appRoot.querySelector(".content");
      if (content) content.innerHTML = `<section class="page-load-error"><h1>${route.openError}</h1><p>${error.message}</p></section>`;
    }
  } finally {
    if (version === renderVersion) appRoot.setAttribute("aria-busy", "false");
  }
}

function navigateTo(page) {
  if (page === "inicio") return showDashboard(currentUser);
  if (subPages[page]) return showSubPage(currentUser, subPages[page]);
  return undefined;
}

appRoot.addEventListener("click", (event) => {
  const link = event.target.closest("[data-page]");
  if (!link) return;
  const page = link.dataset.page;
  event.preventDefault();
  event.stopImmediatePropagation();
  const sidebar = document.querySelector("#sidebar");
  if (sidebar?.contains(link) && !sidebar.classList.contains("expanded") && window.matchMedia("(min-width: 851px)").matches) {
    sidebar.classList.add("expanded");
    const expandButton = document.querySelector("#sidebarExpand");
    expandButton?.setAttribute("aria-expanded", "true");
    expandButton?.setAttribute("aria-label", "Recolher navegação");
    if (expandButton) expandButton.title = "Recolher navegação";
  }
  document.querySelectorAll(".nav-link[data-page], .mobile-nav-item[data-page]").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
  const title = document.querySelector("#pageTitle");
  if (title) title.textContent = page === "perfil" ? "Meu perfil" : page === "inicio" ? "Visão geral" : link.textContent.trim();
  sidebar?.classList.remove("open");
  document.body.classList.remove("mobile-sidebar-open");
  document.querySelector("#mobileMore")?.setAttribute("aria-expanded", "false");

  if (page === "inicio" || subPages[page]) return navigateTo(page);
  if (page === "movimentacoes") {
    const selector = ".transactions-panel";
    if (appRoot.querySelector(selector)) appRoot.querySelector(selector).scrollIntoView({ behavior: "smooth", block: "center" });
    else showDashboard(currentUser).then(() => appRoot.querySelector(selector)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    return;
  }
  const toast = appRoot.querySelector("#toast");
  if (toast) {
    toast.textContent = `${link.textContent.trim()} faz parte das próximas etapas do projeto.`;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 3000);
  }
});

window.addEventListener("orbe:navigate", (event) => navigateTo(event.detail?.page));

if (firebaseReady) {
  observeAuth((user) => {
    currentUser = user;
    return user ? showDashboard(user) : showLogin();
  });
} else {
  showLogin();
}
