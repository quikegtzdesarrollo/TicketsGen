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
const SALE_TICKET_SELECT =
  "ticket_code,price,used,used_at,attendees(full_name,is_child)";
const memberVisitSelect =
  "id,full_name,reference_phone,inviting_church,record_type,used,used_at";

const escapeIlike = (value) =>
  String(value ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

const normalizeMemberSearchToken = (query) => {
  let token = String(query ?? "").trim().toUpperCase();
  if (token.startsWith(MEMBER_QR_PREFIX)) {
    token = token.slice(MEMBER_QR_PREFIX.length);
  } else if (token.startsWith("MV")) {
    token = token.slice(2);
  }
  return token.replace(/-/g, "");
};

const memberMatchesToken = (row, token) => {
  if (!token) {
    return false;
  }
  const displayId = formatMemberDisplayId(row.id);
  const compactId = String(row.id ?? "")
    .replace(/-/g, "")
    .toUpperCase();
  const shortCode = `${MEMBER_QR_PREFIX}${displayId}`;
  return (
    displayId.includes(token) ||
    compactId.includes(token) ||
    shortCode.includes(token) ||
    shortCode.replace(MEMBER_QR_PREFIX, "").includes(token)
  );
};

const findSaleTicketByCode = async (code) => {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const { data: exactMatch, error: exactError } = await supabaseClient
    .from("tickets")
    .select(SALE_TICKET_SELECT)
    .eq("ticket_code", trimmed)
    .maybeSingle();

  if (exactError) {
    console.error(exactError);
    return null;
  }
  if (exactMatch) {
    return exactMatch;
  }

  const pattern = `%${escapeIlike(trimmed)}%`;
  const { data: partialMatches, error: partialError } = await supabaseClient
    .from("tickets")
    .select(SALE_TICKET_SELECT)
    .ilike("ticket_code", pattern)
    .order("created_at", { ascending: false })
    .limit(5);

  if (partialError) {
    console.error(partialError);
    return null;
  }

  const rows = partialMatches ?? [];
  if (!rows.length) {
    return null;
  }
  if (rows.length === 1) {
    return rows[0];
  }

  const normalized = trimmed.toUpperCase();
  return (
    rows.find((row) => String(row.ticket_code ?? "").toUpperCase() === normalized) ??
    rows[0]
  );
};

const findMemberVisitByCode = async (code) => {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const memberId = parseMemberVisitId(trimmed);
  if (memberId) {
    const { data, error } = await supabaseClient
      .from("member_visits")
      .select(memberVisitSelect)
      .eq("id", memberId)
      .maybeSingle();
    if (error) {
      console.error(error);
      return null;
    }
    return data;
  }

  const token = normalizeMemberSearchToken(trimmed);
  if (token.length < 2) {
    return null;
  }

  const { data: rows, error } = await supabaseClient
    .from("member_visits")
    .select(memberVisitSelect)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return null;
  }

  const matches = (rows ?? []).filter((row) => memberMatchesToken(row, token));
  if (!matches.length) {
    return null;
  }
  if (matches.length === 1) {
    return matches[0];
  }

  const shortCode = trimmed.toUpperCase();
  return (
    matches.find(
      (row) => `${MEMBER_QR_PREFIX}${formatMemberDisplayId(row.id)}` === shortCode
    ) ?? matches[0]
  );
};

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

const registerMemberEntry = async (existing) => {
  if (isProcessing) {
    return false;
  }
  isProcessing = true;
  setStatus("Validando registro de miembro o visita...");

  if (!existing?.id) {
    setStatus("No se encontró el registro.", "error");
    isProcessing = false;
    return false;
  }

  const memberId = existing.id;
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
    return false;
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
    return false;
  }

  renderMemberVisitInfo(data);

  if (data.used && data.used_at) {
    setStatus(
      personName
        ? `Entrada registrada: ${personName} (${displayCode})`
        : `Registro ${displayCode} validado.`
    );
    await destroyScanner();
    isProcessing = false;
    return true;
  }

  setStatus("El registro no pudo marcarse como usado.", "error");
  isProcessing = false;
  return false;
};

const registerSaleEntry = async (existing) => {
  if (isProcessing) {
    return false;
  }
  isProcessing = true;
  setStatus("Validando boleto de venta...");

  if (!existing?.ticket_code) {
    setStatus("No se encontró el boleto.", "error");
    isProcessing = false;
    return false;
  }

  const ticketCode = existing.ticket_code;
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
    return false;
  }

  const { data, error } = await supabaseClient
    .from("tickets")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("ticket_code", ticketCode)
    .select(SALE_TICKET_SELECT)
    .single();

  if (error || !data) {
    setStatus("No se pudo actualizar el boleto.", "error");
    isProcessing = false;
    return false;
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
    isProcessing = false;
    return true;
  }

  setStatus("El boleto no pudo marcarse como usado.", "error");
  isProcessing = false;
  return false;
};

const processScan = async (decodedText) => {
  const code = decodedText.trim();
  if (!code) {
    setStatus("QR inválido.", "error");
    return;
  }
  if (isProcessing) {
    return;
  }

  isProcessing = true;
  setStatus("Buscando boleto de venta o registro de miembro/visita...");

  try {
    const preferMember = code.toUpperCase().startsWith(MEMBER_QR_PREFIX);
    const lookups = preferMember
      ? [
          { kind: "member", find: () => findMemberVisitByCode(code) },
          { kind: "sale", find: () => findSaleTicketByCode(code) },
        ]
      : [
          { kind: "sale", find: () => findSaleTicketByCode(code) },
          { kind: "member", find: () => findMemberVisitByCode(code) },
        ];

    for (const lookup of lookups) {
      const record = await lookup.find();
      if (!record) {
        continue;
      }

      isProcessing = false;
      if (lookup.kind === "member") {
        const handled = await registerMemberEntry(record);
        if (handled) {
          return;
        }
        continue;
      }

      const handled = await registerSaleEntry(record);
      if (handled) {
        return;
      }
    }

    setStatus(
      "No se encontró el boleto de venta ni el registro de miembro/visita.",
      "error"
    );
  } catch (error) {
    console.error(error);
    setStatus("Error al validar el código escaneado.", "error");
  } finally {
    isProcessing = false;
  }
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
