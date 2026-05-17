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

const getAttendeeIsChild = (ticket) => {
  const attendees = ticket?.attendees;
  if (Array.isArray(attendees)) {
    return !!attendees[0]?.is_child;
  }
  return !!attendees?.is_child;
};

const buildClassificationRows = (memberRows, ticketRows) => {
  const buckets = {
    saleAdult: { label: "Venta · Adulto", total: 0, checkedIn: 0, type: "sale-adult" },
    saleChild: { label: "Venta · Niño", total: 0, checkedIn: 0, type: "sale-child" },
    member: { label: "Miembros o visitas", total: 0, checkedIn: 0, type: "member" },
  };

  for (const ticket of ticketRows ?? []) {
    const key = getAttendeeIsChild(ticket) ? "saleChild" : "saleAdult";
    buckets[key].total += 1;
    if (ticket.used) {
      buckets[key].checkedIn += 1;
    }
  }

  for (const member of memberRows ?? []) {
    buckets.member.total += 1;
    if (member.used) {
      buckets.member.checkedIn += 1;
    }
  }

  return Object.values(buckets);
};

const sumEntryTotals = (rows) => {
  let totalAll = 0;
  let totalCheckedIn = 0;
  for (const row of rows) {
    totalAll += row.total;
    totalCheckedIn += row.checkedIn;
  }
  return { totalAll, totalCheckedIn, totalPending: totalAll - totalCheckedIn };
};

const renderClassificationChart = (rows) => {
  const { totalAll, totalCheckedIn, totalPending } = sumEntryTotals(rows);

  if (!totalAll) {
    return `
      <div class="home-chart home-chart-entries">
        <h3 class="home-chart-title">Clasificación y entradas registradas</h3>
        <p class="helper">Aún no hay boletos ni registros para mostrar.</p>
      </div>
    `;
  }

  const maxCount = Math.max(...rows.map((row) => row.total), 1);
  const overallPercent =
    totalAll > 0 ? Math.round((totalCheckedIn / totalAll) * 100) : 0;

  const bars = rows
    .filter((row) => row.total > 0)
    .map((row) => {
      const trackWidth = Math.max(6, Math.round((row.total / maxCount) * 100));
      const checkedPercent = Math.round((row.checkedIn / row.total) * 100);
      const checkedWidth = (row.checkedIn / row.total) * 100;
      const pendingWidth = 100 - checkedWidth;
      const pending = row.total - row.checkedIn;

      return `
        <div class="chart-row chart-row-entry">
          <span class="chart-label" title="${escapeAttr(row.label)}">${escapeHtml(row.label)}</span>
          <div class="chart-bar-wrap chart-bar-wrap-stacked" style="width: ${trackWidth}%">
            <span
              class="chart-bar-segment chart-bar-checked"
              style="width: ${checkedWidth}%"
              title="${row.checkedIn} con entrada"
            ></span>
            <span
              class="chart-bar-segment chart-bar-pending"
              style="width: ${pendingWidth}%"
              title="${pending} sin registrar"
            ></span>
          </div>
          <span class="chart-meta">
            ${row.checkedIn}/${row.total} · ${checkedPercent}%
          </span>
        </div>
      `;
    })
    .join("");

  return `
    <div class="home-chart home-chart-entries">
      <h3 class="home-chart-title">Clasificación y entradas registradas</h3>
      <p class="helper home-chart-hint">
        Cantidad por tipo de boleto y cuántos ya registraron entrada en el evento.
      </p>
      <div class="entry-totals-grid">
        <div class="entry-total-card">
          <span class="summary-label">Total general</span>
          <span class="summary-value">${totalAll}</span>
        </div>
        <div class="entry-total-card entry-total-card--ok">
          <span class="summary-label">Entradas registradas</span>
          <span class="summary-value">${totalCheckedIn}</span>
          <span class="entry-total-sub">${overallPercent}% del total</span>
        </div>
        <div class="entry-total-card entry-total-card--pending">
          <span class="summary-label">Sin registrar</span>
          <span class="summary-value">${totalPending}</span>
        </div>
      </div>
      <div class="chart-legend">
        <span class="chart-legend-item"><span class="chart-legend-swatch chart-bar-checked"></span> Con entrada</span>
        <span class="chart-legend-item"><span class="chart-legend-swatch chart-bar-pending"></span> Pendiente</span>
      </div>
      <div class="chart-bars">${bars}</div>
    </div>
  `;
};

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

const renderSummary = (
  title,
  saleCount,
  memberCount,
  totalSpent,
  entryTotals,
  classificationChartHtml,
  churchChartHtml
) => {
  const totalCombined = saleCount + memberCount;
  const { totalAll, totalCheckedIn, totalPending } = entryTotals;
  const entryPercent =
    totalAll > 0 ? Math.round((totalCheckedIn / totalAll) * 100) : 0;

  summaryContainer.innerHTML = `
    <div class="summary-card">
      <p class="summary-title">${escapeHtml(title)}</p>
      <div class="summary-stats summary-stats-wide">
        <div>
          <span class="summary-label">Total de boletos</span>
          <span class="summary-value">${totalCombined}</span>
        </div>
        <div>
          <span class="summary-label">Entradas registradas</span>
          <span class="summary-value summary-value-ok">${totalCheckedIn}</span>
        </div>
        <div>
          <span class="summary-label">Total en ventas</span>
          <span class="summary-value">$${totalSpent}</span>
        </div>
      </div>
      <p class="summary-detail">
        ${saleCount} boleto(s) de venta + ${memberCount} miembro(s) o visita(s).
        ${totalAll ? ` · ${totalCheckedIn} entrada(s) registrada(s) (${entryPercent}%), ${totalPending} pendiente(s).` : ""}
      </p>
    </div>
    ${classificationChartHtml}
    ${churchChartHtml}
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
    supabaseClient.from("tickets").select("price, used, attendees(is_child)"),
    supabaseClient
      .from("member_visits")
      .select("inviting_church, used")
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

  const classificationRows = buildClassificationRows(memberRows, saleRows);
  const entryTotals = sumEntryTotals(classificationRows);
  const classificationChartHtml = renderClassificationChart(classificationRows);

  let churchChartHtml = "";
  if (membersResult.error) {
    churchChartHtml = `
      <div class="home-chart">
        <h3 class="home-chart-title">Por iglesia y ventas</h3>
        <p class="helper">No se pudo cargar la gráfica por iglesia.</p>
      </div>
    `;
  } else {
    const chartRows = buildChartRows(memberRows, saleRows);
    churchChartHtml = renderChurchChart(chartRows);
  }

  renderSummary(
    `Hola, ${currentUser.name || "invitado"}`,
    saleCount,
    memberCount,
    totalSpent.toFixed(2),
    entryTotals,
    classificationChartHtml,
    churchChartHtml
  );
};

loadSummary();

window.addEventListener("pageshow", () => {
  loadSummary();
});
