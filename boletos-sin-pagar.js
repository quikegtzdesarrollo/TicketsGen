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

const UNPAID_STATUSES = ["no_pagado"];

let activePayment = null;

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
  unpaidTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID del boleto</span>
      <span>Celular</span>
      <span>Pagar</span>
    </div>
  `;
};

const renderRows = (rows) => {
  const rowsHtml = rows
    .map(
      (row) => `
      <div class="table-row">
        <span>${row.ticket_code}</span>
        <span>${row.reference_phone ?? "-"}</span>
        <button
          class="primary-link button pay-button"
          type="button"
          data-ticket-code="${row.ticket_code}"
          data-payment-id="${row.payment_id}"
          data-order-id="${row.order_id}"
          data-reference-phone="${row.reference_phone ?? ""}"
        >
          Pagar
        </button>
      </div>
    `
    )
    .join("");

  unpaidTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID del boleto</span>
      <span>Celular</span>
      <span>Pagar</span>
    </div>
    ${rowsHtml}
  `;
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

const loadUnpaidTickets = async () => {
  const currentUser = getCurrentUser();
  if (!currentUser) {
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
    unpaidStatus.textContent = "Error al cargar pagos pendientes.";
    console.error(paymentsError);
    renderUnpaidHead();
    return;
  }

  const payments = unpaidPayments ?? [];
  if (!payments.length) {
    unpaidStatus.textContent = "No hay boletos sin pagar.";
    renderUnpaidHead();
    return;
  }

  const payMap = paymentsByOrderId(payments);
  const orderIds = Object.keys(payMap);

  const { data: ticketRows, error: ticketsError } = await supabaseClient
    .from("tickets")
    .select("ticket_code,order_id,created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: false });

  if (ticketsError) {
    unpaidStatus.textContent = "Error al cargar boletos.";
    console.error(ticketsError);
    renderUnpaidHead();
    return;
  }

  const rows = (ticketRows ?? [])
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
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    unpaidStatus.textContent = "No hay boletos sin pagar.";
    renderUnpaidHead();
    return;
  }

  unpaidStatus.textContent = "";
  renderRows(rows);
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

loadUnpaidTickets();
