const modal = document.getElementById("qr-modal");
const ticketLabel = document.getElementById("qr-ticket-id");
const ticketOwner = document.getElementById("qr-ticket-owner");
const qrContainer = document.getElementById("qr-code");
const qrDownload = document.getElementById("qr-download");
const qrShare = document.getElementById("qr-share");
let currentTicketId = "";

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

const openModal = (ticketId, owner) => {
  ticketLabel.textContent = ticketId
    ? `Boleto seleccionado: ${ticketId}`
    : "Boleto seleccionado";
  ticketOwner.textContent = owner ? `Asignado a: ${owner}` : "";
  currentTicketId = ticketId ?? "";
  renderQrCode(ticketId ?? "");
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
  openModal(ticketId, owner);
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

qrDownload?.addEventListener("click", () => {
  const dataUrl = getQrDataUrl();
  if (!dataUrl) {
    return;
  }
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = `${currentTicketId || "qr-boleto"}.png`;
  link.click();
});

qrShare?.addEventListener("click", async () => {
  if (!navigator.share) {
    return;
  }
  try {
    await navigator.share({
      title: "QR del boleto",
      text: `Boleto: ${currentTicketId}`,
    });
  } catch (error) {
    // ignore share cancellation
  }
});

if (qrShare && !navigator.share) {
  qrShare.style.display = "none";
}
