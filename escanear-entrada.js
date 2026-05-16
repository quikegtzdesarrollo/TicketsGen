const scanStatus = document.getElementById("scan-status");
const readerContainerId = "qr-reader";
const scanTicket = document.getElementById("scan-ticket");
const scanName = document.getElementById("scan-name");
const scanType = document.getElementById("scan-type");
const scanPrice = document.getElementById("scan-price");
const scanPersonName = document.getElementById("scan-person-name");
const scanAnotherButton = document.getElementById("scan-another");

let isProcessing = false;
let qrReader = null;
let scannerRunning = false;

const CAMERA_RELEASE_MS = 350;

const setStatus = (message, type = "success") => {
  if (!scanStatus) {
    return;
  }
  scanStatus.textContent = message;
  scanStatus.style.color = type === "error" ? "#b42318" : "#2f7d32";
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
    setStatus("Enfoca el QR del boleto para validarlo.");
  }
  if (scanAnotherButton) {
    scanAnotherButton.disabled = false;
  }
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

const onScanSuccess = (decodedText) => {
  if (!decodedText || isProcessing) {
    return;
  }
  const ticketCode = decodedText.trim();
  if (!ticketCode) {
    setStatus("QR inválido.", "error");
    return;
  }
  markTicketAsUsed(ticketCode);
};

const onScanFailure = () => {};

scanAnotherButton?.addEventListener("click", () => {
  resetForAnotherEntry();
});

startScanner();
