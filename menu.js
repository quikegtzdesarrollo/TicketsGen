const menu = document.getElementById("menu");
const toggle = document.querySelector(".menu-toggle");
const loginIndicator = document.getElementById("login-indicator");
const loginName = loginIndicator?.querySelector(".login-name");
const loginAvatar = loginIndicator?.querySelector(".login-avatar");

const getStoredUser = () => {
  const storedUser = localStorage.getItem("ticketgen_user");
  if (!storedUser) {
    return null;
  }
  try {
    return JSON.parse(storedUser);
  } catch (error) {
    return null;
  }
};

const isAdminSession = () => {
  const user = getStoredUser();
  if (!user) {
    return false;
  }
  return !!window.TicketGenConfig?.isAdminUser(user);
};

const setNavItemVisible = (element, visible) => {
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (visible) {
    element.hidden = false;
    element.style.removeProperty("display");
  } else {
    element.hidden = true;
  }
};

const updateMenuVisibility = () => {
  const user = getStoredUser();
  const isLoggedIn = !!user;
  const isAdmin = isAdminSession();

  document.querySelectorAll("[data-admin-only]").forEach((link) => {
    setNavItemVisible(link, isLoggedIn && isAdmin);
  });

  document.querySelectorAll("[data-auth='required']").forEach((link) => {
    if (!link.hasAttribute("data-admin-only")) {
      setNavItemVisible(link, isLoggedIn);
    }
  });

  document.querySelectorAll(".menu-logout").forEach((button) => {
    setNavItemVisible(button, isLoggedIn);
  });
};

const openMenu = () => {
  menu.classList.add("menu-open");
};

const closeMenu = () => {
  menu.classList.remove("menu-open");
};

if (toggle) {
  toggle.addEventListener("click", openMenu);
}

const updateLoginIndicator = () => {
  if (!loginIndicator) {
    return;
  }
  const user = getStoredUser();
  if (user) {
    window.TicketGenConfig?.persistSessionEmail(user);
    const name = user?.name || "Sesión activa";
    if (loginName) {
      loginName.textContent = name;
    }
    if (loginAvatar) {
      if (user?.picture) {
        loginAvatar.style.backgroundImage = `url("${user.picture}")`;
        loginAvatar.classList.add("has-photo");
      } else {
        loginAvatar.style.backgroundImage = "";
        loginAvatar.classList.remove("has-photo");
      }
    }
    loginIndicator.classList.add("is-logged");
    updateMenuVisibility();
    return;
  }
  if (loginName) {
    loginName.textContent = "Sin sesión";
  }
  if (loginAvatar) {
    loginAvatar.style.backgroundImage = "";
    loginAvatar.classList.remove("has-photo");
  }
  loginIndicator.classList.remove("is-logged");
  updateMenuVisibility();
};

const handleLogout = () => {
  localStorage.removeItem("ticketgen_token");
  localStorage.removeItem("ticketgen_user");
  localStorage.removeItem("ticketgen_email");
  updateLoginIndicator();
  window.location.href = "login.html";
};

document.querySelectorAll(".menu-logout").forEach((button) => {
  button.addEventListener("click", handleLogout);
});

updateLoginIndicator();

window.addEventListener("pageshow", () => {
  updateLoginIndicator();
});

menu?.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.dataset.closeMenu === "true") {
    closeMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menu.classList.contains("menu-open")) {
    closeMenu();
  }
});

window.isAdminSession = isAdminSession;
window.updateMenuVisibility = updateMenuVisibility;
