const modal = document.getElementById("qr-modal");
const modalBackdrop = modal?.querySelector(".modal-backdrop");
const ticketLabel = document.getElementById("qr-ticket-id");
const ticketOwner = document.getElementById("qr-ticket-owner");
const ticketPhone = document.getElementById("qr-ticket-phone");
const qrContainer = document.getElementById("qr-code");

let currentTicketId = "";
let currentOwner = "";
let currentPhone = "";

const readButtonData = (button) => ({
  ticketId: button.getAttribute("data-ticket-id") ?? button.dataset.ticketId ?? "",
  owner: button.getAttribute("data-ticket-owner") ?? button.dataset.ticketOwner ?? "",
  phone: button.getAttribute("data-ticket-phone") ?? button.dataset.ticketPhone ?? "",
});

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

const renderQrCode = async (text) => {
  if (!qrContainer || !text) {
    return;
  }

  qrContainer.innerHTML = '<p class="helper">Generando QR...</p>';

  if (window.TicketGenQrExport?.createQrCodeDataUrl) {
    try {
      const dataUrl = await window.TicketGenQrExport.createQrCodeDataUrl(text);
      qrContainer.innerHTML = "";
      const img = document.createElement("img");
      img.src = dataUrl;
      img.width = 180;
      img.height = 180;
      img.alt = "Código QR";
      qrContainer.appendChild(img);
      return;
    } catch (error) {
      console.error(error);
    }
  }

  if (typeof QRCode === "undefined") {
    qrContainer.innerHTML = '<p class="helper">No se pudo cargar el generador QR.</p>';
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

const buildQrExportDataUrl = async () => {
  if (window.TicketGenQrExport?.buildQrExportDataUrl && currentTicketId) {
    try {
      return await window.TicketGenQrExport.buildQrExportDataUrl(
        currentTicketId,
        currentTicketId,
        currentOwner,
        currentPhone
      );
    } catch (error) {
      console.error(error);
    }
  }

  const qrDataUrl = getQrDataUrl();
  if (!qrDataUrl || !window.TicketGenQrExport) {
    return "";
  }
  return window.TicketGenQrExport.composeQrExportImage(
    qrDataUrl,
    currentTicketId,
    currentOwner,
    currentPhone
  );
};

const openModal = (ticketId, owner, phone) => {
  if (!modal) {
    console.error("TicketGen: no se encontró #qr-modal en esta página.");
    return;
  }

  currentTicketId = ticketId ?? "";
  currentOwner = owner ?? "";
  currentPhone = phone ?? "";

  const isMemberVisit = String(currentTicketId).startsWith("MV-");

  if (ticketLabel) {
    ticketLabel.textContent = currentTicketId
      ? isMemberVisit
        ? `Registro: ${currentTicketId}`
        : `Boleto: ${currentTicketId}`
      : "Registro seleccionado";
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

  modal.classList.add("modal-open");
  modal.setAttribute("aria-hidden", "false");
  renderQrCode(currentTicketId);
};

const closeModal = () => {
  if (!modal) {
    return;
  }
  modal.classList.remove("modal-open");
  modal.setAttribute("aria-hidden", "true");
};

const handleQrButtonClick = (button) => {
  if (!(button instanceof Element)) {
    return;
  }
  const { ticketId, owner, phone } = readButtonData(button);
  if (!ticketId) {
    return;
  }
  openModal(ticketId, owner, phone);
};

const runDownload = async () => {
  const downloadBtn = modal?.querySelector("#qr-download");
  if (downloadBtn instanceof HTMLButtonElement) {
    downloadBtn.disabled = true;
  }
  try {
    const dataUrl = await buildQrExportDataUrl();
    if (!dataUrl) {
      alert("No se pudo generar la imagen del QR. Intenta de nuevo en un momento.");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `${currentTicketId || "qr-boleto"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.error(error);
    alert("No se pudo generar la imagen del QR.");
  } finally {
    if (downloadBtn instanceof HTMLButtonElement) {
      downloadBtn.disabled = false;
    }
  }
};

const runShare = async () => {
  if (!navigator.share) {
    alert("Tu navegador no admite compartir archivos. Usa «Descargar QR».");
    return;
  }
  try {
    const dataUrl = await buildQrExportDataUrl();
    if (!dataUrl) {
      alert("No se pudo generar la imagen del QR. Intenta de nuevo en un momento.");
      return;
    }
    const shareData = {
      title: "QR del boleto",
      text: `Boleto: ${currentTicketId}`,
    };
    if (navigator.canShare) {
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
};

const handleModalAction = (event) => {
  if (!modal?.classList.contains("modal-open")) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("#qr-download")) {
    event.preventDefault();
    void runDownload();
    return;
  }

  if (target.closest("#qr-share")) {
    event.preventDefault();
    void runShare();
    return;
  }

  if (
    target === modalBackdrop ||
    target.closest("#qr-modal-close") ||
    (target.dataset.closeModal === "true" && !target.closest(".qr-actions"))
  ) {
    event.preventDefault();
    closeModal();
  }
};

window.openTicketQrModal = openModal;
window.TicketGenQrModal = {
  open: openModal,
  close: closeModal,
};

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (modal?.contains(target)) {
    handleModalAction(event);
    return;
  }

  const button = target.closest(".qr-button");
  if (!button) {
    return;
  }
  event.preventDefault();
  handleQrButtonClick(button);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal?.classList.contains("modal-open")) {
    closeModal();
  }
});

const shareBtn = modal?.querySelector("#qr-share");
if (shareBtn && !navigator.share) {
  shareBtn.hidden = true;
}
