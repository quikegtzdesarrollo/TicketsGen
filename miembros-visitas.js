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

let parsedRows = [];
let parseIssues = [];

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
    .replace(/</g, "&lt;");

const formatDisplayId = (id) => {
  if (!id) {
    return "-";
  }
  const text = String(id).replace(/-/g, "");
  return text.slice(0, 8).toUpperCase();
};

const qrPayload = (id) => `MV-${id}`;

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

const renderMembersHead = () => {
  if (!membersTable) {
    return;
  }
  membersTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID</span>
      <span>Nombre</span>
      <span>Teléfono</span>
      <span>QR</span>
      <span>Eliminar</span>
    </div>
  `;
};

const renderMembersRows = (rows) => {
  if (!membersTable) {
    return;
  }

  if (!rows.length) {
    renderMembersHead();
    if (membersStatus) {
      membersStatus.textContent = "No hay registros guardados.";
    }
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
        <button
          class="qr-button"
          type="button"
          aria-label="Ver QR"
          data-ticket-id="${escapeAttr(qrCode)}"
          data-ticket-owner="${escapeAttr(row.full_name)}"
          data-ticket-phone="${escapeAttr(row.reference_phone ?? "")}"
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

  membersTable.innerHTML = `
    <div class="table-row table-head">
      <span>ID</span>
      <span>Nombre</span>
      <span>Teléfono</span>
      <span>QR</span>
      <span>Eliminar</span>
    </div>
    ${body}
  `;

  if (membersStatus) {
    membersStatus.textContent = `${rows.length} registro(s).`;
  }
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
    renderMembersHead();
    if (membersStatus) {
      membersStatus.textContent = "No se pudieron cargar los registros.";
    }
    return;
  }

  renderMembersRows(data ?? []);
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
  const deleteButton = target.closest(".delete-button");
  if (deleteButton instanceof HTMLButtonElement) {
    handleDeleteMember(deleteButton.dataset.memberId, deleteButton.dataset.memberName);
  }
});

loadMemberVisits();
