const STATUS_ELEMENT = document.getElementById("login-status");

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  const json = atob(padded);
  return JSON.parse(json);
}

window.handleCredentialResponse = async (response) => {
  if (!response || !response.credential) {
    STATUS_ELEMENT.textContent = "No se recibió la credencial de Google.";
    STATUS_ELEMENT.style.color = "#b42318";
    return;
  }

  try {
    const payload = decodeJwtPayload(response.credential);
    const name = payload?.name || "tu cuenta";
    localStorage.setItem("ticketgen_token", response.credential);
    localStorage.setItem("ticketgen_user", JSON.stringify(payload ?? {}));
    await ensureUserInDb(payload ?? {});
    STATUS_ELEMENT.textContent = `¡Listo! Sesión iniciada para ${name}.`;
    STATUS_ELEMENT.style.color = "#2f7d32";

    setTimeout(() => {
      window.location.href = "index.html";
    }, 1200);
  } catch (error) {
    STATUS_ELEMENT.textContent = "Ocurrió un error procesando el login.";
    STATUS_ELEMENT.style.color = "#b42318";
  }
};
