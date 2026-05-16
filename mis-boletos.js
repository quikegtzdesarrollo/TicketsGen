const ticketsTable = document.getElementById("tickets-table");
const ticketsStatus = document.getElementById("tickets-status");
const ticketsTotalCount = document.getElementById("tickets-total-count");
const ticketsShownCount = document.getElementById("tickets-shown-count");
const ticketsSummaryDetail = document.getElementById("tickets-summary-detail");
const filterButton = document.querySelector(".filters .button");

let allTickets = [];
const receiptModal = document.getElementById("receipt-modal");
const receiptImage = document.getElementById("receipt-image");
const receiptLink = document.getElementById("receipt-link");

/** Una fila por order_id (prioriza payment con reference_phone). */
const paymentsByOrderId = (paymentRows) => {
  const map = {};
  for (const row of paymentRows ?? []) {
    const oid = row?.order_id;
    if (oid == null) {
      continue;
    }
    const key = String(oid);
    const prev = map[key];
    if (!prev) {
      map[key] = row;
      continue;
    }
    const prevPhone = String(prev.reference_phone ?? "").trim();
    const nextPhone = String(row.reference_phone ?? "").trim();
    if (!prevPhone && nextPhone) {
      map[key] = row;
    }
  }
  return map;
};

const digitsOnly = (value) => String(value ?? "").replace(/\D/g, "");

const escapeAttr = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const phoneMatchesFilter = (storedPhone, query) => {
  const q = query.trim();
  if (!q) {
    return true;
  }
  const raw = storedPhone ?? "";
  if (raw.includes(q)) {
    return true;
  }
  const qDigits = digitsOnly(q);
  if (!qDigits.length) {
    return true;
  }
  const rawDigits = digitsOnly(raw);
  if (!rawDigits.length) {
    return false;
  }
  return rawDigits.includes(qDigits);
};

const updateTicketsSummary = (shown, total) => {
  if (ticketsTotalCount) {
    ticketsTotalCount.textContent = String(total);
  }
  if (ticketsShownCount) {
    ticketsShownCount.textContent = String(shown);
  }
  if (!ticketsSummaryDetail) {
    return;
  }
  if (total === 0) {
    ticketsSummaryDetail.textContent = "No hay boletos de venta registrados.";
    return;
  }
  if (shown === total) {
    ticketsSummaryDetail.textContent =
      "Todos los boletos de venta coinciden con los filtros actuales.";
    return;
  }
  ticketsSummaryDetail.textContent = `${shown} de ${total} boleto(s) de venta con los filtros aplicados.`;
};

const renderRows = (tickets) => {
  const rowsHtml = tickets
    .map(
      (ticket) => `
      <div class="table-row">
        <span>${ticket.ticket_code}</span>
        <span>${ticket.attendees?.full_name ?? "Sin asignar"}</span>
        <span>${ticket.reference_phone ?? "-"}</span>
        <button
          class="qr-button"
          type="button"
          aria-label="Abrir QR"
          data-ticket-id="${escapeAttr(ticket.ticket_code)}"
          data-ticket-owner="${escapeAttr(ticket.attendees?.full_name ?? "")}"
          data-ticket-phone="${escapeAttr(ticket.reference_phone ?? "")}"
        >
          <span aria-hidden="true">📱</span>
        </button>
        ${
          ticket.receipt_base64
            ? `<button class="receipt-button" type="button" data-receipt-url="${ticket.receipt_base64}">
                Ver
              </button>`
            : `<span class="helper">Sin comprobante</span>`
        }
        <button class="delete-button" type="button" data-ticket-id="${ticket.ticket_code}">
          Eliminar
        </button>
      </div>
    `
    )
    .join("");

  ticketsTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID del boleto</span>
      <span>Asignado a</span>
      <span>Celular</span>
      <span>QR</span>
      <span>Comprobante</span>
      <span>Eliminar</span>
    </div>
    ${rowsHtml}
  `;
};

const applyClientFilter = (tickets) => {
  const startInput = document.querySelector("input[name='fecha_inicio']");
  const endInput = document.querySelector("input[name='fecha_fin']");
  const phoneInput = document.querySelector("input[name='celular']");
  const startDate = startInput?.value ? new Date(startInput.value) : null;
  const endDate = endInput?.value ? new Date(endInput.value) : null;
  const phoneFilter = phoneInput?.value.trim() ?? "";

  return tickets.filter((ticket) => {
    if (startDate || endDate) {
      const createdAt = ticket.created_at ? new Date(ticket.created_at) : null;
      if (createdAt) {
        if (startDate && createdAt < startDate) {
          return false;
        }
        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (createdAt > endOfDay) {
            return false;
          }
        }
      }
    }

    return phoneMatchesFilter(ticket.reference_phone, phoneFilter);
  });
};

const loadTickets = async () => {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    allTickets = [];
    updateTicketsSummary(0, 0);
    ticketsStatus.textContent = "Inicia sesión para ver los boletos de venta.";
    return;
  }

  ticketsStatus.textContent = "Cargando boletos de venta...";
  if (ticketsSummaryDetail) {
    ticketsSummaryDetail.textContent = "Cargando...";
  }

  const { data: ticketRows, error } = await supabaseClient
    .from("tickets")
    .select("ticket_code,created_at,order_id,attendees(full_name,is_child)")
    .order("created_at", { ascending: false });

  if (error) {
    allTickets = [];
    updateTicketsSummary(0, 0);
    ticketsStatus.textContent = "Error al cargar boletos de venta.";
    if (ticketsSummaryDetail) {
      ticketsSummaryDetail.textContent = "No se pudo cargar el resumen.";
    }
    console.error(error);
    return;
  }

  const rows = ticketRows ?? [];

  const orderIds = [
    ...new Set(rows.map((t) => t.order_id).filter((id) => id != null)),
  ];

  let payMap = {};
  if (orderIds.length > 0) {
    const { data: paymentRows, error: paymentsError } = await supabaseClient
      .from("payments")
      .select("order_id,reference_phone,receipt_base64")
      .in("order_id", orderIds);

    if (paymentsError) {
      console.error(paymentsError);
    } else {
      payMap = paymentsByOrderId(paymentRows);
    }
  }

  allTickets = rows.map((ticket) => {
    const oid = ticket.order_id;
    const pay = oid != null ? payMap[String(oid)] : undefined;
    return {
      ...ticket,
      receipt_base64: pay?.receipt_base64 ?? null,
      reference_phone: pay?.reference_phone ?? null,
    };
  });
  const filtered = applyClientFilter(allTickets);
  updateTicketsSummary(filtered.length, allTickets.length);

  if (!filtered.length) {
    ticketsStatus.textContent =
      allTickets.length > 0
        ? "Ningún boleto de venta coincide con los filtros. Vacía fechas y Celular o pulsa «Aplicar filtros» tras limpiar."
        : "No hay boletos de venta para mostrar.";
    ticketsTable.innerHTML = `
      <div class="table-row table-head">
        <span>ID del boleto</span>
        <span>Asignado a</span>
        <span>Celular</span>
        <span>QR</span>
        <span>Comprobante</span>
        <span>Eliminar</span>
      </div>
    `;
    return;
  }

  ticketsStatus.textContent = "";
  renderRows(filtered);
};

filterButton?.addEventListener("click", () => {
  loadTickets();
});

loadTickets();

const openReceiptModal = (url) => {
  if (!receiptModal || !receiptImage || !receiptLink) {
    return;
  }
  receiptImage.src = url;
  receiptLink.href = url;
  receiptModal.classList.add("modal-open");
  receiptModal.setAttribute("aria-hidden", "false");
};

const closeReceiptModal = () => {
  if (!receiptModal) {
    return;
  }
  receiptModal.classList.remove("modal-open");
  receiptModal.setAttribute("aria-hidden", "true");
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
  const receiptButton = target.closest(".receipt-button");
  if (receiptButton) {
    const url = receiptButton.dataset.receiptUrl;
    if (url) {
      openReceiptModal(url);
    }
    return;
  }
  const deleteButton = target.closest(".delete-button");
  if (deleteButton) {
    const ticketId = deleteButton.dataset.ticketId;
    if (ticketId) {
      handleDeleteTicket(ticketId);
    }
    return;
  }
  if (target.dataset.closeReceipt === "true") {
    closeReceiptModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && receiptModal?.classList.contains("modal-open")) {
    closeReceiptModal();
  }
});

const cleanupOrderIfEmpty = async (orderId) => {
  if (orderId == null) {
    return;
  }

  const { count, error: countError } = await supabaseClient
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("order_id", orderId);

  if (countError || (count ?? 0) > 0) {
    return;
  }

  await supabaseClient.from("payments").delete().eq("order_id", orderId);
  await supabaseClient.from("orders").delete().eq("id", orderId);
};

const handleDeleteTicket = async (ticketCode) => {
  if (!confirm(`¿Eliminar el boleto ${ticketCode}?`)) {
    return;
  }

  const { data: ticket, error: fetchError } = await supabaseClient
    .from("tickets")
    .select("ticket_code,order_id,attendee_id")
    .eq("ticket_code", ticketCode)
    .maybeSingle();

  if (fetchError || !ticket) {
    alert("No se encontró el boleto.");
    return;
  }

  const { error } = await supabaseClient
    .from("tickets")
    .delete()
    .eq("ticket_code", ticketCode);

  if (error) {
    alert("No se pudo eliminar el boleto.");
    return;
  }

  if (ticket.attendee_id) {
    await supabaseClient.from("attendees").delete().eq("id", ticket.attendee_id);
  }

  await cleanupOrderIfEmpty(ticket.order_id);
  loadTickets();
};
