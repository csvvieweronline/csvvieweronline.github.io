(() => {
  const root = document.documentElement;
  const themeToggle = document.querySelector("[data-theme-toggle]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-site-nav]");
  const yearEl = document.querySelector("[data-year]");

  const normalizePath = (path) => {
    if (!path || path === "") return "/";
    const clean = path.endsWith("/") ? path : `${path}/`;
    return clean;
  };

  const setTheme = (theme) => {
    root.setAttribute("data-theme", theme);
    localStorage.setItem("csvvieweronline-theme", theme);
    if (themeToggle) {
      themeToggle.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
      themeToggle.textContent = theme === "dark" ? "?" : "?";
    }
  };

  const savedTheme = localStorage.getItem("csvvieweronline-theme");
  const preferredDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (preferredDark ? "dark" : "light"));

  themeToggle?.addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(next);
  });

  menuToggle?.addEventListener("click", () => {
    const isOpen = nav?.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }

  const current = normalizePath(window.location.pathname.replace("/index.html", "/"));
  document.querySelectorAll("[data-site-nav] a").forEach((link) => {
    const href = link.getAttribute("href");
    if (normalizePath(href) === current) {
      link.setAttribute("aria-current", "page");
    }
  });

  document.querySelectorAll("[data-tabset]").forEach((tabset) => {
    const buttons = tabset.querySelectorAll("[data-tab-target]");
    const panels = tabset.querySelectorAll("[data-tab-panel]");
    if (buttons.length === 0 || panels.length === 0) return;

    const activate = (targetId) => {
      buttons.forEach((btn) => {
        const active = btn.getAttribute("data-tab-target") === targetId;
        btn.setAttribute("aria-selected", active ? "true" : "false");
      });

      panels.forEach((panel) => {
        panel.hidden = panel.id !== targetId;
      });
    };

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.getAttribute("data-tab-target");
        activate(targetId);
      });
    });

    const firstTarget = buttons[0].getAttribute("data-tab-target");
    activate(firstTarget);
  });
})();
