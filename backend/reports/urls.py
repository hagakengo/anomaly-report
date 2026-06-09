from django.urls import path

from . import views

urlpatterns = [
    # ヘルスチェック
    path('', lambda req: __import__('django.http', fromlist=['JsonResponse']).JsonResponse({'status': 'ok'})),

    # 統計（/reports/{id} より先に定義）
    path('reports/stats', views.ReportStatsView.as_view()),

    # 報告 CRUD
    path('reports', views.ReportListCreateView.as_view()),
    path('reports/<int:report_id>', views.ReportDetailView.as_view()),
    path('reports/<int:report_id>/assign', views.ReportAssignView.as_view()),
    path('reports/<int:report_id>/status-logs', views.ReportStatusLogsView.as_view()),
    path('reports/<int:report_id>/recurrence', views.ReportRecurrenceView.as_view()),
    path('reports/<int:report_id>/pdf', views.ReportPdfView.as_view()),

    # チャット
    path('reports/<int:report_id>/messages', views.MessageListCreateView.as_view()),
    path('messages/unread-summary', views.UnreadSummaryView.as_view()),

    # 確認項目
    path('check-items', views.CheckItemListCreateView.as_view()),
    path('check-items/machines', views.CheckItemMachinesView.as_view()),
    path('check-items/dedup', views.CheckItemDedupView.as_view()),
    path('check-items/<int:item_id>', views.CheckItemDetailView.as_view()),

    # AI インタビュー
    path('ai-interview/suggestions', views.AIInterviewSuggestionsView.as_view()),
    path('ai-interview', views.AIInterviewView.as_view()),
]
