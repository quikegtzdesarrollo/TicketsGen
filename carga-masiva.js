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

let parsedRows = [];
let parseIssues = [];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const setStatus = (message, type = "success") => {
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

    if (!fullName) {
      issues.push(`Línea ${lineNumber}: falta el nombre.`);
      return;
    }

    rows.push({
      full_name: fullName,
      reference_phone: referencePhone || null,
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
        <span>${escapeHtml(row.record_type)}</span>
      </div>
    `
    )
    .join("");

  const more =
    rows.length > 50
      ? `<p class="helper">Mostrando los primeros 50 de ${rows.length} registros.</p>`
      : "";

  bulkPreviewTable.innerHTML = `
    <div class="table-row table-head">
      <span>Nombre</span>
      <span>Celular</span>
      <span>Tipo</span>
    </div>
    ${body}
    ${more}
  `;
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
  setStatus("");
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
      setStatus("No se encontraron registros válidos en el archivo.", "error");
      if (bulkUploadButton) {
        bulkUploadButton.disabled = true;
      }
      return;
    }

    setStatus(`${parsedRows.length} registro(s) listos. Pulsa «Cargar registros».`);
    if (bulkUploadButton) {
      bulkUploadButton.disabled = false;
    }
  } catch (error) {
    setStatus(error.message || "Error al leer el archivo.", "error");
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
    setStatus("No hay registros para cargar.", "error");
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    setStatus("Inicia sesión para cargar registros.", "error");
    return;
  }

  if (bulkUploadButton) {
    bulkUploadButton.disabled = true;
  }
  setStatus("Cargando registros...");
  setParseErrors(parseIssues);

  try {
    const inserted = await insertBatches(parsedRows);
    setStatus(`${inserted} registro(s) guardados como «${RECORD_TYPE}».`);
    parsedRows = [];
    if (bulkFileInput) {
      bulkFileInput.value = "";
    }
    if (bulkFileName) {
      bulkFileName.textContent = "Ningún archivo seleccionado";
    }
    renderPreview([]);
  } catch (error) {
    console.error(error);
    const hint =
      error?.code === "PGRST205" || String(error?.message ?? "").includes("member_visits")
        ? " Crea la tabla member_visits en Supabase (archivo sql/member_visits.sql)."
        : "";
    setStatus(`No se pudieron guardar los registros.${hint}`, "error");
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
