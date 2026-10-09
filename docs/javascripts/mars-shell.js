/* Native drawer behavior with an accessible, keyboard-operable menu button. */
(() => {
  if (window.__marsShellMounted) return;
  window.__marsShellMounted = true;
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  function syncTheme() {
    document.body.dataset.mdColorScheme = systemTheme.matches ? "slate" : "default";
  }
  systemTheme.addEventListener("change", syncTheme);
  syncTheme();
  const heroPicture = document.querySelector(".mars-hero__background");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const nativeDepth = CSS.supports("animation-timeline", "scroll(root block)") && CSS.supports("animation-range", "0px 100svh");
  let depthRange = 1;
  let depthDistance = 0;
  let depthProgress = null;
  let depthWidth = window.innerWidth;
  function syncHeroDepth() {
    if (!heroPicture || heroPicture.dataset.parallax !== "fallback") return;
    const progress = Math.min(1, Math.max(0, window.scrollY / depthRange));
    if (progress === depthProgress) return;
    heroPicture.style.setProperty("--mars-parallax-shift", `${progress * depthDistance}px`);
    depthProgress = progress;
  }
  function configureHeroDepth() {
    if (!heroPicture) return;
    heroPicture.style.removeProperty("--mars-parallax-shift");
    depthProgress = null;
    if (reducedMotion.matches) {
      heroPicture.dataset.parallax = "disabled";
      return;
    }
    // Keep native and fallback travel identical; no zoom, crop, or live toolbar-height measurements.
    depthRange = heroPicture.closest(".mars-hero").offsetHeight + 64;
    depthDistance = Math.min(window.innerWidth <= 640 ? 36 : 84, depthRange * .25);
    heroPicture.style.setProperty("--mars-parallax-distance", `${depthDistance}px`);
    heroPicture.dataset.parallax = nativeDepth ? "native" : "fallback";
    if (!nativeDepth) {
      syncHeroDepth();
    }
  }
  reducedMotion.addEventListener("change", configureHeroDepth);
  configureHeroDepth();
  const header = document.querySelector(".mars-header");
  let scrollFrame = 0;
  let headerSurfaceProgress;
  // Keep the initial glass surface through incidental scrolling, then blend
  // only its paint. No live geometry reads, transition timers or parallax changes.
  function surfaceProgressAtScroll() {
    return heroPicture ? Math.min(1, Math.max(0, (window.scrollY - 64) / 160)) : 0;
  }
  function syncHeaderSurface() {
    const progress = surfaceProgressAtScroll();
    if (header && heroPicture && progress !== headerSurfaceProgress) {
      const blend = progress * progress * (3 - 2 * progress);
      header.style.setProperty("--mars-header-rgb", `${7 + 5 * blend}, ${15 + 5 * blend}, ${26 + 7 * blend}`);
      header.style.setProperty("--mars-header-top-alpha", String(.48 + .32 * blend));
      header.style.setProperty("--mars-header-bottom-alpha", String(.24 + .56 * blend));
      header.style.setProperty("--mars-header-surface-progress", String(progress));
      header.dataset.scrolled = String(progress === 1);
    }
    headerSurfaceProgress = progress;
    syncHeroDepth();
    scrollFrame = 0;
  }
  window.addEventListener("scroll", () => {
    if (document.hidden) return;
    const pendingDepth = heroPicture?.dataset.parallax === "fallback" &&
      Math.min(1, Math.max(0, window.scrollY / depthRange)) !== depthProgress;
    if (!scrollFrame && (surfaceProgressAtScroll() !== headerSurfaceProgress || pendingDepth)) {
      scrollFrame = requestAnimationFrame(syncHeaderSurface);
    }
  }, {passive: true});
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = 0;
    } else {
      syncHeaderSurface();
    }
  });
  window.addEventListener("pageshow", syncHeaderSurface);
  syncHeaderSurface();
  document.querySelectorAll(".mars-topnav .md-tabs__item--active a, #mars-site-navigation a.md-nav__link--active").forEach(link => {
    link.setAttribute("aria-current", "page");
  });
  const menuBackground = new Map();
  let menuWasOpen = false;
  function syncMenu() {
    const drawer = document.getElementById("__drawer");
    const button = document.querySelector("[data-mars-menu]");
    const sidebar = document.querySelector(".md-sidebar--primary");
    if (!drawer || !button) return;
    button.setAttribute("aria-expanded", String(drawer.checked));
    button.setAttribute("aria-label", drawer.checked ? "Close navigation menu" : "Open navigation menu");
    if (sidebar) sidebar.inert = window.innerWidth < 1000 && !drawer.checked;
    const open = window.innerWidth < 1000 && drawer.checked;
    document.documentElement.toggleAttribute("data-mars-menu-open", open);
    if (open) {
      document.querySelectorAll(".mars-hero, .md-content, .md-sidebar--secondary, .mars-footer").forEach(element => {
        if (!menuBackground.has(element)) menuBackground.set(element, element.inert);
        element.inert = true;
      });
    } else {
      menuBackground.forEach((inert, element) => {element.inert = inert;});
      menuBackground.clear();
      if (menuWasOpen && document.activeElement.closest(".md-sidebar--primary")) button.focus({preventScroll: true});
    }
    menuWasOpen = open;
  }
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-mars-menu]");
    if (!button) return;
    const drawer = document.getElementById("__drawer");
    if (!drawer) return;
    drawer.checked = !drawer.checked;
    drawer.dispatchEvent(new Event("change", {bubbles: true}));
    syncMenu();
  });
  document.addEventListener("change", event => {
    if (event.target.id === "__drawer") syncMenu();
  });
  document.addEventListener("keydown", event => {
    const drawer = document.getElementById("__drawer");
    const nestedLabel = event.target.closest("#mars-site-navigation label.md-nav__link[for^='__nav_']");
    if (event.key === " " && nestedLabel) {
      // Native Zensical already handles Enter on these labels, but not Space.
      event.preventDefault();
      nestedLabel.click();
      return;
    }
    if (event.key === "Tab" && window.innerWidth < 1000 && drawer?.checked) {
      const focusable = [...document.querySelectorAll(".mars-header__brand, [data-mars-menu], #mars-site-navigation a[href], #mars-site-navigation label[tabindex='0']")].filter(element => element.offsetParent !== null && !element.closest("nav[aria-expanded='false']") && getComputedStyle(element).visibility !== "hidden");
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!focusable.includes(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({preventScroll: true});
      }
    }
    if (event.key !== "Escape" || !drawer?.checked) return;
    drawer.checked = false;
    drawer.dispatchEvent(new Event("change", {bubbles: true}));
    document.querySelector("[data-mars-menu]")?.focus();
  });
  window.addEventListener("pagehide", () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    const drawer = document.getElementById("__drawer");
    if (drawer) drawer.checked = false;
    syncMenu();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth !== depthWidth) {
      depthWidth = window.innerWidth;
      configureHeroDepth();
    }
    if (window.innerWidth >= 1000) {
      const drawer = document.getElementById("__drawer");
      if (drawer) drawer.checked = false;
    }
    syncMenu();
  });
  if (typeof document$ !== "undefined") {
    document$.subscribe(() => {
      syncTheme();
      const drawer = document.getElementById("__drawer");
      if (drawer) drawer.checked = false;
      syncMenu();
    });
  }
  syncMenu();
})();
