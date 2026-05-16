const summaryContainer = document.getElementById("home-summary");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const attendeeDisplayName = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return attendees[0]?.full_name?.trim() || "";
  }
  return attendees?.full_name?.trim() || "";
};

const churchLabel = (value) => {
  const text = String(value ?? "").trim();
  return text || "(Sin iglesia)";
};

const aggregateByChurch = (memberRows) => {
  const map = new Map();
  for (const row of memberRows ?? []) {
    const label = churchLabel(row.inviting_church);
    map.set(label, (map.get(label) || 0) + 1);
  }
  return [...map.entries()]
    .map(([label, count]) => ({ label, count, sales: 0, type: "member" }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "es"));
};

const escapeAttr = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const buildChartRows = (memberRows, ticketRows) => {
  const churchRows = aggregateByChurch(memberRows);
  const ticketCount = ticketRows?.length ?? 0;
  const ticketSales = (ticketRows ?? []).reduce(
    (sum, ticket) => sum + Number(ticket.price || 0),
    0
  );

  const salesRow = {
    label: "Venta de boletos",
    count: ticketCount,
    sales: ticketSales,
    type: "sales",
  };

  return [salesRow, ...churchRows];
};

const renderChurchChart = (rows) => {
  if (!rows.length) {
    return `
      <div class="home-chart">
        <h3 class="home-chart-title">Por iglesia y ventas</h3>
        <p class="helper">Aún no hay datos para mostrar.</p>
      </div>
    `;
  }

  const maxCount = Math.max(...rows.map((row) => row.count), 1);

  const bars = rows
    .map((row) => {
      const width = Math.max(6, Math.round((row.count / maxCount) * 100));
      const isSales = row.type === "sales";
      const meta = isSales
        ? `${row.count} boleto(s) · $${row.sales.toFixed(2)}`
        : `${row.count} registro(s)`;
      return `
        <div class="chart-row${isSales ? " chart-row-sales" : ""}">
          <span class="chart-label" title="${escapeAttr(row.label)}">${escapeHtml(row.label)}</span>
          <div class="chart-bar-wrap">
            <span
              class="chart-bar${isSales ? " chart-bar-sales" : ""}"
              style="width: ${width}%"
            ></span>
          </div>
          <span class="chart-meta">${meta}</span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="home-chart">
      <h3 class="home-chart-title">Por iglesia y ventas</h3>
      <p class="helper home-chart-hint">
        Registros de miembros o visitas por iglesia que invita, más el total de boletos de venta.
      </p>
      <div class="chart-bars">${bars}</div>
    </div>
  `;
};

const renderSummary = (title, tickets, totalSpent, lastTicket, chartHtml) => {
  summaryContainer.innerHTML = `
    <div class="summary-card">
      <p class="summary-title">${escapeHtml(title)}</p>
      <div class="summary-stats">
        <div>
          <span class="summary-label">Tus boletos registrados</span>
          <span class="summary-value">${tickets}</span>
        </div>
        <div>
          <span class="summary-label">Tu total en ventas</span>
          <span class="summary-value">$${totalSpent}</span>
        </div>
      </div>
      <p class="summary-detail">
        Último boleto: ${escapeHtml(lastTicket || "Sin compras aún")}
      </p>
    </div>
    ${chartHtml}
  `;
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

  const [userTicketsResult, allTicketsResult, membersResult] = await Promise.all([
    supabaseClient
      .from("tickets")
      .select("price,ticket_code,created_at,attendees(full_name),orders!inner(user_id)")
      .eq("orders.user_id", dbUser.id)
      .order("created_at", { ascending: false }),
    supabaseClient.from("tickets").select("price"),
    supabaseClient.from("member_visits").select("inviting_church"),
  ]);

  if (userTicketsResult.error) {
    summaryContainer.innerHTML =
      '<p class="helper">No se pudo cargar el resumen.</p>';
    return;
  }

  const userRows = userTicketsResult.data ?? [];
  const totalSpent = userRows.reduce((sum, ticket) => sum + Number(ticket.price || 0), 0);
  const lastTicket = userRows[0];
  const lastTicketLabel = lastTicket
    ? `${lastTicket.ticket_code} (${attendeeDisplayName(lastTicket) || "Sin asignar"})`
    : "";

  let chartHtml = "";
  if (allTicketsResult.error || membersResult.error) {
    chartHtml = `
      <div class="home-chart">
        <h3 class="home-chart-title">Por iglesia y ventas</h3>
        <p class="helper">No se pudo cargar la gráfica.</p>
      </div>
    `;
  } else {
    const chartRows = buildChartRows(membersResult.data, allTicketsResult.data);
    chartHtml = renderChurchChart(chartRows);
  }

  renderSummary(
    `Hola, ${currentUser.name || "invitado"}`,
    userRows.length,
    totalSpent.toFixed(2),
    lastTicketLabel,
    chartHtml
  );
};

loadSummary();

window.addEventListener("pageshow", () => {
  loadSummary();
});
