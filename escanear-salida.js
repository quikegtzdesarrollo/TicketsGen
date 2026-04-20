const scanStatus = document.getElementById("scan-status");
const readerContainerId = "qr-reader";
const scanTicket = document.getElementById("scan-ticket");
const scanName = document.getElementById("scan-name");
const scanType = document.getElementById("scan-type");
const scanPrice = document.getElementById("scan-price");

let isProcessing = false;

const setStatus = (message, type = "success") => {
  if (!scanStatus) {
    return;
  }
  scanStatus.textContent = message;
  scanStatus.style.color = type === "error" ? "#b42318" : "#2f7d32";
};

const renderTicketInfo = (ticket) => {
  if (!scanTicket || !scanName || !scanType || !scanPrice) {
    return;
  }
  scanTicket.textContent = ticket?.ticket_code ?? "-";
  scanName.textContent = ticket?.attendees?.full_name ?? "-";
  if (ticket?.attendees) {
    scanType.textContent = ticket.attendees.is_child ? "Niño" : "Adulto";
  } else {
    scanType.textContent = "-";
  }
  scanPrice.textContent =
    ticket?.price !== undefined && ticket?.price !== null
      ? `$${Number(ticket.price).toFixed(2)}`
      : "-";
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
    .select()
    .single();

  if (error || !data) {
    setStatus("No se pudo registrar la salida.", "error");
    isProcessing = false;
    return;
  }

  if (!data.used) {
    setStatus(`Salida registrada para ${ticketCode}.`);
  } else {
    setStatus("El boleto no pudo habilitarse.", "error");
  }

  setTimeout(() => {
    isProcessing = false;
  }, 1200);
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
  markTicketAsExited(ticketCode);
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
