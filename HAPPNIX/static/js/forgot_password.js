const bootConfigEl = document.getElementById('forgot-password-boot-config');
let bootConfig = {};
if (bootConfigEl) {
  try {
    bootConfig = JSON.parse(bootConfigEl.textContent || '{}');
  } catch (error) {
    bootConfig = {};
  }
}
const form = document.getElementById("forgotPasswordForm");
    const email = document.getElementById("email");
    const errorMsg = document.getElementById("errorMsg");
    const successMsg = document.getElementById("successMsg");
    const submitBtn = document.getElementById("submitBtn");
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

    async function postJson(url, payload) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCsrfToken()
        },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      });

      let body = {};
      try {
        body = await response.json();
      } catch (_error) {
        body = {};
      }

      if (!response.ok) {
        throw new Error(body.message || "Request failed. Please try again.");
      }

      return body;
    }

    function setLoading(loading) {
      submitBtn.disabled = loading;
      submitBtn.textContent = loading ? "Sending..." : "Send Verification Link";
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const emailValue = email.value.trim();
      errorMsg.textContent = "";
      successMsg.textContent = "";

      if (!emailValue) {
        errorMsg.textContent = "Please enter your email address.";
        return;
      }

      setLoading(true);
      try {
        const result = await postJson("/api/auth/password/forgot", { email: emailValue });
        successMsg.textContent = result.message || "Verification email sent successfully.";
      } catch (error) {
        errorMsg.textContent = error.message;
      } finally {
        setLoading(false);
      }
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
