const list = document.getElementById("ticket-list");
const addButton = document.getElementById("add-person");
const openSummaryButton = document.getElementById("open-summary");
const summaryModal = document.getElementById("summary-modal");
const summaryTable = document.getElementById("summary-table");
const summaryTotal = document.getElementById("summary-total");
const confirmButton = document.getElementById("confirm-purchase");
const receiptInput = document.getElementById("receipt-file");
const receiptName = document.getElementById("receipt-name");
const receiptPhone = document.getElementById("receipt-phone");
const errorMessage = document.getElementById("payment-error");
const successMessage = document.getElementById("payment-success");

const CHILD_PRICE = 30;
const ADULT_PRICE = 100;
let summaryData = [];
let summaryTotalAmount = 0;

const createRow = () => {
  const row = document.createElement("div");
  row.className = "ticket-row";
  row.innerHTML = `
    <label class="field">
      Nombre completo
      <input type="text" name="nombre" placeholder="Ej: Andrea López" />
    </label>
    <label class="checkbox-field">
      <input type="checkbox" name="menor" />
      Menor de 13 años
    </label>
    <button class="icon-button remove-person" type="button">🗑</button>
  `;
  return row;
};

const updateRemoveHandlers = () => {
  list.querySelectorAll(".remove-person").forEach((button) => {
    button.onclick = () => {
      if (list.children.length > 1) {
        button.closest(".ticket-row")?.remove();
      }
    };
  });
};

const openModal = () => {
  summaryModal.classList.add("modal-open");
  summaryModal.setAttribute("aria-hidden", "false");
  errorMessage.textContent = "";
  successMessage.textContent = "";
};

const closeModal = () => {
  summaryModal.classList.remove("modal-open");
  summaryModal.setAttribute("aria-hidden", "true");
};

const validateReceipt = () => {
  const file = receiptInput?.files?.[0];
  if (!file) {
    return "Adjunta el comprobante de pago.";
  }
  if (!["image/jpeg", "image/png"].includes(file.type)) {
    return "El comprobante debe ser una imagen JPG o PNG.";
  }
  return "";
};

const readReceiptAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el comprobante."));
    reader.readAsDataURL(file);
  });

const generateTicketCode = (index) => {
  const stamp = Date.now().toString().slice(-6);
  return `TG-${stamp}-${index + 1}`;
};

const buildSummary = () => {
  const rows = Array.from(list.querySelectorAll(".ticket-row"));
  summaryData = rows.map((row, index) => {
    const nameInput = row.querySelector("input[name='nombre']");
    const isChild = row.querySelector("input[name='menor']")?.checked;
    const name = nameInput?.value.trim() || `Invitado ${index + 1}`;
    const classification = isChild ? "Niño" : "Adulto";
    const price = isChild ? CHILD_PRICE : ADULT_PRICE;
    const ticketId = generateTicketCode(index);
    return { name, classification, price, ticketId, isChild: !!isChild };
  });

  summaryTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID</span>
      <span>Nombre</span>
      <span>Clasificación</span>
      <span>Precio</span>
    </div>
    ${summaryData
      .map(
        (item) => `
      <div class="table-row">
        <span>${item.ticketId}</span>
        <span>${item.name}</span>
        <span>${item.classification}</span>
        <span>$${item.price}</span>
      </div>
    `
      )
      .join("")}
  `;

  summaryTotalAmount = summaryData.reduce((sum, item) => sum + item.price, 0);
  summaryTotal.textContent = `Total a pagar: $${summaryTotalAmount}`;
};

addButton.addEventListener("click", () => {
  list.appendChild(createRow());
  updateRemoveHandlers();
});

openSummaryButton.addEventListener("click", () => {
  buildSummary();
  openModal();
});

const processPurchase = async () => {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    errorMessage.textContent = "Inicia sesión para completar la compra.";
    return;
  }

  if (!summaryData.length) {
    errorMessage.textContent = "Agrega al menos una persona.";
    return;
  }

  const { data: dbUser, error: userError } = await ensureUserInDb(currentUser);
  if (!dbUser?.id) {
    errorMessage.textContent = `No se pudo validar el usuario. ${userError ?? ""}`.trim();
    return;
  }

  const receiptFile = receiptInput?.files?.[0];
  if (!receiptFile) {
    errorMessage.textContent = "Adjunta el comprobante de pago.";
    return;
  }

  let receiptBase64 = "";
  try {
    receiptBase64 = await readReceiptAsBase64(receiptFile);
  } catch (error) {
    errorMessage.textContent = "No se pudo leer el comprobante.";
    return;
  }

  const { data: order, error: orderError } = await supabaseClient
    .from("orders")
    .insert({
      user_id: dbUser.id,
      total_amount: summaryTotalAmount,
      currency: "MXN",
    })
    .select()
    .single();

  if (orderError || !order) {
    errorMessage.textContent = "No se pudo crear la orden.";
    return;
  }

  const attendeesPayload = summaryData.map((item) => ({
    full_name: item.name,
    is_child: item.isChild,
  }));

  const { data: attendees, error: attendeesError } = await supabaseClient
    .from("attendees")
    .insert(attendeesPayload)
    .select();

  if (attendeesError || !attendees?.length) {
    errorMessage.textContent = "No se pudieron registrar los asistentes.";
    return;
  }

  const ticketsPayload = summaryData.map((item, index) => ({
    order_id: order.id,
    attendee_id: attendees[index]?.id,
    ticket_code: item.ticketId,
    price: item.price,
  }));

  const { error: ticketsError } = await supabaseClient
    .from("tickets")
    .insert(ticketsPayload);

  if (ticketsError) {
    errorMessage.textContent = "No se pudieron generar los boletos.";
    return;
  }

  const { error: paymentError } = await supabaseClient.from("payments").insert({
    order_id: order.id,
    amount: summaryTotalAmount,
    currency: "MXN",
    status: "comprobante",
    method: "transferencia",
    receipt_base64: receiptBase64,
    reference_phone: receiptPhone?.value.trim() || null,
  });

  if (paymentError) {
    errorMessage.textContent = "La orden se creó, pero falló el pago.";
    return;
  }

  successMessage.textContent = "Boletos generados. Recibirás la confirmación pronto.";
};

confirmButton.addEventListener("click", async () => {
  errorMessage.textContent = "";
  successMessage.textContent = "";
  const receiptError = validateReceipt();
  if (receiptError) {
    errorMessage.textContent = receiptError;
    return;
  }

  confirmButton.disabled = true;
  await processPurchase();
  confirmButton.disabled = false;

  if (successMessage.textContent) {
    const inputs = summaryModal.querySelectorAll("input");
    inputs.forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.value = "";
      }
    });
    if (receiptName) {
      receiptName.textContent = "Ningún archivo seleccionado";
    }
    if (receiptPhone) {
      receiptPhone.value = "";
    }
    setTimeout(() => {
      closeModal();
      window.location.href = "mis-boletos.html";
    }, 1200);
  }
});

summaryModal.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.dataset.closeModal === "true") {
    closeModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && summaryModal.classList.contains("modal-open")) {
    closeModal();
  }
});

updateRemoveHandlers();

receiptInput?.addEventListener("change", () => {
  if (!receiptName) {
    return;
  }
  const file = receiptInput.files?.[0];
  receiptName.textContent = file ? file.name : "Ningún archivo seleccionado";
});
