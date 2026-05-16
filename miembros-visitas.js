const RECORD_TYPE = "Miembros o Visitas";
const BATCH_SIZE = 100;

const bulkFileInput = document.getElementById("bulk-file");
const bulkFileName = document.getElementById("bulk-file-name");
const bulkUploadButton = document.getElementById("bulk-upload");
const bulkStatus = document.getElementById("bulk-status");
const bulkErrors = document.getElementById("bulk-errors");
const bulkPreviewWrap = document.getElementById("bulk-preview-wrap");
const bulkPreviewCount = document.getElementById("bulk-preview-count");
const bulkPreviewTable = document.getElementById("bulk-preview-table");
const membersTable = document.getElementById("members-table");
const membersStatus = document.getElementById("members-status");
const membersFilterBtn = document.getElementById("members-filter-btn");
const membersExportZipBtn = document.getElementById("members-export-zip");
const churchSelect = document.getElementById("church-filter");
const phoneInput = document.querySelector("input[name='celular']");

const CHURCH_FILTER_NONE = "__none__";

let parsedRows = [];
let parseIssues = [];
let allMemberRows = [];
let filteredMemberRows = [];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const escapeAttr = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/[\r\n]+/g, " ");

const formatDisplayId = (id) => {
  if (!id) {
    return "-";
  }
  const text = String(id).replace(/-/g, "");
  return text.slice(0, 8).toUpperCase();
};

const qrPayload = (id) => `MV-${id}`;

const renderMemberModalQr = async (text) => {
  const qrContainer = document.getElementById("qr-code");
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

const openMemberQrDirect = (ticketId, owner, phone) => {
  const modalEl = document.getElementById("qr-modal");
  const ticketLabel = document.getElementById("qr-ticket-id");
  const ticketOwner = document.getElementById("qr-ticket-owner");
  const ticketPhone = document.getElementById("qr-ticket-phone");

  if (!modalEl || !ticketId) {
    return;
  }

  if (ticketLabel) {
    ticketLabel.textContent = `Registro: ${ticketId}`;
  }
  if (ticketOwner) {
    ticketOwner.textContent = owner ? `Nombre: ${owner}` : "Nombre: Sin asignar";
  }
  if (ticketPhone) {
    const phoneText = phone.trim();
    ticketPhone.textContent = phoneText ? `Celular: ${phoneText}` : "";
    ticketPhone.hidden = !phoneText;
  }

  modalEl.classList.add("modal-open");
  modalEl.setAttribute("aria-hidden", "false");
  renderMemberModalQr(ticketId);
};

const openMemberQrFromButton = (button) => {
  if (!(button instanceof Element)) {
    return;
  }

  const ticketId = button.getAttribute("data-ticket-id") ?? "";
  const owner = button.getAttribute("data-ticket-owner") ?? "";
  const phone = button.getAttribute("data-ticket-phone") ?? "";

  if (!ticketId) {
    return;
  }

  if (window.TicketGenQrModal?.open) {
    window.TicketGenQrModal.open(ticketId, owner, phone);
    return;
  }

  if (typeof window.openTicketQrModal === "function") {
    window.openTicketQrModal(ticketId, owner, phone);
    return;
  }

  openMemberQrDirect(ticketId, owner, phone);
};

window.showMemberQr = (button) => {
  openMemberQrFromButton(button);
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
    return true;
  }
  const rawDigits = digitsOnly(raw);
  if (!rawDigits.length) {
    return false;
  }
  return rawDigits.includes(qDigits);
};

const churchMatchesFilter = (storedChurch, selected) => {
  const value = selected ?? "";
  if (!value) {
    return true;
  }
  if (value === CHURCH_FILTER_NONE) {
    return !String(storedChurch ?? "").trim();
  }
  return String(storedChurch ?? "") === value;
};

const getUniqueChurches = (rows) => {
  const churches = new Set();
  let hasEmpty = false;

  for (const row of rows) {
    const church = String(row.inviting_church ?? "").trim();
    if (church) {
      churches.add(church);
    } else {
      hasEmpty = true;
    }
  }

  return {
    churches: [...churches].sort((a, b) => a.localeCompare(b, "es")),
    hasEmpty,
  };
};

const populateChurchSelect = () => {
  if (!churchSelect) {
    return;
  }

  const previous = churchSelect.value;
  const { churches, hasEmpty } = getUniqueChurches(allMemberRows);

  churchSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "Todas las iglesias";
  churchSelect.appendChild(allOption);

  if (hasEmpty) {
    const noneOption = document.createElement("option");
    noneOption.value = CHURCH_FILTER_NONE;
    noneOption.textContent = "(Sin iglesia)";
    churchSelect.appendChild(noneOption);
  }

  for (const church of churches) {
    const option = document.createElement("option");
    option.value = church;
    option.textContent = church;
    churchSelect.appendChild(option);
  }

  const validValues = [...churchSelect.options].map((option) => option.value);
  churchSelect.value = validValues.includes(previous) ? previous : "";
};

const safeFileName = (value) =>
  String(value ?? "registro")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "registro";

const updateMembersStatus = () => {
  if (!membersStatus) {
    return;
  }
  const total = allMemberRows.length;
  const shown = filteredMemberRows.length;
  if (!total) {
    membersStatus.textContent = "No hay registros guardados.";
    return;
  }
  if (shown === total) {
    membersStatus.textContent = `${total} registro(s).`;
    return;
  }
  membersStatus.textContent = `${shown} de ${total} registro(s) (filtros activos).`;
};

const updateExportZipButton = () => {
  if (!membersExportZipBtn) {
    return;
  }
  membersExportZipBtn.disabled = !filteredMemberRows.length;
};

const setBulkStatus = (message, type = "success") => {
  if (!bulkStatus) {
    return;
  }
  bulkStatus.textContent = message;
  bulkStatus.className = type === "error" ? "status status-error" : "status status-success";
};

const setParseErrors = (messages) => {
  if (!bulkErrors) {
    return;
  }
  if (!messages.length) {
    bulkErrors.textContent = "";
    bulkErrors.hidden = true;
    return;
  }
  bulkErrors.hidden = false;
  bulkErrors.textContent = messages.join(" ");
};

const parseBulkText = (text) => {
  const rows = [];
  const issues = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const parts = trimmed.split("|").map((part) => part.trim());
    const fullName = parts[0] ?? "";
    const referencePhone = parts[1] ?? "";
    const invitingChurch = parts[2] ?? "";

    if (!fullName) {
      issues.push(`Línea ${lineNumber}: falta el nombre.`);
      return;
    }

    rows.push({
      full_name: fullName,
      reference_phone: referencePhone || null,
      inviting_church: invitingChurch || null,
      record_type: RECORD_TYPE,
    });
  });

  return { rows, issues };
};

const renderPreview = (rows) => {
  if (!bulkPreviewTable || !bulkPreviewWrap || !bulkPreviewCount) {
    return;
  }

  if (!rows.length) {
    bulkPreviewWrap.hidden = true;
    bulkPreviewTable.innerHTML = "";
    return;
  }

  bulkPreviewWrap.hidden = false;
  bulkPreviewCount.textContent = `${rows.length} registro(s) listos para cargar.`;

  const body = rows
    .slice(0, 50)
    .map(
      (row) => `
      <div class="table-row">
        <span>${escapeHtml(row.full_name)}</span>
        <span>${escapeHtml(row.reference_phone ?? "-")}</span>
        <span>${escapeHtml(row.inviting_church ?? "-")}</span>
        <span>${escapeHtml(row.record_type)}</span>
      </div>
    `
    )
    .join("");

  bulkPreviewTable.innerHTML = `
    <div class="table-row table-head">
      <span>Nombre</span>
      <span>Celular</span>
      <span>Iglesia que invita</span>
      <span>Tipo</span>
    </div>
    ${body}
    ${rows.length > 50 ? `<p class="helper">Mostrando los primeros 50 de ${rows.length}.</p>` : ""}
  `;
};

const membersTableHeadHtml = `
  <div class="table-row table-head">
    <span>ID</span>
    <span>Nombre</span>
    <span>Teléfono</span>
    <span>Iglesia</span>
    <span>QR</span>
    <span>Eliminar</span>
  </div>
`;

const renderMembersHead = () => {
  if (!membersTable) {
    return;
  }
  membersTable.innerHTML = membersTableHeadHtml;
};

const renderMembersRows = (rows) => {
  if (!membersTable) {
    return;
  }

  if (!rows.length) {
    renderMembersHead();
    updateMembersStatus();
    updateExportZipButton();
    return;
  }

  const body = rows
    .map((row) => {
      const displayId = formatDisplayId(row.id);
      const qrCode = qrPayload(row.id);
      return `
      <div class="table-row">
        <span title="${escapeAttr(row.id)}">${escapeHtml(displayId)}</span>
        <span>${escapeHtml(row.full_name)}</span>
        <span>${escapeHtml(row.reference_phone ?? "-")}</span>
        <span>${escapeHtml(row.inviting_church ?? "-")}</span>
        <button
          class="qr-button"
          type="button"
          aria-label="Ver QR"
          data-ticket-id="${escapeAttr(qrCode)}"
          data-ticket-owner="${escapeAttr(row.full_name)}"
          data-ticket-phone="${escapeAttr(row.reference_phone ?? "")}"
          onclick="showMemberQr(this)"
        >
          <span aria-hidden="true">📱</span>
        </button>
        <button
          class="delete-button"
          type="button"
          data-member-id="${escapeAttr(row.id)}"
          data-member-name="${escapeAttr(row.full_name)}"
        >
          Eliminar
        </button>
      </div>
    `;
    })
    .join("");

  membersTable.innerHTML = `${membersTableHeadHtml}${body}`;
  updateMembersStatus();
  updateExportZipButton();
};

const applyMemberFilters = () => {
  const churchFilter = churchSelect?.value ?? "";
  const phoneFilter = phoneInput?.value ?? "";

  filteredMemberRows = allMemberRows.filter((row) => {
    if (!churchMatchesFilter(row.inviting_church, churchFilter)) {
      return false;
    }
    if (!phoneMatchesFilter(row.reference_phone, phoneFilter)) {
      return false;
    }
    return true;
  });

  renderMembersRows(filteredMemberRows);
};

const loadMemberVisits = async () => {
  if (membersStatus) {
    membersStatus.textContent = "Cargando registros...";
  }

  const { data, error } = await supabaseClient
    .from("member_visits")
    .select("id,full_name,reference_phone,inviting_church,record_type,created_at")
    .eq("record_type", RECORD_TYPE)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    allMemberRows = [];
    filteredMemberRows = [];
    renderMembersHead();
    if (membersStatus) {
      membersStatus.textContent = "No se pudieron cargar los registros.";
    }
    populateChurchSelect();
    updateExportZipButton();
    return;
  }

  allMemberRows = data ?? [];
  populateChurchSelect();
  applyMemberFilters();
};

const handleExportQrZip = async () => {
  if (!filteredMemberRows.length) {
    alert("No hay registros en pantalla para exportar.");
    return;
  }
  if (typeof JSZip === "undefined" || !window.TicketGenQrExport) {
    alert("No se pudo cargar la herramienta de exportación.");
    return;
  }

  const total = filteredMemberRows.length;
  if (membersExportZipBtn) {
    membersExportZipBtn.disabled = true;
  }
  if (membersStatus) {
    membersStatus.textContent = `Generando ${total} QR(s)...`;
  }

  try {
    const zip = new JSZip();
    for (let index = 0; index < filteredMemberRows.length; index += 1) {
      const row = filteredMemberRows[index];
      const ticketId = qrPayload(row.id);
      const dataUrl = await window.TicketGenQrExport.buildQrExportDataUrl(
        ticketId,
        ticketId,
        row.full_name,
        row.reference_phone ?? ""
      );
      if (!dataUrl) {
        continue;
      }
      const base64 = dataUrl.split(",")[1];
      const fileName = `${formatDisplayId(row.id)}-${safeFileName(row.full_name)}.png`;
      zip.file(fileName, base64, { base64: true });

      if (membersStatus) {
        membersStatus.textContent = `Generando QR ${index + 1} de ${total}...`;
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
    link.download = `miembros-visitas-qr-${stamp}.zip`;
    link.click();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error(error);
    alert("No se pudo generar el archivo ZIP.");
  } finally {
    updateMembersStatus();
    updateExportZipButton();
  }
};

const handleDeleteMember = async (id, name) => {
  if (!id) {
    return;
  }
  const label = name?.trim() || formatDisplayId(id);
  if (!confirm(`¿Eliminar el registro de ${label}?`)) {
    return;
  }

  const { error } = await supabaseClient.from("member_visits").delete().eq("id", id);

  if (error) {
    alert("No se pudo eliminar el registro.");
    console.error(error);
    return;
  }

  await loadMemberVisits();
};

const readSelectedFile = () =>
  new Promise((resolve, reject) => {
    const file = bulkFileInput?.files?.[0];
    if (!file) {
      reject(new Error("Selecciona un archivo."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsText(file, "UTF-8");
  });

const handleFileChange = async () => {
  parsedRows = [];
  parseIssues = [];
  setBulkStatus("");
  setParseErrors([]);

  const file = bulkFileInput?.files?.[0];
  if (!file) {
    if (bulkFileName) {
      bulkFileName.textContent = "Ningún archivo seleccionado";
    }
    if (bulkUploadButton) {
      bulkUploadButton.disabled = true;
    }
    renderPreview([]);
    return;
  }

  if (bulkFileName) {
    bulkFileName.textContent = file.name;
  }

  try {
    const text = await readSelectedFile();
    const result = parseBulkText(text);
    parsedRows = result.rows;
    parseIssues = result.issues;
    renderPreview(parsedRows);
    setParseErrors(parseIssues);

    if (!parsedRows.length) {
      setBulkStatus("No se encontraron registros válidos en el archivo.", "error");
      if (bulkUploadButton) {
        bulkUploadButton.disabled = true;
      }
      return;
    }

    setBulkStatus(`${parsedRows.length} registro(s) listos. Pulsa «Cargar registros».`);
    if (bulkUploadButton) {
      bulkUploadButton.disabled = false;
    }
  } catch (error) {
    setBulkStatus(error.message || "Error al leer el archivo.", "error");
    if (bulkUploadButton) {
      bulkUploadButton.disabled = true;
    }
    renderPreview([]);
  }
};

const insertBatches = async (rows) => {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabaseClient.from("member_visits").insert(chunk);
    if (error) {
      throw error;
    }
    inserted += chunk.length;
  }
  return inserted;
};

const handleUpload = async () => {
  if (!parsedRows.length) {
    setBulkStatus("No hay registros para cargar.", "error");
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    setBulkStatus("Inicia sesión para cargar registros.", "error");
    return;
  }

  if (bulkUploadButton) {
    bulkUploadButton.disabled = true;
  }
  setBulkStatus("Cargando registros...");
  setParseErrors(parseIssues);

  try {
    const inserted = await insertBatches(parsedRows);
    setBulkStatus(`${inserted} registro(s) guardados correctamente.`);
    parsedRows = [];
    if (bulkFileInput) {
      bulkFileInput.value = "";
    }
    if (bulkFileName) {
      bulkFileName.textContent = "Ningún archivo seleccionado";
    }
    renderPreview([]);
    await loadMemberVisits();
  } catch (error) {
    console.error(error);
    const message = String(error?.message ?? "");
    const hint =
      error?.code === "PGRST205" || message.includes("member_visits")
        ? " Ejecuta sql/member_visits.sql en Supabase."
        : message.includes("inviting_church")
          ? " Agrega la columna inviting_church (ver sql/member_visits.sql)."
          : "";
    setBulkStatus(`No se pudieron guardar los registros.${hint}`, "error");
  } finally {
    if (bulkUploadButton) {
      bulkUploadButton.disabled = !parsedRows.length;
    }
  }
};

bulkFileInput?.addEventListener("change", () => {
  handleFileChange();
});

bulkUploadButton?.addEventListener("click", () => {
  handleUpload();
});

membersTable?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const qrButton = target.closest(".qr-button");
  if (qrButton instanceof Element && membersTable.contains(qrButton)) {
    event.preventDefault();
    openMemberQrFromButton(qrButton);
    return;
  }

  const deleteButton = target.closest(".delete-button");
  if (deleteButton instanceof HTMLButtonElement) {
    handleDeleteMember(deleteButton.dataset.memberId, deleteButton.dataset.memberName);
  }
});

membersFilterBtn?.addEventListener("click", () => {
  applyMemberFilters();
});

churchSelect?.addEventListener("change", () => {
  applyMemberFilters();
});

document.getElementById("members-filters")?.addEventListener("submit", (event) => {
  event.preventDefault();
  applyMemberFilters();
});

membersExportZipBtn?.addEventListener("click", () => {
  handleExportQrZip();
});

loadMemberVisits();
