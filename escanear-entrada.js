const scanStatus = document.getElementById("scan-status");
const readerContainerId = "qr-reader";
const scanTicket = document.getElementById("scan-ticket");
const scanName = document.getElementById("scan-name");
const scanType = document.getElementById("scan-type");
const scanPrice = document.getElementById("scan-price");
const scanPersonName = document.getElementById("scan-person-name");
const scanAnotherButton = document.getElementById("scan-another");

const MEMBER_QR_PREFIX = "MV-";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let isProcessing = false;
let qrReader = null;
let scannerRunning = false;

const CAMERA_RELEASE_MS = 350;

const setStatus = (message, type = "success") => {
  if (!scanStatus) {
    return;
  }
  scanStatus.textContent = message;
  scanStatus.className = type === "error" ? "status status-error" : "status status-success";
};

const formatMemberDisplayId = (id) => {
  if (!id) {
    return "-";
  }
  const text = String(id).replace(/-/g, "");
  return text.slice(0, 8).toUpperCase();
};

const parseMemberVisitId = (code) => {
  const trimmed = String(code ?? "").trim();
  if (!trimmed.toUpperCase().startsWith(MEMBER_QR_PREFIX)) {
    return null;
  }
  const memberId = trimmed.slice(MEMBER_QR_PREFIX.length).trim();
  if (!UUID_PATTERN.test(memberId)) {
    return null;
  }
  return memberId;
};

const attendeeDisplayName = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return attendees[0]?.full_name?.trim() || "";
  }
  return attendees?.full_name?.trim() || "";
};

const setPersonNameDisplay = (name) => {
  const label = name?.trim() || "";
  if (!scanPersonName) {
    return;
  }
  if (label) {
    scanPersonName.textContent = label;
    scanPersonName.hidden = false;
  } else {
    scanPersonName.textContent = "";
    scanPersonName.hidden = true;
  }
};

const renderTicketInfo = (ticket) => {
  if (!scanTicket || !scanName || !scanType || !scanPrice) {
    return;
  }
  const name = attendeeDisplayName(ticket);
  scanTicket.textContent = ticket?.ticket_code ?? "-";
  scanName.textContent = name || "-";
  setPersonNameDisplay(name);
  const attendees = Array.isArray(ticket?.attendees)
    ? ticket.attendees[0]
    : ticket?.attendees;
  if (attendees) {
    scanType.textContent = attendees.is_child ? "Niño" : "Adulto";
  } else {
    scanType.textContent = "-";
  }
  scanPrice.textContent =
    ticket?.price !== undefined && ticket?.price !== null
      ? `$${Number(ticket.price).toFixed(2)}`
      : "-";
};

const renderMemberVisitInfo = (member) => {
  if (!scanTicket || !scanName || !scanType || !scanPrice) {
    return;
  }

  const name = member?.full_name?.trim() || "";
  const church = member?.inviting_church?.trim() || "";
  const recordType = member?.record_type?.trim() || "Miembros o Visitas";

  scanTicket.textContent = member?.id
    ? `${MEMBER_QR_PREFIX}${formatMemberDisplayId(member.id)}`
    : "-";
  scanName.textContent = name || "-";
  setPersonNameDisplay(name);
  scanType.textContent = church ? `${recordType} · ${church}` : recordType;
  scanPrice.textContent = "-";
};

const clearScanResult = () => {
  if (scanTicket) {
    scanTicket.textContent = "";
  }
  if (scanName) {
    scanName.textContent = "";
  }
  if (scanType) {
    scanType.textContent = "";
  }
  if (scanPrice) {
    scanPrice.textContent = "";
  }
  setPersonNameDisplay("");
};

const destroyScanner = async () => {
  if (!qrReader) {
    scannerRunning = false;
    return;
  }
  try {
    if (scannerRunning) {
      await qrReader.stop();
    }
  } catch (error) {
    // ignore stop errors
  }
  try {
    qrReader.clear();
  } catch (error) {
    // ignore clear errors
  }
  qrReader = null;
  scannerRunning = false;
};

const startScanner = async () => {
  if (scannerRunning) {
    return true;
  }
  const container = document.getElementById(readerContainerId);
  if (!container) {
    return false;
  }
  qrReader = new Html5Qrcode(readerContainerId);
  try {
    await qrReader.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
      },
      onScanSuccess,
      onScanFailure
    );
    scannerRunning = true;
    return true;
  } catch (error) {
    console.error(error);
    await destroyScanner();
    setStatus("No se pudo acceder a la cámara.", "error");
    return false;
  }
};

const restartScanner = async () => {
  await destroyScanner();
  await new Promise((resolve) => setTimeout(resolve, CAMERA_RELEASE_MS));
  return startScanner();
};

const resetForAnotherEntry = async () => {
  if (scanAnotherButton) {
    scanAnotherButton.disabled = true;
  }
  isProcessing = false;
  clearScanResult();
  setStatus("Reactivando cámara...");
  const started = await restartScanner();
  if (started) {
    setStatus("Enfoca el QR del boleto o del registro de miembro/visita.");
  }
  if (scanAnotherButton) {
    scanAnotherButton.disabled = false;
  }
};

const memberVisitSelect =
  "id,full_name,reference_phone,inviting_church,record_type,used,used_at";

const markMemberVisitAsUsed = async (memberId) => {
  if (isProcessing) {
    return;
  }
  isProcessing = true;
  setStatus("Validando registro de miembro o visita...");

  const { data: existing, error: existingError } = await supabaseClient
    .from("member_visits")
    .select(memberVisitSelect)
    .eq("id", memberId)
    .single();

  if (existingError || !existing) {
    const message = String(existingError?.message ?? "");
    const hint =
      message.includes("used") || existingError?.code === "42703"
        ? " Ejecuta sql/member_visits.sql en Supabase (columnas used y used_at)."
        : "";
    setStatus(`No se encontró el registro.${hint}`, "error");
    isProcessing = false;
    return;
  }

  const personName = existing.full_name?.trim() || "";
  const displayCode = `${MEMBER_QR_PREFIX}${formatMemberDisplayId(memberId)}`;
  renderMemberVisitInfo(existing);

  if (existing.used) {
    setStatus(
      personName
        ? `Este registro ya fue utilizado (${personName}).`
        : "Este registro ya fue utilizado.",
      "error"
    );
    isProcessing = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from("member_visits")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("id", memberId)
    .select(memberVisitSelect)
    .single();

  if (error || !data) {
    console.error(error);
    const message = String(error?.message ?? "");
    const hint =
      message.includes("used") || error?.code === "42703"
        ? " Ejecuta sql/member_visits.sql en Supabase."
        : message.includes("policy")
          ? " Falta la política member_visits_update_anon en Supabase."
          : "";
    setStatus(`No se pudo actualizar el registro.${hint}`, "error");
    isProcessing = false;
    return;
  }

  renderMemberVisitInfo(data);

  if (data.used && data.used_at) {
    setStatus(
      personName
        ? `Entrada registrada: ${personName} (${displayCode})`
        : `Registro ${displayCode} validado.`
    );
    await destroyScanner();
  } else {
    setStatus("El registro no pudo marcarse como usado.", "error");
  }

  isProcessing = false;
};

const markTicketAsUsed = async (ticketCode) => {
  if (isProcessing) {
    return;
  }
  isProcessing = true;
  setStatus("Validando boleto...");

  const { data: existing, error: existingError } = await supabaseClient
    .from("tickets")
    .select("ticket_code,price,used,used_at,attendees(full_name,is_child)")
    .eq("ticket_code", ticketCode)
    .single();

  if (existingError || !existing) {
    setStatus("No se encontró el boleto.", "error");
    isProcessing = false;
    return;
  }

  const personName = attendeeDisplayName(existing);
  renderTicketInfo(existing);

  if (existing.used) {
    setStatus(
      personName
        ? `Este boleto ya fue utilizado (${personName}).`
        : "Este boleto ya fue utilizado.",
      "error"
    );
    isProcessing = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from("tickets")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("ticket_code", ticketCode)
    .select("ticket_code,price,used,used_at,attendees(full_name,is_child)")
    .single();

  if (error || !data) {
    setStatus("No se pudo actualizar el boleto.", "error");
    isProcessing = false;
    return;
  }

  renderTicketInfo({ ...data, attendees: data.attendees ?? existing.attendees });

  if (data.used && data.used_at) {
    const displayName = attendeeDisplayName(data) || personName;
    setStatus(
      displayName
        ? `Entrada registrada: ${displayName} (${ticketCode})`
        : `Boleto ${ticketCode} validado.`
    );
    await destroyScanner();
  } else {
    setStatus("El boleto no pudo marcarse como usado.", "error");
  }

  isProcessing = false;
};

const processScan = (decodedText) => {
  const code = decodedText.trim();
  if (!code) {
    setStatus("QR inválido.", "error");
    return;
  }

  const memberId = parseMemberVisitId(code);
  if (memberId) {
    markMemberVisitAsUsed(memberId);
    return;
  }

  markTicketAsUsed(code);
};

const onScanSuccess = (decodedText) => {
  if (!decodedText || isProcessing) {
    return;
  }
  processScan(decodedText);
};

const onScanFailure = () => {};

scanAnotherButton?.addEventListener("click", () => {
  resetForAnotherEntry();
});

startScanner().then((started) => {
  if (started) {
    setStatus("Enfoca el QR del boleto o del registro de miembro/visita.");
  }
});
