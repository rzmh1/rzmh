export const account = { user: null, csrf: null, entitled: false, savedAccounts: [] };
let selection = null;
try { selection = sessionStorage.getItem("ruzmah-active-account"); } catch {}
export function selectAccount(id) {
  selection = id || "guest";
  try { sessionStorage.setItem("ruzmah-active-account", selection); } catch {}
}
export const accountHeaders = () => selection ? { "X-Ruzmah-Account": selection } : {};
export const accountStorageKey = (key) => `${key}:${account.user?.id || "guest"}`;
// The selector is a public ID, never a credential. The server verifies its HttpOnly cookie.
export function mediaUrl(path) {
  return path + (path.includes("?") ? "&" : "?") + "account=" + encodeURIComponent(selection || account.user?.id || "guest");
}
export async function api(path, { method = "GET", body, ...rest } = {}) {
  const requestedAccount = selection;
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(account.csrf ? { "X-CSRF-Token": account.csrf } : {}),
      ...accountHeaders(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...rest,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "استجابة غير متوقعة من الخادم" }));
  if (selection !== requestedAccount) throw Error("تغيّر الحساب النشط. أعد المحاولة من حسابك الحالي.");
  if (!response.ok)
    throw Object.assign(Error(data.error || "تعذر إكمال الطلب"), {
      status: response.status,
    });
  return data;
}
export function setSession(value) {
  account.user = value.user;
  account.csrf = value.csrf;
  account.entitled = value.entitled;
  account.learning = value.learning || null;
  if (value.user && selection === null) {
    // Only an existing legacy session can claim unscoped browser drafts.
    // Copy, never delete, so upgrading cannot destroy the original notebook.
    try {
      if (!localStorage.getItem("ruzmah-legacy-drafts-owner")) {
        localStorage.setItem("ruzmah-legacy-drafts-owner", value.user.id);
        for (const key of ["ruzmah-lesson-ink", "ruzmah-lesson-notebook", "ruzmah-pending-tutor-image"]) {
          const original = localStorage.getItem(key);
          const target = `${key}:${value.user.id}`;
          if (original !== null && localStorage.getItem(target) === null) localStorage.setItem(target, original);
        }
      }
    } catch {}
  }
  selectAccount(value.user?.id);
}
