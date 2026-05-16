const enforcePageAccess = () => {
  if (document.body?.dataset?.requireAdmin !== "true") {
    return;
  }

  const user = typeof getCurrentUser === "function" ? getCurrentUser() : null;
  if (!user) {
    window.location.replace("login.html");
    return;
  }

  if (!window.TicketGenConfig?.isAdminUser(user)) {
    window.location.replace("index.html");
  }
};

enforcePageAccess();
