/* Load the pinned math engine only on pages containing real math markup. */
(() => {
  if (window.__marsMathLoader) return;
  window.__marsMathLoader = true;
  let engine;
  let work = Promise.resolve();

  function loadEngine() {
    if (engine) return engine;
    window.MathJax = {
      tex: {
        inlineMath: [["\\(", "\\)"]],
        displayMath: [["\\[", "\\]"]],
        processEscapes: true,
        processEnvironments: true,
      },
      options: {ignoreHtmlClass: ".*|", processHtmlClass: "arithmatex"},
      startup: {typeset: false},
    };
    engine = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/mathjax@3.2.2/es5/tex-mml-chtml.js";
      script.async = true;
      script.onload = () => window.MathJax.startup.promise.then(() => resolve(window.MathJax), reject);
      script.onerror = () => reject(new Error("Math engine could not be loaded"));
      document.head.append(script);
    });
    return engine;
  }

  function update() {
    work = work.then(async () => {
      const nodes = [...document.querySelectorAll(".arithmatex")]
        .filter(node => !node.querySelector("mjx-container"));
      if (!nodes.length) return;
      const math = await loadEngine();
      await math.typesetPromise(nodes.filter(node => node.isConnected));
    }).catch(error => console.warn("MARS math rendering:", error));
  }

  if (typeof document$ !== "undefined" && document$.subscribe) {
    document$.subscribe(update);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", update, {once: true});
  } else update();
})();
