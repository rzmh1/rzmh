export const account = { user: null, csrf: null, entitled: false };
export async function api(path, { method = "GET", body, ...rest } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(account.csrf ? { "X-CSRF-Token": account.csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...rest,
  });
  const data = await response
    .json()
    .catch(() => ({ error: "استجابة غير متوقعة من الخادم" }));
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
}
