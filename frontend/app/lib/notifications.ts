const LAST_READ_KEY = "chat_last_read"; // { [reportId]: latestMessageId }

// ── 既読管理 ────────────────────────────────────────────────────

export function getLastReadIds(): Record<number, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LAST_READ_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markAsRead(reportId: number, latestMessageId: number): void {
  const current = getLastReadIds();
  current[reportId] = latestMessageId;
  localStorage.setItem(LAST_READ_KEY, JSON.stringify(current));
}

export function computeUnreadCounts(
  summary: { report_id: number; latest_message_id: number }[],
): Record<number, number> {
  const lastRead = getLastReadIds();
  const result: Record<number, number> = {};
  for (const item of summary) {
    const lastId = lastRead[item.report_id] ?? 0;
    if (item.latest_message_id > lastId) {
      result[item.report_id] = 1;
    }
  }
  return result;
}

// ── ブラウザ通知 (タブ非アクティブ時) ──────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserNotification(
  title: string,
  body: string,
  reportId: number,
): void {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return; // アクティブ時はトーストを使う

  const n = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: `report-${reportId}`,
  });
  n.onclick = () => {
    window.focus();
    window.location.href = `/reports/${reportId}/chat`;
    n.close();
  };
}

// ── 新着検出 ────────────────────────────────────────────────────

export interface NewMessageItem {
  report_id: number;
  latest_message_id: number;
  preview: string;
  sender_name: string;
}

/**
 * 前回と今回のサマリーを比較し、新着があったレポートを返す。
 * 副作用なし — 呼び出し元が通知方法を選ぶ。
 */
export function detectNewMessages(
  prevSummary: { report_id: number; latest_message_id: number }[],
  nextSummary: NewMessageItem[],
): NewMessageItem[] {
  const prevMap: Record<number, number> = {};
  for (const item of prevSummary) {
    prevMap[item.report_id] = item.latest_message_id;
  }
  return nextSummary.filter(
    (item) => item.latest_message_id > (prevMap[item.report_id] ?? 0),
  );
}
