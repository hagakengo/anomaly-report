from django.urls import path

from . import views

urlpatterns = [
    # ヘルスチェック。デプロイ先（Railway）が「サーバーが生きているか」確認するために使う。
    path('', lambda req: __import__('django.http', fromlist=['JsonResponse']).JsonResponse({'status': 'ok'})),

    # 【重要】stats は /reports/<int:report_id> より先に定義する必要がある。
    # 後に書くと Django が 'stats' を report_id=stats として解釈しようとしてしまうため。
    path('reports/stats', views.ReportStatsView.as_view()),

    # 報告の CRUD（Create/Read/Update/Delete）
    path('reports',                              views.ReportListCreateView.as_view()),   # GET: 一覧, POST: 作成
    path('reports/<int:report_id>',              views.ReportDetailView.as_view()),       # GET/PUT/PATCH/DELETE
    path('reports/<int:report_id>/assign',       views.ReportAssignView.as_view()),       # PATCH: 担当者を設定
    path('reports/<int:report_id>/status-logs',  views.ReportStatusLogsView.as_view()),  # GET: 変更履歴
    path('reports/<int:report_id>/recurrence',   views.ReportRecurrenceView.as_view()),  # GET: 再発件数
    path('reports/<int:report_id>/pdf',          views.ReportPdfView.as_view()),         # GET: PDF出力

    # チャット
    path('reports/<int:report_id>/messages', views.MessageListCreateView.as_view()),  # GET: 一覧, POST: 送信
    path('messages/unread-summary',          views.UnreadSummaryView.as_view()),      # GET: 未読サマリー

    # 事前確認項目（メーカーが設定するチェックリスト）
    path('check-items',                views.CheckItemListCreateView.as_view()),  # GET: 一覧, POST: 作成
    path('check-items/machines',       views.CheckItemMachinesView.as_view()),    # GET: 機器名一覧
    path('check-items/dedup',          views.CheckItemDedupView.as_view()),       # DELETE: 重複削除
    path('check-items/<int:item_id>',  views.CheckItemDetailView.as_view()),      # PUT/DELETE: 編集・削除

    # AI ヒアリング（Groq / Llama 3.3）
    path('ai-interview/suggestions', views.AIInterviewSuggestionsView.as_view()),  # GET: 候補サジェスト
    path('ai-interview',             views.AIInterviewView.as_view()),             # POST: AI と会話
]
