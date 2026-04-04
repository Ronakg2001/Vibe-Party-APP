const bootConfigEl = document.getElementById('signup-details-boot-config');
let bootConfig = {};
if (bootConfigEl) {
  try {
    bootConfig = JSON.parse(bootConfigEl.textContent || '{}');
  } catch (error) {
    bootConfig = {};
  }
}
const form = document.getElementById("detailsForm");
    const submitBtn = document.getElementById("submitBtn");
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

    function setDobMax() {
      const dobInput = document.getElementById("dob");
      const today = new Date();
      dobInput.max = today.toISOString().split("T")[0];
    }

    function isStrongPassword(value) {
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(value);
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

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.message || "Request failed.");
      }
      return data;
    }

    setDobMax();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      error.textContent = "";
      success.textContent = "";
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving...";

      try {
        const passwordValue = document.getElementById("password").value.trim();
        if (!isStrongPassword(passwordValue)) {
          throw new Error("Password must have uppercase, lowercase, number, special character, and minimum 8 characters.");
        }

        const result = await postJson("/api/signup/details", {
          fullName: document.getElementById("fullName").value.trim(),
          username: document.getElementById("username").value.trim(),
          password: passwordValue,
          sex: document.getElementById("sex").value,
          dateOfBirth: document.getElementById("dob").value,
          email: document.getElementById("email").value.trim(),
          govId: document.getElementById("govId").value.trim()
        });

        success.textContent = result.message || "Saved.";
        if (result.redirectUrl) {
          window.location.href = result.redirectUrl;
        }
      } catch (err) {
        error.textContent = err.message;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Continue";
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
