/** Offline app me team/admin features band hain — sab kuch is device par local hai. */
const unavailable = { ok: false as const, message: "This feature only works in an online workspace." };

export async function getMyAccess() {
  const { db } = await import("./store");
  return { isAdmin: false, isOwner: false, isActive: true, email: "offline@device", fullName: db().profileName };
}

export async function listAppUsers() {
  return { ...unavailable, users: [] as unknown[] };
}
export async function getAdminStats() {
  return { ...unavailable };
}
export async function updateUserAccess() {
  return unavailable;
}
export async function setUserPassword() {
  return unavailable;
}
export async function sendPasswordReset() {
  return unavailable;
}
export async function createAppUser() {
  return unavailable;
}
export async function deleteAppUser() {
  return unavailable;
}
export async function getAutoSyncSetup() {
  return unavailable;
}
export async function getSyncConnectInfo() {
  return unavailable;
}
export async function exportRecordsCsv() {
  return { ...unavailable, csv: "", count: 0 };
}
