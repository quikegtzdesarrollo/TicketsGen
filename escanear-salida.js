const scanStatus = document.getElementById("scan-status");
const readerContainerId = "qr-reader";
const scanTicket = document.getElementById("scan-ticket");
const scanName = document.getElementById("scan-name");
const scanType = document.getElementById("scan-type");
const scanPrice = document.getElementById("scan-price");

const MEMBER_QR_PREFIX = "MV-";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let isProcessing = false;

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

const renderTicketInfo = (ticket) => {
  if (!scanTicket || !scanName || !scanType || !scanPrice) {
    return;
  }
  const name = attendeeDisplayName(ticket);
  scanTicket.textContent = ticket?.ticket_code ?? "-";
  scanName.textContent = name || "-";
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
  scanType.textContent = church ? `${recordType} · ${church}` : recordType;
  scanPrice.textContent = "-";
};

const memberVisitSelect =
  "id,full_name,reference_phone,inviting_church,record_type,used,used_at";

const markMemberVisitAsExited = async (memberId) => {
  if (isProcessing) {
    return;
  }
  isProcessing = true;
  setStatus("Registrando salida del registro...");

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

  if (!existing.used) {
    setStatus(
      personName
        ? `El registro de ${personName} ya está habilitado para ingreso.`
        : "El registro ya está habilitado para ingreso.",
      "error"
    );
    isProcessing = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from("member_visits")
    .update({ used: false, used_at: null })
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
    setStatus(`No se pudo registrar la salida.${hint}`, "error");
    isProcessing = false;
    return;
  }

  renderMemberVisitInfo(data);

  if (!data.used) {
    setStatus(
      personName
        ? `Salida registrada: ${personName} (${displayCode}) habilitado para nuevo ingreso.`
        : `Salida registrada para ${displayCode}.`
    );
  } else {
    setStatus("El registro no pudo habilitarse.", "error");
  }

  setTimeout(() => {
    isProcessing = false;
  }, 1200);
};

const markTicketAsExited = async (ticketCode) => {
  if (isProcessing) {
    return;
  }
  isProcessing = true;
  setStatus("Registrando salida...");

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

  renderTicketInfo(existing);

  if (!existing.used) {
    setStatus("El boleto ya está habilitado para ingreso.", "error");
    isProcessing = false;
    return;
  }

  const { data, error } = await supabaseClient
    .from("tickets")
    .update({ used: false, used_at: null })
    .eq("ticket_code", ticketCode)
    .select("ticket_code,price,used,used_at,attendees(full_name,is_child)")
    .single();

  if (error || !data) {
    setStatus("No se pudo registrar la salida.", "error");
    isProcessing = false;
    return;
  }

  renderTicketInfo(data);

  if (!data.used) {
    const displayName = attendeeDisplayName(data);
    setStatus(
      displayName
        ? `Salida registrada: ${displayName} (${ticketCode}) habilitado para nuevo ingreso.`
        : `Salida registrada para ${ticketCode}.`
    );
  } else {
    setStatus("El boleto no pudo habilitarse.", "error");
  }

  setTimeout(() => {
    isProcessing = false;
  }, 1200);
};

const processScan = (decodedText) => {
  const code = decodedText.trim();
  if (!code) {
    setStatus("QR inválido.", "error");
    return;
  }

  const memberId = parseMemberVisitId(code);
  if (memberId) {
    markMemberVisitAsExited(memberId);
    return;
  }

  markTicketAsExited(code);
};

const onScanSuccess = (decodedText) => {
  if (!decodedText || isProcessing) {
    return;
  }
  processScan(decodedText);
};

const onScanFailure = () => {};

const initScanner = () => {
  const reader = new Html5Qrcode(readerContainerId);
  reader
    .start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: 240, height: 240 },
      },
      onScanSuccess,
      onScanFailure
    )
    .catch(() => {
      setStatus("No se pudo acceder a la cámara.", "error");
    });
};

initScanner();
