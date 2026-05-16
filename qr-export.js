const QR_SIZE = 180;

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen del QR."));
    img.src = src;
  });

const buildExportLines = (ticketId, owner, phone) => {
  const lines = [
    `ID: ${ticketId || "-"}`,
    `Nombre: ${owner?.trim() || "Sin asignar"}`,
  ];
  const phoneText = phone?.trim();
  if (phoneText) {
    lines.push(`Celular: ${phoneText}`);
  }
  return lines;
};

const readQrDataUrl = (container) => {
  if (!container) {
    return "";
  }
  const canvas = container.querySelector("canvas");
  if (canvas) {
    return canvas.toDataURL("image/png");
  }
  const img = container.querySelector("img");
  return img?.src || "";
};

let qrRenderHost = null;

const ensureQrRenderHost = () => {
  if (!qrRenderHost) {
    qrRenderHost = document.createElement("div");
    qrRenderHost.setAttribute("aria-hidden", "true");
    qrRenderHost.style.cssText =
      "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;";
    document.body.appendChild(qrRenderHost);
  }
  return qrRenderHost;
};

const createQrCodeDataUrl = (text) =>
  new Promise((resolve, reject) => {
    if (!text) {
      reject(new Error("Falta el texto del QR."));
      return;
    }
    if (typeof QRCode === "undefined") {
      reject(new Error("La librería QR no está disponible."));
      return;
    }

    const host = ensureQrRenderHost();
    host.innerHTML = "";
    // eslint-disable-next-line no-new
    new QRCode(host, {
      text,
      width: QR_SIZE,
      height: QR_SIZE,
    });

    const tryRead = (attempt = 0) => {
      const dataUrl = readQrDataUrl(host);
      if (dataUrl) {
        resolve(dataUrl);
        return;
      }
      if (attempt >= 24) {
        reject(new Error("No se pudo generar el QR."));
        return;
      }
      setTimeout(() => tryRead(attempt + 1), 50);
    };

    tryRead();
  });

const composeQrExportImage = async (qrDataUrl, ticketId, owner, phone) => {
  if (!qrDataUrl) {
    return "";
  }

  const qrImg = await loadImage(qrDataUrl);
  const padding = 20;
  const lineHeight = 24;
  const lines = buildExportLines(ticketId, owner, phone);
  const footerHeight = padding + lines.length * lineHeight + padding;
  const qrSize = qrImg.width;
  const width = Math.max(qrSize + padding * 2, 300);
  const height = padding + qrSize + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return qrDataUrl;
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const qrX = (width - qrSize) / 2;
  ctx.drawImage(qrImg, qrX, padding, qrSize, qrSize);

  ctx.fillStyle = "#1f2a44";
  ctx.font = "600 15px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  let textY = padding + qrSize + padding;
  for (const line of lines) {
    ctx.fillText(line, width / 2, textY);
    textY += lineHeight;
  }

  return canvas.toDataURL("image/png");
};

const buildQrExportDataUrl = async (text, ticketId, owner, phone) => {
  const qrDataUrl = await createQrCodeDataUrl(text);
  return composeQrExportImage(qrDataUrl, ticketId, owner, phone);
};

window.TicketGenQrExport = {
  composeQrExportImage,
  buildQrExportDataUrl,
};
