const HappnixQR = {
  generate: function (containerId, dataUrl) {
    const container = document.getElementById(containerId);
    if (!container || typeof QRCodeStyling === "undefined") {
      return null;
    }

    container.innerHTML = "";

    const width = container.dataset.width ? parseInt(container.dataset.width, 10) : 220;
    const height = container.dataset.height ? parseInt(container.dataset.height, 10) : 220;

    const qrCode = new QRCodeStyling({
      width,
      height,
      data: dataUrl,
      margin: 0,
      qrOptions: {
        typeNumber: 0,
        mode: "Byte",
        errorCorrectionLevel: "M",
      },
      dotsOptions: {
        type: "square",
        color: "#111827",
      },
      backgroundOptions: {
        color: "#ffffff",
      },
      cornersSquareOptions: {
        type: "square",
        color: "#111827",
      },
      cornersDotOptions: {
        type: "square",
        color: "#111827",
      },
    });

    qrCode.append(container);
    return qrCode;
  },

  download: function (qrInstance, filename) {
    if (qrInstance) {
      qrInstance.download({ name: filename, extension: "png" });
    }
  },
};
