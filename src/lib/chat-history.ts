/**
 * Chat history helpers.
 *
 * Purani saari messages restore karne se page par sainkron bhaari cards render
 * hote the aur mobile par app hang/blink karti thi. Is liye hum sirf aakhri
 * MAX_MESSAGES rakhte hain (dono padhte aur likhte waqt).
 */
export const MAX_HISTORY_MESSAGES = 20;

export function loadChatHistory<T>(key: string, max = MAX_HISTORY_MESSAGES): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.slice(-max);
  } catch {
    return null;
  }
}

export function saveChatHistory<T>(key: string, messages: T[], max = MAX_HISTORY_MESSAGES) {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-max)));
  } catch {
    // storage full / private mode — ignore
  }
}
