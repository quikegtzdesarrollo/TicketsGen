const modal = document.getElementById("qr-modal");
const ticketLabel = document.getElementById("qr-ticket-id");
const ticketOwner = document.getElementById("qr-ticket-owner");
const ticketPhone = document.getElementById("qr-ticket-phone");
const qrContainer = document.getElementById("qr-code");
const qrDownload = document.getElementById("qr-download");
const qrShare = document.getElementById("qr-share");

let currentTicketId = "";
let currentOwner = "";
let currentPhone = "";

const renderQrCode = (text) => {
  if (!qrContainer || !text) {
    return;
  }
  qrContainer.innerHTML = "";
  // eslint-disable-next-line no-new
  new QRCode(qrContainer, {
    text,
    width: 180,
    height: 180,
  });
};

const getQrDataUrl = () => {
  if (!qrContainer) {
    return "";
  }
  const canvas = qrContainer.querySelector("canvas");
  if (canvas) {
    return canvas.toDataURL("image/png");
  }
  const img = qrContainer.querySelector("img");
  return img?.src || "";
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen del QR."));
    img.src = src;
  });

const buildExportLines = () => {
  const lines = [
    `ID: ${currentTicketId || "-"}`,
    `Nombre: ${currentOwner?.trim() || "Sin asignar"}`,
  ];
  const phone = currentPhone?.trim();
  if (phone) {
    lines.push(`Celular: ${phone}`);
  }
  return lines;
};

const buildQrExportDataUrl = async () => {
  const qrDataUrl = getQrDataUrl();
  if (!qrDataUrl) {
    return "";
  }

  const qrImg = await loadImage(qrDataUrl);
  const padding = 20;
  const lineHeight = 24;
  const lines = buildExportLines();
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

const openModal = (ticketId, owner, phone) => {
  currentTicketId = ticketId ?? "";
  currentOwner = owner ?? "";
  currentPhone = phone ?? "";

  if (ticketLabel) {
    ticketLabel.textContent = currentTicketId
      ? `Boleto: ${currentTicketId}`
      : "Boleto seleccionado";
  }
  if (ticketOwner) {
    ticketOwner.textContent = currentOwner
      ? `Nombre: ${currentOwner}`
      : "Nombre: Sin asignar";
  }
  if (ticketPhone) {
    const phoneText = currentPhone?.trim();
    ticketPhone.textContent = phoneText ? `Celular: ${phoneText}` : "";
    ticketPhone.hidden = !phoneText;
  }

  renderQrCode(currentTicketId);
  modal.classList.add("modal-open");
  modal.setAttribute("aria-hidden", "false");
};

const closeModal = () => {
  modal.classList.remove("modal-open");
  modal.setAttribute("aria-hidden", "true");
};

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest(".qr-button");
  if (!button) {
    return;
  }
  const ticketId = button.dataset.ticketId;
  const owner = button.dataset.ticketOwner;
  const phone = button.dataset.ticketPhone;
  openModal(ticketId, owner, phone);
});

modal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.dataset.closeModal === "true") {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal.classList.contains("modal-open")) {
    closeModal();
  }
});

qrDownload?.addEventListener("click", async () => {
  if (!qrDownload) {
    return;
  }
  qrDownload.disabled = true;
  try {
    const dataUrl = await buildQrExportDataUrl();
    if (!dataUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${currentTicketId || "qr-boleto"}.png`;
    link.click();
  } catch (error) {
    console.error(error);
    alert("No se pudo generar la imagen del QR.");
  } finally {
    qrDownload.disabled = false;
  }
});

qrShare?.addEventListener("click", async () => {
  if (!navigator.share) {
    return;
  }
  try {
    const dataUrl = await buildQrExportDataUrl();
    const shareData = {
      title: "QR del boleto",
      text: `Boleto: ${currentTicketId}`,
    };
    if (dataUrl && navigator.canShare) {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `${currentTicketId || "qr-boleto"}.png`, {
        type: "image/png",
      });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ ...shareData, files: [file] });
        return;
      }
    }
    await navigator.share(shareData);
  } catch (error) {
    // ignore share cancellation
  }
});

if (qrShare && !navigator.share) {
  qrShare.style.display = "none";
}
