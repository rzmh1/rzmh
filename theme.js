try {
  document.documentElement.dataset.theme =
    localStorage.getItem("ruzmah-theme") || "light";
} catch {}
