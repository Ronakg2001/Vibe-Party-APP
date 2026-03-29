// HAPPNIX/static/js/ticket_view.js

document.addEventListener("DOMContentLoaded", function () {
  // Initialize Lucide icons if they exist
  if (typeof lucide !== "undefined") {
    lucide.createIcons();
  }

  const qrContainer = document.getElementById("ticket-qr-container");
  if (!qrContainer) return;

  // 1. Read the Django data we embedded into the HTML data attributes
  const ticketId = qrContainer.dataset.ticketId;
  const ticketTier = (qrContainer.dataset.ticketTier || "").toLowerCase();

  // 2. The URL the bouncer scans to verify the ticket
  const verifyUrl =
    window.location.origin + "/api/tickets/" + ticketId + "/verify";

  // 3. Determine if it's a VIP ticket to change the color
  const qrType = ticketTier.includes("vip") ? "ticket_vip" : "ticket_regular";

  // 4. Generate the QR Code using your centralized file
  if (typeof HappnixQR !== "undefined") {
    HappnixQR.generate("ticket-qr-container", verifyUrl, qrType);
  } else {
    console.error(
      "HappnixQR is not defined. Ensure qr_generator.js is loaded first.",
    );
  }
});
