/**
 * Correos con acceso completo al menú y a las pantallas administrativas.
 * Edita esta lista para autorizar o quitar administradores.
 */
const TicketGenConfig = {
  adminEmails: ["quikegtzdesarrollo@gmail.com", "jeny3007@gmail.com"],

  normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
  },

  decodeJwtEmail(token) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return "";
    }
    try {
      const payloadPart = token.split(".")[1];
      const payload = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
      const padded = payload.padEnd(
        payload.length + ((4 - (payload.length % 4)) % 4),
        "="
      );
      const json = atob(padded);
      const data = JSON.parse(json);
      return data?.email || data?.Email || "";
    } catch (error) {
      return "";
    }
  },

  getSessionEmail(user) {
    const storedEmail = localStorage.getItem("ticketgen_email");
    if (storedEmail) {
      return this.normalizeEmail(storedEmail);
    }

    const token = localStorage.getItem("ticketgen_token");
    const fromToken = this.decodeJwtEmail(token);
    if (fromToken) {
      return this.normalizeEmail(fromToken);
    }

    const fromUser = user?.email || user?.Email || "";
    return this.normalizeEmail(fromUser);
  },

  isAdminEmail(email) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) {
      return false;
    }
    return this.adminEmails
      .map((item) => this.normalizeEmail(item))
      .includes(normalized);
  },

  isAdminUser(user) {
    return this.isAdminEmail(this.getSessionEmail(user));
  },

  persistSessionEmail(user) {
    const email = this.getSessionEmail(user);
    if (email) {
      localStorage.setItem("ticketgen_email", email);
    } else {
      localStorage.removeItem("ticketgen_email");
    }
    return email;
  },
};

window.TicketGenConfig = TicketGenConfig;
