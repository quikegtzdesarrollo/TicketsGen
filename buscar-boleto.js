const searchForm = document.getElementById("search-form");
const searchQuery = document.getElementById("search-query");
const searchStatus = document.getElementById("search-status");
const searchResults = document.getElementById("search-results");

const MEMBER_QR_PREFIX = "MV-";
const MEMBER_VISIT_SELECT =
  "id,full_name,reference_phone,inviting_church,record_type,used,used_at";
const SALE_TICKET_SELECT =
  "ticket_code,price,used,used_at,attendees(full_name,is_child)";
const SEARCH_LIMIT = 40;

let isProcessing = false;
let lastResults = [];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatMemberDisplayId = (id) => {
  if (!id) {
    return "-";
  }
  const text = String(id).replace(/-/g, "");
  return text.slice(0, 8).toUpperCase();
};

const formatMemberShortCode = (id) => `${MEMBER_QR_PREFIX}${formatMemberDisplayId(id)}`;

const normalizeSearchToken = (query) => {
  let token = String(query ?? "").trim().toUpperCase();
  if (token.startsWith(MEMBER_QR_PREFIX)) {
    token = token.slice(MEMBER_QR_PREFIX.length);
  } else if (token.startsWith("MV")) {
    token = token.slice(2);
  }
  return token.replace(/-/g, "");
};

const escapeIlike = (value) =>
  String(value ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

const attendeeDisplayName = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return attendees[0]?.full_name?.trim() || "";
  }
  return attendees?.full_name?.trim() || "";
};

const attendeeTypeLabel = (ticket) => {
  const attendees = Array.isArray(ticket?.attendees)
    ? ticket.attendees[0]
    : ticket?.attendees;
  if (!attendees) {
    return "-";
  }
  return attendees.is_child ? "Niño" : "Adulto";
};

const formatUsedStatus = (used, usedAt) => {
  if (!used) {
    return { label: "Sin registrar entrada", className: "search-status-pending" };
  }
  const when = usedAt ? new Date(usedAt).toLocaleString("es-MX") : "";
  return {
    label: when ? `Entrada registrada · ${when}` : "Entrada registrada",
    className: "search-status-used",
  };
};

const setSearchStatus = (message, type = "info") => {
  if (!searchStatus) {
    return;
  }
  searchStatus.textContent = message;
  searchStatus.className =
    type === "error"
      ? "status status-error"
      : type === "success"
        ? "status status-success"
        : "helper";
};

const memberMatchesToken = (row, token) => {
  if (!token) {
    return false;
  }
  const displayId = formatMemberDisplayId(row.id);
  const compactId = String(row.id ?? "")
    .replace(/-/g, "")
    .toUpperCase();
  const shortCode = formatMemberShortCode(row.id).toUpperCase();
  return (
    displayId.includes(token) ||
    compactId.includes(token) ||
    shortCode.includes(token) ||
    shortCode.replace(MEMBER_QR_PREFIX, "").includes(token)
  );
};

const searchSaleTickets = async (query) => {
  const pattern = `%${escapeIlike(query)}%`;
  const { data, error } = await supabaseClient
    .from("tickets")
    .select(SALE_TICKET_SELECT)
    .ilike("ticket_code", pattern)
    .order("created_at", { ascending: false })
    .limit(SEARCH_LIMIT);

  if (error) {
    throw error;
  }

  return (data ?? []).map((ticket) => ({
    kind: "sale",
    id: ticket.ticket_code,
    displayId: ticket.ticket_code,
    name: attendeeDisplayName(ticket) || "-",
    detail: attendeeTypeLabel(ticket),
    price:
      ticket.price !== undefined && ticket.price !== null
        ? `$${Number(ticket.price).toFixed(2)}`
        : "-",
    used: !!ticket.used,
    usedAt: ticket.used_at,
    raw: ticket,
  }));
};

const searchMemberVisits = async (query) => {
  const token = normalizeSearchToken(query);
  const { data, error } = await supabaseClient
    .from("member_visits")
    .select(MEMBER_VISIT_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw error;
  }

  const rows = (data ?? []).filter((row) => memberMatchesToken(row, token));
  return rows.slice(0, SEARCH_LIMIT).map((row) => {
    const church = row.inviting_church?.trim() || "";
    const recordType = row.record_type?.trim() || "Miembros o Visitas";
    return {
      kind: "member",
      id: row.id,
      displayId: formatMemberShortCode(row.id),
      name: row.full_name?.trim() || "-",
      detail: church ? `${recordType} · ${church}` : recordType,
      price: "-",
      used: !!row.used,
      usedAt: row.used_at,
      raw: row,
    };
  });
};

const renderResults = (results) => {
  if (!searchResults) {
    return;
  }

  lastResults = results;

  if (!results.length) {
    searchResults.hidden = true;
    searchResults.innerHTML = "";
    return;
  }

  searchResults.hidden = false;
  searchResults.innerHTML = results
    .map((item, index) => {
      const status = formatUsedStatus(item.used, item.usedAt);
      const typeLabel = item.kind === "sale" ? "Venta" : "Miembro o visita";
      const typeClass =
        item.kind === "sale" ? "search-type-sale" : "search-type-member";
      const buttonDisabled = item.used || isProcessing;
      const buttonLabel = item.used ? "Ya ingresó" : "Registrar entrada";

      return `
        <article class="search-result-card" data-result-index="${index}">
          <div class="search-result-head">
            <span class="search-type-badge ${typeClass}">${escapeHtml(typeLabel)}</span>
            <span class="search-result-status ${status.className}">${escapeHtml(status.label)}</span>
          </div>
          <p class="search-result-id mono">${escapeHtml(item.displayId)}</p>
          <dl class="search-result-meta">
            <div>
              <dt>Nombre</dt>
              <dd>${escapeHtml(item.name)}</dd>
            </div>
            <div>
              <dt>Clasificación</dt>
              <dd>${escapeHtml(item.detail)}</dd>
            </div>
            <div>
              <dt>Precio</dt>
              <dd>${escapeHtml(item.price)}</dd>
            </div>
          </dl>
          <button
            class="primary-link button search-checkin-button"
            type="button"
            data-result-index="${index}"
            ${buttonDisabled ? "disabled" : ""}
          >
            ${escapeHtml(buttonLabel)}
          </button>
        </article>
      `;
    })
    .join("");
};

const updateResultCard = (index, item) => {
  lastResults[index] = item;
  renderResults(lastResults);
};

const registerSaleEntry = async (ticketCode) => {
  const { data: existing, error: existingError } = await supabaseClient
    .from("tickets")
    .select(SALE_TICKET_SELECT)
    .eq("ticket_code", ticketCode)
    .single();

  if (existingError || !existing) {
    throw new Error("No se encontró el boleto.");
  }

  if (existing.used) {
    throw new Error("Este boleto ya fue utilizado.");
  }

  const { data, error } = await supabaseClient
    .from("tickets")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("ticket_code", ticketCode)
    .select(SALE_TICKET_SELECT)
    .single();

  if (error || !data) {
    throw new Error("No se pudo registrar la entrada.");
  }

  return {
    kind: "sale",
    id: data.ticket_code,
    displayId: data.ticket_code,
    name: attendeeDisplayName(data) || "-",
    detail: attendeeTypeLabel(data),
    price:
      data.price !== undefined && data.price !== null
        ? `$${Number(data.price).toFixed(2)}`
        : "-",
    used: !!data.used,
    usedAt: data.used_at,
    raw: data,
  };
};

const registerMemberEntry = async (memberId) => {
  const { data: existing, error: existingError } = await supabaseClient
    .from("member_visits")
    .select(MEMBER_VISIT_SELECT)
    .eq("id", memberId)
    .single();

  if (existingError || !existing) {
    throw new Error("No se encontró el registro.");
  }

  if (existing.used) {
    throw new Error("Este registro ya fue utilizado.");
  }

  const { data, error } = await supabaseClient
    .from("member_visits")
    .update({ used: true, used_at: new Date().toISOString() })
    .eq("id", memberId)
    .select(MEMBER_VISIT_SELECT)
    .single();

  if (error || !data) {
    throw new Error("No se pudo registrar la entrada.");
  }

  const church = data.inviting_church?.trim() || "";
  const recordType = data.record_type?.trim() || "Miembros o Visitas";

  return {
    kind: "member",
    id: data.id,
    displayId: formatMemberShortCode(data.id),
    name: data.full_name?.trim() || "-",
    detail: church ? `${recordType} · ${church}` : recordType,
    price: "-",
    used: !!data.used,
    usedAt: data.used_at,
    raw: data,
  };
};

const handleCheckIn = async (index) => {
  const item = lastResults[index];
  if (!item || item.used || isProcessing) {
    return;
  }

  isProcessing = true;
  renderResults(lastResults);
  setSearchStatus("Registrando entrada...");

  try {
    const updated =
      item.kind === "sale"
        ? await registerSaleEntry(item.id)
        : await registerMemberEntry(item.id);
    updateResultCard(index, updated);
    setSearchStatus(`Entrada registrada: ${updated.name} (${updated.displayId})`, "success");
  } catch (error) {
    console.error(error);
    setSearchStatus(error?.message || "No se pudo registrar la entrada.", "error");
  } finally {
    isProcessing = false;
    renderResults(lastResults);
  }
};

const runSearch = async () => {
  const query = searchQuery?.value?.trim() ?? "";
  if (query.length < 2) {
    setSearchStatus("Escribe al menos 2 caracteres para buscar.", "error");
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    setSearchStatus("Inicia sesión para buscar boletos.", "error");
    return;
  }

  setSearchStatus("Buscando...");
  searchResults.hidden = true;
  searchResults.innerHTML = "";
  isProcessing = false;

  try {
    const [saleResults, memberResults] = await Promise.all([
      searchSaleTickets(query),
      searchMemberVisits(query),
    ]);

    const combined = [...saleResults, ...memberResults];
    renderResults(combined);

    if (!combined.length) {
      setSearchStatus(`No se encontraron resultados para "${query}".`);
      return;
    }

    const saleCount = saleResults.length;
    const memberCount = memberResults.length;
    const parts = [];
    if (saleCount) {
      parts.push(`${saleCount} de venta`);
    }
    if (memberCount) {
      parts.push(`${memberCount} de miembros/visitas`);
    }
    setSearchStatus(`${combined.length} resultado(s): ${parts.join(", ")}.`);
  } catch (error) {
    console.error(error);
    renderResults([]);
    setSearchStatus("Error al buscar. Intenta de nuevo.", "error");
  }
};

searchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

searchResults?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest(".search-checkin-button");
  if (!(button instanceof HTMLButtonElement) || button.disabled) {
    return;
  }
  const index = Number(button.dataset.resultIndex);
  if (Number.isNaN(index)) {
    return;
  }
  handleCheckIn(index);
});
