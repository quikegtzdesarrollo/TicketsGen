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

const loadSummary = async () => {
  if (!summaryContainer) {
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    summaryContainer.innerHTML =
      "<p class=\"helper\">Inicia sesión para ver tu resumen.</p>";
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

  const { count, error } = await supabaseClient
    .from("tickets")
    .select("id,orders!inner(user_id)", { count: "exact", head: true })
    .eq("orders.user_id", dbUser.id);

  if (error) {
    summaryContainer.innerHTML =
      "<p class=\"helper\">No se pudo cargar el resumen.</p>";
    return;
  }

  const { data: orders, error: ordersError } = await supabaseClient
    .from("orders")
    .select("total_amount")
    .eq("user_id", dbUser.id);

  if (ordersError) {
    summaryContainer.innerHTML =
      "<p class=\"helper\">No se pudo cargar el resumen.</p>";
    return;
  }

  const totalSpent = (orders ?? []).reduce(
    (sum, order) => sum + Number(order.total_amount || 0),
    0
  );

  const { data: lastTicketData } = await supabaseClient
    .from("tickets")
    .select("ticket_code,attendees(full_name),orders!inner(user_id)")
    .eq("orders.user_id", dbUser.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastTicketLabel = lastTicketData
    ? `${lastTicketData.ticket_code} (${lastTicketData.attendees?.full_name ?? "Sin asignar"})`
    : "";

  renderSummary(
    `Hola, ${currentUser.name || "invitado"}`,
    count ?? 0,
    totalSpent.toFixed(2),
    lastTicketLabel
  );
};

loadSummary();
