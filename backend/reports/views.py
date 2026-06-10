import json
import os
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Optional

from django.conf import settings
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsStaff

from .models import CheckItem, Message, Report, StatusLog
from .serializers import (
    CheckItemSerializer,
    MessageSerializer,
    ReportSerializer,
    StatusLogSerializer,
)

ALLOWED_EXTENSIONS = {
    'image': {'.jpg', '.jpeg', '.png', '.gif', '.webp'},
    'video': {'.mp4', '.mov', '.avi', '.webm'},
}


def _save_upload(file) -> tuple[str, str]:
    ext = os.path.splitext(file.name or '')[1].lower()
    file_type: Optional[str] = None
    for ftype, exts in ALLOWED_EXTENSIONS.items():
        if ext in exts:
            file_type = ftype
            break
    if file_type is None:
        raise ValueError('許可されていないファイル形式です')
    filename = f'{uuid.uuid4().hex}{ext}'
    os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
    dest = os.path.join(settings.MEDIA_ROOT, filename)
    with open(dest, 'wb') as f:
        for chunk in file.chunks():
            f.write(chunk)
    return filename, file_type


# ── 報告 ─────────────────────────────────────────────────────────

class ReportStatsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        uid = request.user.id if request.user.role == 'customer' else None
        qs = Report.objects.all()
        if uid is not None:
            qs = qs.filter(user_id=uid)
        reports = list(qs)

        monthly: dict[str, int] = defaultdict(int)
        by_severity = {'high': 0, 'medium': 0, 'low': 0}
        by_status = {'open': 0, 'in_progress': 0, 'resolved': 0}
        machine_counts: dict[str, int] = defaultdict(int)

        for r in reports:
            month = str(r.reported_at)[:7]
            if month:
                monthly[month] += 1
            by_severity[r.severity] = by_severity.get(r.severity, 0) + 1
            by_status[r.status] = by_status.get(r.status, 0) + 1
            machine_counts[r.machine_name] += 1

        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        recent_machine: dict[str, int] = defaultdict(int)
        for r in reports:
            if str(r.reported_at)[:10] >= cutoff:
                recent_machine[r.machine_name] += 1
        recurring = sorted(
            [{'machine_name': k, 'count': v} for k, v in recent_machine.items() if v >= 2],
            key=lambda x: x['count'],
            reverse=True,
        )

        return Response({
            'monthly': [{'month': k, 'count': v} for k, v in sorted(monthly.items())][-12:],
            'by_severity': by_severity,
            'by_status': by_status,
            'top_machines': sorted(
                [{'machine_name': k, 'count': v} for k, v in machine_counts.items()],
                key=lambda x: x['count'],
                reverse=True,
            )[:10],
            'recurring_machines': recurring,
        })


class ReportListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        uid = None if request.user.role in ('admin', 'maker') else request.user.id
        qs = Report.objects.all()
        if uid is not None:
            qs = qs.filter(user_id=uid)

        params = request.query_params
        if params.get('machine_name'):
            qs = qs.filter(machine_name__icontains=params['machine_name'])
        if params.get('location'):
            qs = qs.filter(location__icontains=params['location'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('severity'):
            qs = qs.filter(severity=params['severity'])
        if params.get('date_from'):
            qs = qs.filter(reported_at__gte=params['date_from'])
        if params.get('date_to'):
            qs = qs.filter(reported_at__lte=params['date_to'] + ' 23:59:59')
        if params.get('company_name'):
            qs = qs.filter(company_name__icontains=params['company_name'])

        sort_by = params.get('sort_by', 'reported_at')
        sort_map = {'reported_at': 'reported_at', 'severity': 'severity', 'status': 'status'}
        col = sort_map.get(sort_by, 'reported_at')
        if params.get('sort_order') == 'asc':
            qs = qs.order_by(col)
        else:
            qs = qs.order_by(f'-{col}')

        return Response(ReportSerializer(qs, many=True).data)

    def post(self, request):
        if request.user.role != 'customer':
            return Response(
                {'detail': '報告の作成はユーザーのみ可能です'},
                status=status.HTTP_403_FORBIDDEN,
            )

        file_path: Optional[str] = None
        file_type: Optional[str] = None
        file = request.FILES.get('file')
        if file and file.name:
            try:
                file_path, file_type = _save_upload(file)
            except ValueError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        report = Report.objects.create(
            machine_name=request.data.get('machine_name', ''),
            location=request.data.get('location', ''),
            description=request.data.get('description', ''),
            severity=request.data.get('severity', 'medium'),
            file_path=file_path,
            file_type=file_type,
            user=request.user,
            company_name=request.user.company_name,
        )

        return Response(ReportSerializer(report).data, status=status.HTTP_201_CREATED)


class ReportDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_report(self, report_id, user):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return None, Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        if user.role == 'customer' and report.user_id != user.id:
            return None, Response({'detail': 'アクセス権限がありません'}, status=status.HTTP_403_FORBIDDEN)
        return report, None

    def get(self, request, report_id):
        report, err = self._get_report(report_id, request.user)
        if err:
            return err
        return Response(ReportSerializer(report).data)

    def put(self, request, report_id):
        report, err = self._get_report(report_id, request.user)
        if err:
            return err

        file = request.FILES.get('file')
        if file and file.name:
            try:
                file_path, file_type = _save_upload(file)
                report.file_path = file_path
                report.file_type = file_type
            except ValueError as e:
                return Response({'detail': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        report.machine_name = request.data.get('machine_name', report.machine_name)
        report.location = request.data.get('location', report.location)
        report.description = request.data.get('description', report.description)
        report.severity = request.data.get('severity', report.severity)
        report.save()
        return Response(ReportSerializer(report).data)

    def patch(self, request, report_id):
        # ステータス変更は staff のみ
        if request.user.role not in ('admin', 'maker'):
            return Response({'detail': 'スタッフ権限が必要です'}, status=status.HTTP_403_FORBIDDEN)
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status', report.status)
        if report.status != new_status:
            StatusLog.objects.create(
                report=report,
                user=request.user,
                old_status=report.status,
                new_status=new_status,
            )
            report.status = new_status
            report.save()
        return Response(ReportSerializer(report).data)

    def delete(self, request, report_id):
        if request.user.role not in ('admin', 'maker'):
            return Response({'detail': 'スタッフ権限が必要です'}, status=status.HTTP_403_FORBIDDEN)
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        report.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportAssignView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def patch(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)

        assignee_id = request.data.get('assignee_id')
        if assignee_id is not None:
            try:
                assignee = User.objects.get(pk=assignee_id)
            except User.DoesNotExist:
                return Response({'detail': 'ユーザーが見つかりません'}, status=status.HTTP_404_NOT_FOUND)
            report.assignee = assignee
            report.assignee_name = assignee.username
        else:
            report.assignee = None
            report.assignee_name = None
        report.save()
        return Response(ReportSerializer(report).data)


class ReportStatusLogsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == 'customer' and report.user_id != request.user.id:
            return Response({'detail': 'アクセス権限がありません'}, status=status.HTTP_403_FORBIDDEN)
        logs = StatusLog.objects.filter(report=report)
        return Response(StatusLogSerializer(logs, many=True).data)


class ReportRecurrenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        cutoff = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
        count = Report.objects.filter(
            machine_name=report.machine_name,
            reported_at__gte=cutoff,
        ).exclude(pk=report_id).count()
        return Response({'count': count, 'machine_name': report.machine_name})


class ReportPdfView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        if request.user.role == 'customer' and report.user_id != request.user.id:
            return Response({'detail': 'アクセス権限がありません'}, status=status.HTTP_403_FORBIDDEN)
        from .pdf import generate_pdf
        pdf_bytes = generate_pdf(report)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename=report_{report_id}.pdf'
        return response


# ── チャット ─────────────────────────────────────────────────────

class MessageListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def _get_report(self, report_id, user):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return None, Response({'detail': '報告が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        if user.role == 'customer' and report.user_id != user.id:
            return None, Response({'detail': 'アクセス権限がありません'}, status=status.HTTP_403_FORBIDDEN)
        return report, None

    def get(self, request, report_id):
        report, err = self._get_report(report_id, request.user)
        if err:
            return err
        messages = Message.objects.filter(report=report)
        return Response(MessageSerializer(messages, many=True).data)

    def post(self, request, report_id):
        report, err = self._get_report(report_id, request.user)
        if err:
            return err
        msg = Message.objects.create(
            report=report,
            sender=request.user,
            content=request.data.get('content', ''),
        )
        return Response(MessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class UnreadSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role in ('admin', 'maker'):
            report_ids = Report.objects.values_list('id', flat=True)
        else:
            report_ids = Report.objects.filter(user=user).values_list('id', flat=True)

        result = []
        for rid in report_ids:
            latest = (
                Message.objects.filter(report_id=rid)
                .exclude(sender=user)
                .order_by('-id')
                .first()
            )
            if latest:
                result.append({
                    'report_id': rid,
                    'latest_message_id': latest.id,
                    'preview': latest.content[:50],
                    'sender_name': latest.sender.username if latest.sender else '不明',
                    'latest_at': latest.created_at.strftime('%Y-%m-%d %H:%M:%S'),
                })
        return Response(result)


# ── 確認項目 ──────────────────────────────────────────────────────

class CheckItemListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        machine_name = request.query_params.get('machine_name')
        qs = CheckItem.objects.all()
        if machine_name:
            qs = qs.filter(
                machine_name=machine_name
            ) | qs.filter(machine_name__isnull=True)
        return Response(CheckItemSerializer(qs, many=True).data)

    def post(self, request):
        if request.user.role not in ('admin', 'maker'):
            return Response({'detail': 'スタッフ権限が必要です'}, status=status.HTTP_403_FORBIDDEN)
        serializer = CheckItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = CheckItem.objects.create(
            content=serializer.validated_data['content'],
            machine_name=serializer.validated_data.get('machine_name') or None,
            order_index=serializer.validated_data.get('order_index', 0),
        )
        return Response(CheckItemSerializer(item).data, status=status.HTTP_201_CREATED)


class CheckItemMachinesView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        check_machines = set(
            CheckItem.objects.exclude(machine_name__isnull=True)
            .values_list('machine_name', flat=True)
        )
        report_machines = set(Report.objects.values_list('machine_name', flat=True))
        return Response(sorted(check_machines | report_machines))


class CheckItemDedupView(APIView):
    permission_classes = [IsAuthenticated, IsStaff]

    def delete(self, request):
        all_items = CheckItem.objects.order_by('id')
        seen: set[tuple] = set()
        deleted = 0
        for item in all_items:
            key = (item.content.strip(), item.machine_name)
            if key in seen:
                item.delete()
                deleted += 1
            else:
                seen.add(key)
        return Response({'deleted': deleted})


class CheckItemDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, item_id):
        if request.user.role not in ('admin', 'maker'):
            return Response({'detail': 'スタッフ権限が必要です'}, status=status.HTTP_403_FORBIDDEN)
        try:
            item = CheckItem.objects.get(pk=item_id)
        except CheckItem.DoesNotExist:
            return Response({'detail': '項目が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CheckItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item.content = serializer.validated_data['content']
        item.machine_name = serializer.validated_data.get('machine_name') or None
        item.order_index = serializer.validated_data.get('order_index', 0)
        item.save()
        return Response(CheckItemSerializer(item).data)

    def delete(self, request, item_id):
        if request.user.role not in ('admin', 'maker'):
            return Response({'detail': 'スタッフ権限が必要です'}, status=status.HTTP_403_FORBIDDEN)
        try:
            item = CheckItem.objects.get(pk=item_id)
        except CheckItem.DoesNotExist:
            return Response({'detail': '項目が見つかりません'}, status=status.HTTP_404_NOT_FOUND)
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ── AI インタビュー ───────────────────────────────────────────────

SYSTEM_PROMPT = """あなたは工場の異常報告システムのAIアシスタントです。
お客様から異常報告に必要な情報を日本語で丁寧にヒアリングしてください。

収集する情報（順番通りに1つずつ聞いてください）：
1. 機器名（例：ポンプA、コンベアB-3）
2. 発生場所（例：第1工場 B棟 2F）
3. 異常の内容・症状（できるだけ詳しく）
4. 重要度の自動判断（症状から判断し、確認する）

ルール：
- 一度に1つの質問のみ
- 丁寧・簡潔に
- すべての情報が揃ったら、以下のJSONのみを返してください（前後に一切のテキストを含めないこと）：
{"type":"complete","machine_name":"機器名","location":"場所","description":"詳細な症状","severity":"high|medium|low"}

severity の基準：
- high: 生産停止・安全リスク・即時対応が必要
- medium: 早期対応が必要だが継続稼働可能
- low: 経過観察で問題ない軽微な異常"""


class AIInterviewSuggestionsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        reports = Report.objects.values_list('machine_name', 'location')
        machine_counts = Counter(r[0] for r in reports if r[0])
        location_counts = Counter(r[1] for r in reports if r[1])
        return Response({
            'machine_names': [name for name, _ in machine_counts.most_common(8)],
            'locations': [loc for loc, _ in location_counts.most_common(8)],
        })


class AIInterviewView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        api_key = os.environ.get('GROQ_API_KEY', '')
        if not api_key:
            return Response(
                {'detail': 'AI機能が設定されていません（GROQ_API_KEY が未設定です）'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        from groq import Groq
        client = Groq(api_key=api_key)

        system_prompt = SYSTEM_PROMPT
        check_context = request.data.get('check_context')
        if check_context:
            system_prompt += f'\n\n【事前確認結果】\n{check_context}\n上記の確認結果を踏まえてヒアリングしてください。'

        messages = [{'role': 'system', 'content': system_prompt}]
        for m in request.data.get('messages', []):
            messages.append({'role': m['role'], 'content': m['content']})

        response = client.chat.completions.create(
            model='llama-3.3-70b-versatile',
            max_tokens=1024,
            messages=messages,
        )
        text = (response.choices[0].message.content or '').strip()

        try:
            json_match = re.search(r'\{[^{}]*"type"\s*:\s*"complete"[^{}]*\}', text, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
                if data.get('type') == 'complete':
                    return Response({
                        'content': 'ありがとうございました。報告書を作成します...',
                        'complete': True,
                        'report_data': {
                            'machine_name': data['machine_name'],
                            'location': data['location'],
                            'description': data['description'],
                            'severity': data.get('severity', 'medium'),
                        },
                    })
        except (json.JSONDecodeError, KeyError):
            pass

        return Response({'content': text, 'complete': False, 'report_data': None})
