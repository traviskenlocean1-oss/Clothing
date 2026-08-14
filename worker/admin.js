// worker/admin.js
export function findAdminRole(env, phone) {
  if (!env.ADMIN_PHONES) return null;
  let list;
  try {
    list = JSON.parse(env.ADMIN_PHONES);
  } catch {
    return null;
  }
  const match = list.find(([p]) => p === phone);
  return match ? match[1] : null;
}
