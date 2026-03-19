const bootConfigEl = document.getElementById('signup-profile-optional-boot-config');
let bootConfig = {};
if (bootConfigEl) {
  try {
    bootConfig = JSON.parse(bootConfigEl.textContent || '{}');
  } catch (error) {
    bootConfig = {};
  }
}
const profileForm = document.getElementById("profileForm");
    const saveBtn = document.getElementById("saveBtn");
    const skipBtn = document.getElementById("skipBtn");
    const error = document.getElementById("error");
    const success = document.getElementById("success");
    const csrfTokenTemplate = bootConfig.csrfToken || "";

    function getCsrfToken() {
      if (csrfTokenTemplate && csrfTokenTemplate !== "NOTPROVIDED") {
        return csrfTokenTemplate;
      }
      const value = `; ${document.cookie}`;
      const parts = value.split(`; csrftoken=`);
      if (parts.length === 2) {
        return parts.pop().split(";").shift();
      }
      return "";
    }

    async function postJson(payload) {
      const response = await fetch("/api/signup/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }
      return data;
    }

    async function submitProfile(payload, loadingText, button) {
      error.textContent = "";
      success.textContent = "";
      button.disabled = true;
      const previous = button.textContent;
      button.textContent = loadingText;

      try {
        const result = await postJson(payload);
        success.textContent = result.message || "Completed.";
        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        }
      } catch (err) {
        error.textContent = err.message;
      } finally {
        button.disabled = false;
        button.textContent = previous;
      }
    }

    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      await submitProfile(
        {
          skip: false,
          profilePictureUrl: document.getElementById("profilePictureUrl").value.trim(),
          bio: document.getElementById("bio").value.trim()
        },
        "Saving...",
        saveBtn
      );
    });

    skipBtn.addEventListener("click", async () => {
      await submitProfile({ skip: true }, "Skipping...", skipBtn);
    });

(function () {
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
    })();
