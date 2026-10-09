/* No third-party request is made before an explicit, keyboard-accessible play. */
(() => {
  function mount() {
    for (const host of document.querySelectorAll(".mars-video-facade[data-youtube-id]")) {
      const button = host.querySelector(".mars-video-facade__play");
      const videoId = host.dataset.youtubeId;
      if (!button || button.dataset.mounted || !/^[\w-]{11}$/.test(videoId)) continue;
      button.dataset.mounted = "true";
      button.addEventListener("click", () => {
        const frame = document.createElement("iframe");
        frame.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`;
        frame.title = host.dataset.videoTitle || "MARS rocket launch video";
        frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.allowFullscreen = true;
        host.replaceChildren(frame);
        frame.focus();
      }, {once: true});
    }
  }
  if (typeof document$ !== "undefined" && document$.subscribe) document$.subscribe(mount);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, {once: true});
  else mount();
})();
