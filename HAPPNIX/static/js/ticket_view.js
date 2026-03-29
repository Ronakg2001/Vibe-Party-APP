document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  const payloadElement = document.getElementById("ticket-view-data");
  const qrContainer = document.getElementById("ticket-qr-container");
  if (!payloadElement || !qrContainer || typeof QRCodeStyling === "undefined") {
    return;
  }

  const ticket = JSON.parse(payloadElement.textContent || "{}");
  const ticketUrl = `${window.location.origin}/ticket/${ticket.id}/`;
  const tierName = String(ticket.tierName || "")
    .trim()
    .toLowerCase();
  const isVipTier = tierName.includes("vip");
  const startColor = isVipTier ? "#0b3af5" : "#22d3ee";
  const endColor = isVipTier ? "#9592e7" : "#d946ef";

  const ticketQr = new QRCodeStyling({
    width: 208,
    height: 208,
    data: ticketUrl,
    margin: 4,
    qrOptions: {
      typeNumber: 0,
      mode: "Byte",
      errorCorrectionLevel: "H",
    },
    image: "/static/img/HX_Logo.PNG",
    imageOptions: {
      crossOrigin: "anonymous",
      margin: 4,
      imageSize: 0.36,
      hideBackgroundDots: true,
    },
    dotsOptions: {
      type: "classy",
      gradient: {
        type: "linear",
        rotation: 0.785398,
        colorStops: [
          { offset: 0, color: startColor },
          { offset: 1, color: endColor },
        ],
      },
    },
    backgroundOptions: { color: "transparent" },
    cornersSquareOptions: { color: "#0f172a", type: "extra-rounded" },
    cornersDotOptions: { color: endColor, type: "dot" },
  });

  qrContainer.innerHTML = "";
  ticketQr.append(qrContainer);
});
