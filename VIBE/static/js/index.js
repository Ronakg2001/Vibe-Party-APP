(function () {
      const loader = document.getElementById("party-loader");
      const minVisibleMs = 1200;
      const loaderStart = Date.now();

      function hideLoader() {
        if (!loader || loader.classList.contains("is-hidden")) return;
        const elapsed = Date.now() - loaderStart;
        const waitMs = Math.max(0, minVisibleMs - elapsed);
        window.setTimeout(function () {
          loader.classList.add("is-hidden");
          window.setTimeout(function () {
            loader.remove();
          }, 420);
        }, waitMs);
      }

      function openHashTarget() {
        const hash = window.location.hash;
        if (!hash || hash.length < 2) return;
        const targetId = decodeURIComponent(hash.slice(1));
        const target = document.getElementById(targetId);
        if (!target) return;
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (typeof target.focus === "function") {
          target.setAttribute("tabindex", "-1");
          target.focus({ preventScroll: true });
        }
      }

      window.routeToId = function (targetId, path) {
        if (!targetId) return;
        const encoded = encodeURIComponent(targetId);
        if (path && path !== window.location.pathname) {
          window.location.href = `${path}#${encoded}`;
          return;
        }
        window.location.hash = encoded;
      };

      window.addEventListener("hashchange", openHashTarget);
      window.addEventListener("DOMContentLoaded", openHashTarget);
      window.addEventListener("load", hideLoader);

      if (document.readyState === "complete") {
        hideLoader();
      }
    })();
