// HAPPNIX/static/js/ticket_view.js

document.addEventListener("DOMContentLoaded", function () {
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  const qrContainer = document.getElementById("ticket-qr-container");
  if (!qrContainer) return;

  const ticketId = qrContainer.dataset.ticketId;
  const ticketUrl = window.location.origin + "/ticket/" + ticketId + "/";

  if (typeof HappnixQR !== "undefined") {
    HappnixQR.generate("ticket-qr-container", ticketUrl);
  }
});
