/**
 * 事前確認項目の設定ページ（admin / maker 専用）。
 *
 * 設計のポイント：
 * - 確認項目は「全機器共通（machine_name=null）」と「機器固有」の2種類がある
 * - 機器グループを左サイドバーで選択し、右ペインに項目を表示する2カラムレイアウト
 * - 機器グループビューでは「機器固有の項目 + 共通項目」を合わせて表示する
 *   （共通項目は「共通」バッジを付けて識別し、このビューでは編集不可にする）
 *
 * null / undefined の扱いについて：
 * バックエンドが machine_name の値が null の場合 JSON キー自体を省略することがある。
 * TypeScript では省略されたキーは undefined になるため、
 * 「== null」（ゆるい等価、undefined も null も true）を使って判定している。
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import {
  getCheckItems, createCheckItem, updateCheckItem, deleteCheckItem, dedupCheckItems,
  CheckItem,
} from "../lib/api";

// 「全機器共通」グループを識別するための内部キー。
// DB の machine_name=null と混在させないよう、専用の文字列定数を使う。
const COMMON_KEY = "__common__";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const isStaff = user?.role === "admin" || user?.role === "maker";

  const [items, setItems] = useState<CheckItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 左サイドバーで選択中の機器グループ
  const [selectedGroup, setSelectedGroup] = useState<string>(COMMON_KEY);

  // 新規機器グループ追加用の入力値
  const [newGroupName, setNewGroupName] = useState("");

  // 項目追加用の入力値と、他グループからのコピー元 ID
  const [newItemText, setNewItemText] = useState("");
  const [copySourceId, setCopySourceId] = useState<number | "">("");

  // インライン編集用のステート
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  useEffect(() => {
    if (!user) { router.push("/login"); return; }
    if (!isStaff) { router.push("/"); return; }  // customer は設定画面にアクセス不可
    // machine_name 指定なし（全件取得）でフロント側でグループ分けする
    getCheckItems().then(setItems).finally(() => setLoading(false));
  }, [user, router, isStaff]);

  if (loading) return null;

  // 機器グループ一覧を items から動的に生成する（Set で重複排除）
  const machineGroups = Array.from(
    new Set(items.filter((i) => i.machine_name).map((i) => i.machine_name as string))
  ).sort();
  const groups = [COMMON_KEY, ...machineGroups];

  // 選択中グループの DB 上の machine_name 値（共通なら null）
  const currentMachine = selectedGroup === COMMON_KEY ? null : selectedGroup;

  /**
   * 「共通項目かどうか」を判定するヘルパー関数。
   * == null（ゆるい等価）を使うことで undefined と null の両方に対応している。
   * === null（厳密等価）だと、バックエンドがキーを省略した場合の undefined を見逃す。
   */
  const isCommon = (i: CheckItem) => i.machine_name == null;

  /**
   * 右ペインに表示する項目リスト。
   * - 共通グループを選択中：共通項目（null）だけ表示
   * - 機器グループを選択中：その機器の固有項目 + 共通項目を両方表示
   */
  const visibleItems = selectedGroup === COMMON_KEY
    ? items.filter((i) => isCommon(i))
    : items.filter((i) => i.machine_name === selectedGroup || isCommon(i));

  /**
   * 機器固有項目だけのカウント。
   * 新規追加時の order_index（表示順）計算と、ヘッダーの「固有X件 + 共通Y件」表示に使う。
   * visibleItems.length だと共通も含まれてしまうため別途計算している。
   */
  const ownItemCount = selectedGroup === COMMON_KEY
    ? visibleItems.length
    : items.filter((i) => i.machine_name === selectedGroup).length;

  /**
   * 「他グループからコピー」ドロップダウンに表示する項目。
   * 現在の機器の項目と共通項目は除外する（コピーしても意味がないため）。
   */
  const otherItems = selectedGroup === COMMON_KEY
    ? items.filter((i) => !isCommon(i))
    : items.filter((i) => !isCommon(i) && i.machine_name !== selectedGroup);

  const handleAddGroup = () => {
    const name = newGroupName.trim();
    if (!name || machineGroups.includes(name)) return;
    setNewGroupName("");
    // 新しいグループを選択状態にする（DB には保存しない。最初の項目追加時に作られる）
    setSelectedGroup(name);
  };

  const handleAddItem = async () => {
    // コピー元が選ばれている場合はそちらの content を使い、テキスト入力は無視
    const text = copySourceId
      ? items.find((i) => i.id === Number(copySourceId))?.content ?? newItemText.trim()
      : newItemText.trim();
    if (!text) return;
    setSaving(true);
    try {
      await createCheckItem(text, ownItemCount, currentMachine ?? undefined);
      // ローカルステートに追加するだけでは「共通項目」の表示に不整合が起きる。
      // 追加後に全件再フェッチすることで確実に最新状態を反映させる。
      const allItems = await getCheckItems();
      setItems(allItems);
      setNewItemText("");
      setCopySourceId("");
    } finally { setSaving(false); }
  };

  const handleUpdate = async (id: number) => {
    if (!editingText.trim()) return;
    setSaving(true);
    try {
      const orig = items.find((i) => i.id === id)!;
      const updated = await updateCheckItem(id, editingText.trim(), orig.order_index, orig.machine_name ?? undefined);
      // 更新は1件だけなのでローカルステートを直接書き換える（全件再フェッチより軽い）
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      setEditingId(null);
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この確認項目を削除しますか？")) return;
    await deleteCheckItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleDedup = async () => {
    setSaving(true);
    try {
      const { deleted } = await dedupCheckItems();
      // 削除後は再フェッチで最新状態を取得する
      const allItems = await getCheckItems();
      setItems(allItems);
      if (deleted > 0) alert(`重複 ${deleted} 件を削除しました`);
    } finally { setSaving(false); }
  };

  const handleDeleteGroup = async (groupName: string) => {
    if (!confirm(`「${groupName}」グループと、その確認項目をすべて削除しますか？`)) return;
    setSaving(true);
    try {
      // そのグループの全項目を並行削除（Promise.all で同時リクエスト）
      const targets = items.filter((i) => i.machine_name === groupName);
      await Promise.all(targets.map((i) => deleteCheckItem(i.id)));
      setItems((prev) => prev.filter((i) => i.machine_name !== groupName));
      setSelectedGroup(COMMON_KEY);  // 共通グループに戻る
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => router.push("/")} className="text-slate-400 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-slate-900">事前確認項目の設定</h1>
            <p className="text-xs text-slate-400">機器ごとに報告前チェック項目を管理します</p>
          </div>
          {/* 重複削除ボタン: content + machine_name が同じ項目をバックエンドで一括削除 */}
          <button
            onClick={handleDedup}
            disabled={saving}
            className="text-xs text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            重複を削除
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 flex gap-5">
        {/* 左：機器グループ一覧サイドバー */}
        <div className="w-52 shrink-0 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1">機器グループ</p>
          <ul className="space-y-1">
            {groups.map((g) => {
              // そのグループに属する項目件数をカウントしてバッジ表示する
              const count = items.filter((i) =>
                g === COMMON_KEY ? isCommon(i) : i.machine_name === g
              ).length;
              return (
                <li key={g}>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedGroup(g)}
                      className={`flex-1 text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between gap-2 ${
                        selectedGroup === g
                          ? "bg-indigo-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <span className="truncate">{g === COMMON_KEY ? "全機器共通" : g}</span>
                      <span className={`text-xs shrink-0 ${selectedGroup === g ? "text-indigo-200" : "text-slate-400"}`}>
                        {count}件
                      </span>
                    </button>
                    {/* 共通グループは削除不可（ボタンを表示しない） */}
                    {g !== COMMON_KEY && (
                      <button
                        onClick={() => handleDeleteGroup(g)}
                        title="グループを削除"
                        className="shrink-0 p-1.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* 新規機器グループ追加フォーム */}
          <div className="pt-2 border-t border-slate-200 space-y-1.5">
            <p className="text-xs text-slate-400 px-1">機器を追加</p>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) handleAddGroup(); }}
              placeholder="機器名...（Shift+Enterで追加）"
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleAddGroup}
              disabled={!newGroupName.trim()}
              className="w-full bg-slate-100 hover:bg-slate-200 disabled:opacity-40 text-slate-600 text-xs font-medium py-1.5 rounded-lg transition-colors"
            >
              追加
            </button>
          </div>
        </div>

        {/* 右：選択グループの確認項目リスト + 追加フォーム */}
        <div className="flex-1 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-700">
                {selectedGroup === COMMON_KEY ? "全機器共通の確認項目" : `${selectedGroup} の確認項目`}
              </h2>
              {/* 機器グループ選択中は「固有N件 + 共通M件」の内訳を表示 */}
              {selectedGroup === COMMON_KEY ? (
                <span className="text-xs text-slate-400">({visibleItems.length}件)</span>
              ) : (
                <span className="text-xs text-slate-400">
                  固有 {ownItemCount}件 + 共通 {visibleItems.length - ownItemCount}件
                </span>
              )}
            </div>

            {visibleItems.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-400 text-sm">
                確認項目がありません。下から追加してください。
              </div>
            ) : (
              <ul className="divide-y divide-slate-50">
                {visibleItems.map((item, idx) => (
                  // 機器グループビューで共通項目は薄いグレー背景で視覚的に区別する
                  <li key={item.id} className={`flex items-center gap-3 px-4 py-3 ${item.machine_name === null && selectedGroup !== COMMON_KEY ? "bg-slate-50" : ""}`}>
                    <span className="text-xs text-slate-300 font-mono w-5 shrink-0">{idx + 1}</span>
                    {editingId === item.id ? (
                      <input
                        autoFocus
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleUpdate(item.id);
                          if (e.key === "Escape") setEditingId(null);  // Esc でキャンセル
                        }}
                        className="flex-1 border border-indigo-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <span className="flex-1 text-sm text-slate-700">{item.content}</span>
                    )}
                    {/* 機器グループビューで共通項目は「共通」バッジを表示するだけ（編集不可）。
                        共通項目の編集は「全機器共通」グループで行う設計。 */}
                    {isCommon(item) && selectedGroup !== COMMON_KEY ? (
                      <span className="text-xs text-slate-400 bg-slate-200 px-2 py-1 rounded-full shrink-0">共通</span>
                    ) : (
                      <div className="flex gap-1 shrink-0">
                        {editingId === item.id ? (
                          <>
                            <button onClick={() => handleUpdate(item.id)} disabled={saving} className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg font-medium transition-colors">保存</button>
                            <button onClick={() => setEditingId(null)} className="text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors">取消</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => { setEditingId(item.id); setEditingText(item.content); }} className="text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg font-medium transition-colors">編集</button>
                            <button onClick={() => handleDelete(item.id)} className="text-xs text-slate-500 bg-slate-100 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 rounded-lg font-medium transition-colors">削除</button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 項目追加フォーム */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">確認項目を追加</p>

            {/* 他グループからコピー機能：ドロップダウンで選ぶと入力欄に内容が自動補完される */}
            {otherItems.length > 0 && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">他グループからコピー（任意）</label>
                <select
                  value={copySourceId}
                  onChange={(e) => {
                    setCopySourceId(e.target.value ? Number(e.target.value) : "");
                    if (e.target.value) {
                      const src = items.find((i) => i.id === Number(e.target.value));
                      if (src) setNewItemText(src.content);  // テキスト入力に内容を反映
                    }
                  }}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50"
                >
                  <option value="">コピー元を選択...</option>
                  {otherItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.machine_name ?? "共通"}] {i.content}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newItemText}
                onChange={(e) => { setNewItemText(e.target.value); setCopySourceId(""); }}
                onKeyDown={(e) => { if (e.key === "Enter" && e.shiftKey) handleAddItem(); }}
                placeholder="例：エラーコードを確認した（Shift+Enterで追加）"
                className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleAddItem}
                disabled={saving || !newItemText.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-200 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
