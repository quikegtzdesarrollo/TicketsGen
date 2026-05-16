const summaryContainer = document.getElementById("home-summary");
const MEMBER_RECORD_TYPE = "Miembros o Visitas";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

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

const renderSummary = (title, saleCount, memberCount, totalSpent, chartHtml) => {
  const totalCombined = saleCount + memberCount;
  summaryContainer.innerHTML = `
    <div class="summary-card">
      <p class="summary-title">${escapeHtml(title)}</p>
      <div class="summary-stats">
        <div>
          <span class="summary-label">Total de boletos</span>
          <span class="summary-value">${totalCombined}</span>
        </div>
        <div>
          <span class="summary-label">Total en ventas</span>
          <span class="summary-value">$${totalSpent}</span>
        </div>
      </div>
      <p class="summary-detail">
        ${saleCount} boleto(s) de venta + ${memberCount} miembro(s) o visita(s).
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

  const [allTicketsResult, membersResult] = await Promise.all([
    supabaseClient.from("tickets").select("price"),
    supabaseClient
      .from("member_visits")
      .select("inviting_church")
      .eq("record_type", MEMBER_RECORD_TYPE),
  ]);

  if (allTicketsResult.error) {
    summaryContainer.innerHTML =
      '<p class="helper">No se pudo cargar el resumen.</p>';
    return;
  }

  const saleRows = allTicketsResult.data ?? [];
  const memberRows = membersResult.error ? [] : membersResult.data ?? [];
  const saleCount = saleRows.length;
  const memberCount = memberRows.length;
  const totalSpent = saleRows.reduce((sum, ticket) => sum + Number(ticket.price || 0), 0);

  let chartHtml = "";
  if (allTicketsResult.error || membersResult.error) {
    chartHtml = `
      <div class="home-chart">
        <h3 class="home-chart-title">Por iglesia y ventas</h3>
        <p class="helper">No se pudo cargar la gráfica.</p>
      </div>
    `;
  } else {
    const chartRows = buildChartRows(memberRows, saleRows);
    chartHtml = renderChurchChart(chartRows);
  }

  renderSummary(
    `Hola, ${currentUser.name || "invitado"}`,
    saleCount,
    memberCount,
    totalSpent.toFixed(2),
    chartHtml
  );
};

loadSummary();

window.addEventListener("pageshow", () => {
  loadSummary();
});
