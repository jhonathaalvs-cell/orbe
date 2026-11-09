import { firebaseReady, observeAuth } from "../services/firebase/firebase.js";

const appRoot = document.querySelector("#app");
let renderVersion = 0;
let currentUser = null;
const pageStyles = {
  auth: ["components.css", "auth.css"],
  dashboard: ["layout.css", "components.css", "dashboard.css", "dialogs.css", "responsive.css", "sidebar-nav.css", "mobile-nav.css"],
  profile: ["layout.css", "components.css", "responsive.css", "profile.css", "sidebar-nav.css", "mobile-nav.css"],
  accounts: ["layout.css", "components.css", "dashboard.css", "responsive.css", "sidebar-nav.css", "mobile-nav.css", "dialogs.css", "accounts.css"],
  commitments: ["layout.css", "components.css", "dashboard.css", "responsive.css", "sidebar-nav.css", "mobile-nav.css", "dialogs.css", "commitments.css"],
};
const pageStyleLoads = new WeakMap();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./public/service-worker.js").catch(() => {}));
}

async function loadPageStyles(page, version) {
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
  if (version !== renderVersion) return false;

  requested.forEach((file) => document.head.append(existing.get(file)));
  document.head.querySelectorAll("link[data-page-style]").forEach((link) => {
    if (!requested.includes(link.dataset.pageStyle)) link.remove();
  });
  return true;
}

async function renderPage(path, mount, isAuthenticated, stylePage) {
  const version = ++renderVersion;
  document.body.classList.toggle("authenticated", isAuthenticated);
  appRoot.setAttribute("aria-busy", "true");

  try {
    if (!await loadPageStyles(stylePage, version)) return;
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

async function showProfile(user) {
  if (!user) return showLogin();
  const version = ++renderVersion;
  appRoot.setAttribute("aria-busy", "true");
  try {
    if (!await loadPageStyles("profile", version)) return;
    const response = await fetch("src/pages/perfil/index.html");
    if (!response.ok) throw new Error("Não foi possível carregar a página de perfil.");
    const markup = await response.text();
    if (version !== renderVersion) return;
    const profileDocument = new DOMParser().parseFromString(markup, "text/html");
    const profilePage = profileDocument.querySelector("#profileRoot");
    if (!profilePage) throw new Error("O conteúdo do perfil não foi encontrado.");
    const content = appRoot.querySelector(".content");
    if (!content) return showDashboard(user);
    content.innerHTML = profilePage.innerHTML;
    document.querySelector("#pageTitle").textContent = "Meu perfil";
    const { mountProfilePage } = await import("../pages/perfil/profile.js");
    if (version === renderVersion) await mountProfilePage(user);
  } catch (error) {
    if (version === renderVersion) {
      const content = appRoot.querySelector(".content");
      if (content) content.innerHTML = `<section class="page-load-error"><h1>Não foi possível abrir o perfil</h1><p>${error.message}</p></section>`;
    }
  } finally {
    if (version === renderVersion) appRoot.setAttribute("aria-busy", "false");
  }
}

async function showAccounts(user) {
  if (!user) return showLogin();
  const version = ++renderVersion;
  appRoot.setAttribute("aria-busy", "true");
  try {
    if (!await loadPageStyles("accounts", version)) return;
    const response = await fetch("src/pages/contas/index.html");
    if (!response.ok) throw new Error("Não foi possível carregar contas e carteiras.");
    const markup = await response.text();
    if (version !== renderVersion) return;
    const content = appRoot.querySelector(".content");
    if (!content) return showDashboard(user);
    content.innerHTML = markup;
    document.querySelector("#pageTitle").textContent = "Contas e carteiras";
    const { mountAccountsPage } = await import("../pages/contas/accounts.js");
    if (version === renderVersion) mountAccountsPage(user);
  } catch (error) {
    if (version === renderVersion) {
      const content = appRoot.querySelector(".content");
      if (content) content.innerHTML = `<section class="page-load-error"><h1>Não foi possível abrir contas e carteiras</h1><p>${error.message}</p></section>`;
    }
  } finally {
    if (version === renderVersion) appRoot.setAttribute("aria-busy", "false");
  }
}

async function showCommitments(user) {
  if (!user) return showLogin();
  const version = ++renderVersion;
  appRoot.setAttribute("aria-busy", "true");
  try {
    if (!await loadPageStyles("commitments", version)) return;
    const response = await fetch("src/pages/compromissos/index.html");
    if (!response.ok) throw new Error("Não foi possível carregar os compromissos.");
    const markup = await response.text();
    if (version !== renderVersion) return;
    const content = appRoot.querySelector(".content");
    if (!content) return showDashboard(user);
    content.innerHTML = markup;
    document.querySelector("#pageTitle").textContent = "Compromissos";
    const { mountCommitmentsPage } = await import("../pages/compromissos/commitments.js");
    if (version === renderVersion) mountCommitmentsPage(user);
  } catch (error) {
    if (version === renderVersion) {
      const content = appRoot.querySelector(".content");
      if (content) content.innerHTML = `<section class="page-load-error"><h1>Não foi possível abrir compromissos</h1><p>${error.message}</p></section>`;
    }
  } finally {
    if (version === renderVersion) appRoot.setAttribute("aria-busy", "false");
  }
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
  document.querySelector("#mobileMore")?.setAttribute("aria-expanded", "false");

  if (page === "perfil") return showProfile(currentUser);
  if (page === "contas") return showAccounts(currentUser);
  if (page === "compromissos") return showCommitments(currentUser);
  if (page === "inicio") return showDashboard(currentUser);
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

window.addEventListener("orbe:navigate", (event) => {
  if (event.detail?.page === "inicio") showDashboard(currentUser);
  if (event.detail?.page === "perfil") showProfile(currentUser);
  if (event.detail?.page === "compromissos") showCommitments(currentUser);
});

if (firebaseReady) {
  observeAuth((user) => {
    currentUser = user;
    return user ? showDashboard(user) : showLogin();
  });
} else {
  showLogin();
}
