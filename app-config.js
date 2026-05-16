/**
 * Correos con acceso completo al menú y a las pantallas administrativas.
 * Edita esta lista para autorizar o quitar administradores.
 */
const TicketGenConfig = {
  adminEmails: ["quikegtzdesarrollo@gmail.com", "jeny3007@gmail.com"],

  normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase();
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
    return this.isAdminEmail(user?.email);
  },
};

window.TicketGenConfig = TicketGenConfig;
