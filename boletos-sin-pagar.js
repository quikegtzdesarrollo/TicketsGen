const unpaidTable = document.getElementById("unpaid-table");
const unpaidStatus = document.getElementById("unpaid-status");
const payModal = document.getElementById("pay-modal");
const payModalTicket = document.getElementById("pay-modal-ticket");
const payReceiptInput = document.getElementById("pay-receipt-file");
const payReceiptName = document.getElementById("pay-receipt-name");
const payReceiptPhone = document.getElementById("pay-receipt-phone");
const payModalError = document.getElementById("pay-modal-error");
const payModalSuccess = document.getElementById("pay-modal-success");
const confirmPayButton = document.getElementById("confirm-pay");
const unpaidExportZipBtn = document.getElementById("unpaid-export-zip");

const UNPAID_STATUSES = ["no_pagado"];

let activePayment = null;
let unpaidRows = [];

const escapeAttr = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const unpaidTableHeadHtml = `
  <div class="table-row table-head">
    <span>ID del boleto</span>
    <span>Celular</span>
    <span>QR</span>
    <span>Pagar</span>
  </div>
`;

const attendeeDisplayName = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return attendees[0]?.full_name?.trim() || "";
  }
  return attendees?.full_name?.trim() || "";
};

const safeFileName = (value) =>
  String(value ?? "boleto")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "boleto";

const updateExportZipButton = () => {
  if (!unpaidExportZipBtn) {
    return;
  }
  unpaidExportZipBtn.disabled = !unpaidRows.length;
};

const paymentsByOrderId = (paymentRows) => {
  const map = {};
  for (const row of paymentRows ?? []) {
    const oid = row?.order_id;
    if (oid == null) {
      continue;
    }
    map[String(oid)] = row;
  }
  return map;
};

const readReceiptAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.readAsDataURL(file);
  });

const validatePayReceipt = () => {
  const file = payReceiptInput?.files?.[0];
  if (!file) {
    return "Adjunta el comprobante de pago.";
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return "El comprobante debe ser una imagen JPG o PNG.";
  }
  return "";
};

const renderUnpaidHead = () => {
  unpaidTable.innerHTML = unpaidTableHeadHtml;
};

const renderRows = (rows) => {
  const rowsHtml = rows
    .map(
      (row) => `
      <div class="table-row">
        <span>${row.ticket_code}</span>
        <span>${row.reference_phone ?? "-"}</span>
        <button
          class="qr-button"
          type="button"
          aria-label="Abrir QR"
          data-ticket-id="${escapeAttr(row.ticket_code)}"
          data-ticket-owner="${escapeAttr(row.owner_name ?? "")}"
          data-ticket-phone="${escapeAttr(row.reference_phone ?? "")}"
        >
          <span aria-hidden="true">📱</span>
        </button>
        <button
          class="primary-link button pay-button"
          type="button"
          data-ticket-code="${escapeAttr(row.ticket_code)}"
          data-payment-id="${escapeAttr(row.payment_id)}"
          data-order-id="${escapeAttr(row.order_id)}"
          data-reference-phone="${escapeAttr(row.reference_phone ?? "")}"
        >
          Pagar
        </button>
      </div>
    `
    )
    .join("");

  unpaidTable.innerHTML = `${unpaidTableHeadHtml}${rowsHtml}`;
};

const openQrFromButton = (button) => {
  if (!(button instanceof Element)) {
    return;
  }
  const ticketId = button.getAttribute("data-ticket-id") ?? "";
  const owner = button.getAttribute("data-ticket-owner") ?? "";
  const phone = button.getAttribute("data-ticket-phone") ?? "";
  if (!ticketId) {
    return;
  }
  const open = window.TicketGenQrModal?.open ?? window.openTicketQrModal;
  if (typeof open === "function") {
    open(ticketId, owner, phone);
    return;
  }
  console.error("TicketGen: qr-modal.js no cargó correctamente.");
};

const openPayModal = (button) => {
  if (!payModal) {
    return;
  }
  const paymentId = button.dataset.paymentId;
  const ticketCode = button.dataset.ticketCode;
  if (!paymentId || !ticketCode) {
    return;
  }

  activePayment = {
    paymentId,
    orderId: button.dataset.orderId,
    ticketCode,
    referencePhone: button.dataset.referencePhone ?? "",
  };

  if (payModalTicket) {
    payModalTicket.textContent = `Boleto: ${ticketCode}`;
  }
  if (payReceiptPhone) {
    payReceiptPhone.value = activePayment.referencePhone;
  }
  if (payReceiptInput) {
    payReceiptInput.value = "";
  }
  if (payReceiptName) {
    payReceiptName.textContent = "Ningún archivo seleccionado";
  }
  if (payModalError) {
    payModalError.textContent = "";
  }
  if (payModalSuccess) {
    payModalSuccess.textContent = "";
  }

  payModal.classList.add("modal-open");
  payModal.setAttribute("aria-hidden", "false");
};

const closePayModal = () => {
  if (!payModal) {
    return;
  }
  payModal.classList.remove("modal-open");
  payModal.setAttribute("aria-hidden", "true");
  activePayment = null;
};

const handleExportQrZip = async () => {
  if (!unpaidRows.length) {
    alert("No hay boletos en pantalla para exportar.");
    return;
  }
  if (typeof JSZip === "undefined" || !window.TicketGenQrExport) {
    alert("No se pudo cargar la herramienta de exportación.");
    return;
  }

  const total = unpaidRows.length;
  if (unpaidExportZipBtn) {
    unpaidExportZipBtn.disabled = true;
  }
  if (unpaidStatus) {
    unpaidStatus.textContent = `Generando ${total} QR(s)...`;
  }

  try {
    const zip = new JSZip();
    for (let index = 0; index < unpaidRows.length; index += 1) {
      const row = unpaidRows[index];
      const ticketId = row.ticket_code;
      const dataUrl = await window.TicketGenQrExport.buildQrExportDataUrl(
        ticketId,
        ticketId,
        row.owner_name ?? "",
        row.reference_phone ?? ""
      );
      if (!dataUrl) {
        continue;
      }
      const base64 = dataUrl.split(",")[1];
      const fileName = `${safeFileName(ticketId)}-${safeFileName(row.owner_name || "sin-asignar")}.png`;
      zip.file(fileName, base64, { base64: true });

      if (unpaidStatus) {
        unpaidStatus.textContent = `Generando QR ${index + 1} de ${total}...`;
      }
    }

    if (!Object.keys(zip.files).length) {
      alert("No se generaron imágenes QR.");
      return;
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = `boletos-sin-pagar-qr-${stamp}.zip`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error(error);
    alert("No se pudo generar el archivo ZIP.");
  } finally {
    if (unpaidRows.length) {
      unpaidStatus.textContent = `${unpaidRows.length} boleto(s) sin pagar.`;
    } else {
      unpaidStatus.textContent = "No hay boletos sin pagar.";
    }
    updateExportZipButton();
  }
};

const loadUnpaidTickets = async () => {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    unpaidRows = [];
    updateExportZipButton();
    unpaidStatus.textContent = "Inicia sesión para ver boletos sin pagar.";
    renderUnpaidHead();
    return;
  }

  unpaidStatus.textContent = "Cargando boletos...";

  const { data: unpaidPayments, error: paymentsError } = await supabaseClient
    .from("payments")
    .select("id,order_id,reference_phone,status")
    .in("status", UNPAID_STATUSES);

  if (paymentsError) {
    unpaidRows = [];
    updateExportZipButton();
    unpaidStatus.textContent = "Error al cargar pagos pendientes.";
    console.error(paymentsError);
    renderUnpaidHead();
    return;
  }

  const payments = unpaidPayments ?? [];
  if (!payments.length) {
    unpaidRows = [];
    updateExportZipButton();
    unpaidStatus.textContent = "No hay boletos sin pagar.";
    renderUnpaidHead();
    return;
  }

  const payMap = paymentsByOrderId(payments);
  const orderIds = Object.keys(payMap);

  const { data: ticketRows, error: ticketsError } = await supabaseClient
    .from("tickets")
    .select("ticket_code,order_id,created_at,attendees(full_name)")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (ticketsError) {
    unpaidRows = [];
    updateExportZipButton();
    unpaidStatus.textContent = "Error al cargar boletos.";
    console.error(ticketsError);
    renderUnpaidHead();
    return;
  }

  unpaidRows = (ticketRows ?? [])
    .map((ticket) => {
      const pay = payMap[String(ticket.order_id)];
      if (!pay) {
        return null;
      }
      return {
        ticket_code: ticket.ticket_code,
        order_id: ticket.order_id,
        payment_id: pay.id,
        reference_phone: pay.reference_phone,
        owner_name: attendeeDisplayName(ticket),
      };
    })
    .filter(Boolean);

  if (!unpaidRows.length) {
    updateExportZipButton();
    unpaidStatus.textContent = "No hay boletos sin pagar.";
    renderUnpaidHead();
    return;
  }

  unpaidStatus.textContent = `${unpaidRows.length} boleto(s) sin pagar.`;
  updateExportZipButton();
  renderRows(unpaidRows);
};

const submitPayment = async () => {
  if (!activePayment?.paymentId) {
    return;
  }

  payModalError.textContent = "";
  payModalSuccess.textContent = "";

  const receiptError = validatePayReceipt();
  if (receiptError) {
    payModalError.textContent = receiptError;
    return;
  }

  const receiptFile = payReceiptInput.files[0];
  let receiptBase64 = "";
  try {
    receiptBase64 = await readReceiptAsBase64(receiptFile);
  } catch (error) {
    payModalError.textContent = "No se pudo leer el comprobante.";
    return;
  }

  confirmPayButton.disabled = true;

  const { error } = await supabaseClient
    .from("payments")
    .update({
      status: "comprobante",
      method: "transferencia",
      receipt_base64: receiptBase64,
      reference_phone: payReceiptPhone?.value.trim() || null,
    })
    .eq("id", activePayment.paymentId);

  confirmPayButton.disabled = false;

  if (error) {
    payModalError.textContent = "No se pudo registrar el pago.";
    console.error(error);
    return;
  }

  payModalSuccess.textContent = "Pago registrado correctamente.";
  setTimeout(() => {
    closePayModal();
    loadUnpaidTickets();
  }, 900);
};

confirmPayButton?.addEventListener("click", submitPayment);

payReceiptInput?.addEventListener("change", () => {
  if (!payReceiptName) {
    return;
  }
  const file = payReceiptInput.files?.[0];
  payReceiptName.textContent = file ? file.name : "Ningún archivo seleccionado";
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const qrButton = target.closest(".qr-button");
  if (qrButton) {
    event.preventDefault();
    openQrFromButton(qrButton);
    return;
  }

  const payButton = target.closest(".pay-button");
  if (payButton instanceof HTMLButtonElement) {
    openPayModal(payButton);
    return;
  }

  if (target.dataset.closePayModal === "true") {
    closePayModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && payModal?.classList.contains("modal-open")) {
    closePayModal();
  }
});

unpaidExportZipBtn?.addEventListener("click", () => {
  void handleExportQrZip();
});

loadUnpaidTickets();
