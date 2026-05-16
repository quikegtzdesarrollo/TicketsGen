const ticketsTable = document.getElementById("tickets-table");
const ticketsStatus = document.getElementById("tickets-status");
const filterButton = document.querySelector(".filters .button");
const receiptModal = document.getElementById("receipt-modal");
const receiptImage = document.getElementById("receipt-image");
const receiptLink = document.getElementById("receipt-link");

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
    return false;
  }
  return digitsOnly(raw).includes(qDigits);
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
          data-ticket-id="${ticket.ticket_code}"
          data-ticket-owner="${ticket.attendees?.full_name ?? ""}"
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
    ticketsStatus.textContent = "Inicia sesión para ver tus boletos.";
    return;
  }

  ticketsStatus.textContent = "Cargando boletos...";
  const { data: dbUser, error: userError } = await ensureUserInDb(currentUser);
  if (!dbUser?.id) {
    ticketsStatus.textContent = `No se pudo validar el usuario. ${userError ?? ""}`.trim();
    return;
  }

  const { data: userOrders, error: ordersLookupError } = await supabaseClient
    .from("orders")
    .select("id")
    .eq("user_id", dbUser.id);

  if (ordersLookupError) {
    ticketsStatus.textContent = "Error al cargar boletos.";
    console.error(ordersLookupError);
    return;
  }

  const orderIdsForUser = (userOrders ?? []).map((o) => o.id).filter((id) => id != null);

  if (!orderIdsForUser.length) {
    ticketsStatus.textContent = "No hay boletos para mostrar.";
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

  const { data: ticketRows, error } = await supabaseClient
    .from("tickets")
    .select("ticket_code,created_at,order_id,attendees(full_name,is_child)")
    .in("order_id", orderIdsForUser)
    .order("created_at", { ascending: false });

  if (error) {
    ticketsStatus.textContent = "Error al cargar boletos.";
    console.error(error);
    return;
  }

  const orderIds = [
    ...new Set((ticketRows ?? []).map((t) => t.order_id).filter((id) => id != null)),
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

  const normalized = (ticketRows ?? []).map((ticket) => {
    const oid = ticket.order_id;
    const pay = oid != null ? payMap[String(oid)] : undefined;
    return {
      ...ticket,
      receipt_base64: pay?.receipt_base64 ?? null,
      reference_phone: pay?.reference_phone ?? null,
    };
  });
  const filtered = applyClientFilter(normalized);
  if (!filtered.length) {
    ticketsStatus.textContent = "No hay boletos para mostrar.";
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

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
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

const handleDeleteTicket = async (ticketCode) => {
  if (!confirm(`¿Eliminar el boleto ${ticketCode}?`)) {
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
  loadTickets();
};
