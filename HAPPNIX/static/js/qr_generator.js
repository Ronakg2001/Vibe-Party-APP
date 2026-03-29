const HappnixQR = {
  /**
   * Generates a styled QR code inside a specific HTML container.
   * * @param {string} containerId - The ID of the div where the QR code will be drawn.
   * @param {string} dataUrl - The URL or text the QR code should hold.
   * @param {string} type - 'event', 'ticket_regular', 'ticket_vip', or 'profile'
   * @returns {Object} - Returns the QR code instance so you can download it later.
   */
  generate: function (containerId, dataUrl, type = "event") {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(
        `HappnixQR Error: Container ID '${containerId}' not found.`,
      );
      return null;
    }

    // Clear any existing QR code in that container
    container.innerHTML = "";

    // Default Colors (Happnix Cyan & Fuchsia)
    let mainColor = "#22d3ee";
    let cornerColor = "#d946ef";

    // Customize colors based on what we are generating
    if (type === "ticket_vip") {
      mainColor = "#FFD700"; // Gold for VIP tickets
      cornerColor = "#FFD700";
    } else if (type === "profile") {
      mainColor = "#00ffcc"; // Neon Mint for user profiles
      cornerColor = "#00ffcc";
    } else if (type === "ticket_regular") {
      mainColor = "#22d3ee";
      cornerColor = "#22d3ee"; // Solid cyan for regular tickets
    }

    const qrCode = new QRCodeStyling({
      // Look for data-width/data-height on the div, fallback to 220
      width: container.dataset.width ? parseInt(container.dataset.width) : 220,
      height: container.dataset.height
        ? parseInt(container.dataset.height)
        : 220,
      data: dataUrl,
      margin: 10,
      qrOptions: {
        typeNumber: 0,
        mode: "Byte",
        errorCorrectionLevel: "H",
      },

      // Optional: Add your logo in the middle
      image: "/static/img/HX_Logo.png",
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 0,
        imageSize: 0.9, // Takes up 30% of the center
        hideBackgroundDots: false,
      },

      dotsOptions: {
        type: "dots",
        gradient: {
          type: "linear", // Can be "linear" or "radial"
          rotation: 0.785398, // Rotation in Radians (This is 45 degrees)
          colorStops: [
            { offset: 0, color: "#22d3ee" }, // Start color (Cyan)
            { offset: 1, color: "#d946ef" }, // End color (Fuchsia)
          ],
        },
      },
      backgroundOptions: { color: "transparent" },
      cornersSquareOptions: { color: cornerColor, type: "extra-rounded" },
      cornersDotOptions: { color: mainColor, type: "dot" },
    });

    // Draw it to the screen
    qrCode.append(container);
    return qrCode; // Return the instance so it can be downloaded
  },

  /**
   * Downloads an existing QR code as an image.
   */
  download: function (qrInstance, filename) {
    if (qrInstance) {
      qrInstance.download({ name: filename, extension: "png" });
    }
  },
};
