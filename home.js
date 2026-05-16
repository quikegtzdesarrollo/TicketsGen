const summaryContainer = document.getElementById("home-summary");

const renderSummary = (title, tickets, totalSpent, lastTicket) => {
  summaryContainer.innerHTML = `
    <div class="summary-card">
      <p class="summary-title">${title}</p>
      <div class="summary-stats">
        <div>
          <span class="summary-label">Boletos registrados</span>
          <span class="summary-value">${tickets}</span>
        </div>
        <div>
          <span class="summary-label">Total gastado</span>
          <span class="summary-value">$${totalSpent}</span>
        </div>
      </div>
      <p class="summary-detail">
        Último boleto: ${lastTicket || "Sin compras aún"}
      </p>
    </div>
  `;
};

const attendeeDisplayName = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return attendees[0]?.full_name?.trim() || "";
  }
  return attendees?.full_name?.trim() || "";
};

const loadSummary = async () => {
  if (!summaryContainer) {
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    summaryContainer.innerHTML =
      '<p class="helper">Inicia sesión para ver tu resumen.</p>';
    return;
  }

  if (!window.TicketGenConfig?.isAdminUser(currentUser)) {
    summaryContainer.innerHTML = `
      <p class="helper">Sesión activa. Usa el menú para escanear entradas o salidas.</p>
    `;
    return;
  }

  const { data: dbUser, error: userError } = await ensureUserInDb(currentUser);
  if (!dbUser?.id) {
    summaryContainer.innerHTML = `<p class="helper">No se pudo validar el usuario. ${userError ?? ""}</p>`;
    return;
  }

  const { data: ticketRows, error } = await supabaseClient
    .from("tickets")
    .select("price,ticket_code,created_at,attendees(full_name),orders!inner(user_id)")
    .eq("orders.user_id", dbUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    summaryContainer.innerHTML =
      '<p class="helper">No se pudo cargar el resumen.</p>';
    return;
  }

  const rows = ticketRows ?? [];
  const totalSpent = rows.reduce((sum, ticket) => sum + Number(ticket.price || 0), 0);
  const lastTicket = rows[0];
  const lastTicketLabel = lastTicket
    ? `${lastTicket.ticket_code} (${attendeeDisplayName(lastTicket) || "Sin asignar"})`
    : "";

  renderSummary(
    `Hola, ${currentUser.name || "invitado"}`,
    rows.length,
    totalSpent.toFixed(2),
    lastTicketLabel
  );
};

loadSummary();

window.addEventListener("pageshow", () => {
  loadSummary();
});
