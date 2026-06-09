from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import User
from .models import CheckItem, Message, Report, StatusLog


# ── ヘルパー ──────────────────────────────────────────────────────

def make_user(email='user@test.com', username='ユーザー', password='pass1234',
              role='customer', company_name='テスト工場'):
    return User.objects.create_user(
        email=email, username=username, password=password,
        role=role, company_name=company_name,
    )


def auth_client(user, password='pass1234'):
    client = APIClient()
    res = client.post('/auth/login', {'email': user.email, 'password': password}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access_token"]}')
    return client


def make_report(user, **kwargs):
    return Report.objects.create(
        machine_name=kwargs.get('machine_name', 'ポンプA'),
        location=kwargs.get('location', '第1工場'),
        description=kwargs.get('description', '振動が激しい'),
        severity=kwargs.get('severity', 'medium'),
        user=user,
        company_name=user.company_name,
    )


# ── 報告 CRUD ──────────────────────────────────────────────────────

class ReportCreateTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')

    def test_customer_can_create_report(self):
        client = auth_client(self.customer)
        res = client.post('/reports', {
            'machine_name': 'ポンプA', 'location': '第1工場',
            'description': '異音がする', 'severity': 'high',
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['machine_name'], 'ポンプA')
        self.assertEqual(res.data['severity'], 'high')
        self.assertEqual(res.data['company_name'], 'テスト工場')

    def test_maker_cannot_create_report(self):
        client = auth_client(self.maker)
        res = client.post('/reports', {
            'machine_name': 'ポンプA', 'location': '第1工場',
            'description': '異音がする', 'severity': 'medium',
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_cannot_create(self):
        res = APIClient().post('/reports', {
            'machine_name': 'ポンプA', 'location': '第1工場',
            'description': '異音がする',
        }, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ReportListTest(TestCase):
    def setUp(self):
        self.customer1 = make_user()
        self.customer2 = make_user('other@test.com', '別ユーザー', 'pass1234',
                                   company_name='別工場')
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report1 = make_report(self.customer1)
        self.report2 = make_report(self.customer2)

    def test_customer_sees_only_own_reports(self):
        client = auth_client(self.customer1)
        res = client.get('/reports')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['id'], self.report1.id)

    def test_maker_sees_all_reports(self):
        client = auth_client(self.maker)
        res = client.get('/reports')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

    def test_filter_by_severity(self):
        make_report(self.customer1, severity='high')
        client = auth_client(self.maker)
        res = client.get('/reports?severity=high')
        self.assertTrue(all(r['severity'] == 'high' for r in res.data))

    def test_filter_by_machine_name(self):
        make_report(self.customer1, machine_name='コンベアB')
        client = auth_client(self.maker)
        res = client.get('/reports?machine_name=コンベア')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['machine_name'], 'コンベアB')


class ReportDetailTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.other = make_user('other@test.com', '他ユーザー', 'pass1234')
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_owner_can_get_report(self):
        client = auth_client(self.customer)
        res = client.get(f'/reports/{self.report.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_other_customer_cannot_get_report(self):
        client = auth_client(self.other)
        res = client.get(f'/reports/{self.report.id}')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_maker_can_get_any_report(self):
        client = auth_client(self.maker)
        res = client.get(f'/reports/{self.report.id}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_not_found(self):
        client = auth_client(self.customer)
        res = client.get('/reports/9999')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_maker_can_delete_report(self):
        client = auth_client(self.maker)
        res = client.delete(f'/reports/{self.report.id}')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Report.objects.filter(pk=self.report.id).exists())

    def test_customer_cannot_delete_report(self):
        client = auth_client(self.customer)
        res = client.delete(f'/reports/{self.report.id}')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ReportStatusUpdateTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_maker_can_change_status(self):
        client = auth_client(self.maker)
        res = client.patch(f'/reports/{self.report.id}', {'status': 'in_progress'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'in_progress')

    def test_status_change_creates_log(self):
        client = auth_client(self.maker)
        client.patch(f'/reports/{self.report.id}', {'status': 'resolved'}, format='json')
        log = StatusLog.objects.filter(report=self.report).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.old_status, 'open')
        self.assertEqual(log.new_status, 'resolved')

    def test_same_status_does_not_create_log(self):
        client = auth_client(self.maker)
        client.patch(f'/reports/{self.report.id}', {'status': 'open'}, format='json')
        self.assertEqual(StatusLog.objects.filter(report=self.report).count(), 0)

    def test_customer_cannot_change_status(self):
        client = auth_client(self.customer)
        res = client.patch(f'/reports/{self.report.id}', {'status': 'resolved'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ReportAssignTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_assign_maker(self):
        client = auth_client(self.maker)
        res = client.patch(
            f'/reports/{self.report.id}/assign',
            {'assignee_id': self.maker.id},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['assignee_id'], self.maker.id)
        self.assertEqual(res.data['assignee_name'], 'メーカー')

    def test_unassign(self):
        self.report.assignee = self.maker
        self.report.assignee_name = self.maker.username
        self.report.save()

        client = auth_client(self.maker)
        res = client.patch(
            f'/reports/{self.report.id}/assign',
            {'assignee_id': None},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsNone(res.data['assignee_id'])

    def test_customer_cannot_assign(self):
        client = auth_client(self.customer)
        res = client.patch(
            f'/reports/{self.report.id}/assign',
            {'assignee_id': self.maker.id},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class ReportStatsTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        make_report(self.customer, severity='high')
        make_report(self.customer, severity='low')

    def test_stats_shape(self):
        client = auth_client(self.maker)
        res = client.get('/reports/stats')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('monthly', res.data)
        self.assertIn('by_severity', res.data)
        self.assertEqual(res.data['by_severity']['high'], 1)
        self.assertEqual(res.data['by_severity']['low'], 1)

    def test_customer_sees_only_own_stats(self):
        other = make_user('other@test.com', '他ユーザー', 'pass1234')
        make_report(other, severity='high')
        client = auth_client(self.customer)
        res = client.get('/reports/stats')
        total = sum(res.data['by_severity'].values())
        self.assertEqual(total, 2)


class ReportRecurrenceTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.report = make_report(self.customer, machine_name='ポンプA')

    def test_no_recurrence(self):
        client = auth_client(self.customer)
        res = client.get(f'/reports/{self.report.id}/recurrence')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['count'], 0)

    def test_with_recurrence(self):
        make_report(self.customer, machine_name='ポンプA')
        client = auth_client(self.customer)
        res = client.get(f'/reports/{self.report.id}/recurrence')
        self.assertEqual(res.data['count'], 1)


class ReportStatusLogsTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_logs_empty_initially(self):
        client = auth_client(self.customer)
        res = client.get(f'/reports/{self.report.id}/status-logs')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 0)

    def test_logs_after_status_change(self):
        client = auth_client(self.maker)
        client.patch(f'/reports/{self.report.id}', {'status': 'in_progress'}, format='json')
        res = client.get(f'/reports/{self.report.id}/status-logs')
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['changed_by'], 'メーカー')


# ── チャット ──────────────────────────────────────────────────────

class MessageTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_customer_can_send_message(self):
        client = auth_client(self.customer)
        res = client.post(
            f'/reports/{self.report.id}/messages',
            {'content': '状況を教えてください'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['content'], '状況を教えてください')
        self.assertEqual(res.data['sender_name'], 'ユーザー')

    def test_list_messages(self):
        Message.objects.create(report=self.report, sender=self.customer, content='メッセージ1')
        Message.objects.create(report=self.report, sender=self.maker, content='メッセージ2')
        client = auth_client(self.customer)
        res = client.get(f'/reports/{self.report.id}/messages')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 2)

    def test_other_customer_cannot_access_messages(self):
        other = make_user('other@test.com', '他ユーザー', 'pass1234')
        client = auth_client(other)
        res = client.get(f'/reports/{self.report.id}/messages')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


class UnreadSummaryTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        self.report = make_report(self.customer)

    def test_unread_summary_shows_others_messages(self):
        Message.objects.create(report=self.report, sender=self.maker, content='ご確認ください')
        client = auth_client(self.customer)
        res = client.get('/messages/unread-summary')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['sender_name'], 'メーカー')

    def test_own_messages_not_in_summary(self):
        Message.objects.create(report=self.report, sender=self.customer, content='自分のメッセージ')
        client = auth_client(self.customer)
        res = client.get('/messages/unread-summary')
        self.assertEqual(len(res.data), 0)


# ── 確認項目 ──────────────────────────────────────────────────────

class CheckItemTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')

    def test_maker_can_create_check_item(self):
        client = auth_client(self.maker)
        res = client.post('/check-items', {
            'content': '電源確認', 'machine_name': 'ポンプA', 'order_index': 0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['content'], '電源確認')

    def test_customer_cannot_create_check_item(self):
        client = auth_client(self.customer)
        res = client.post('/check-items', {
            'content': '電源確認', 'order_index': 0,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_filter_by_machine_name_includes_common(self):
        CheckItem.objects.create(content='共通確認', machine_name=None, order_index=0)
        CheckItem.objects.create(content='ポンプ専用', machine_name='ポンプA', order_index=1)
        CheckItem.objects.create(content='コンベア専用', machine_name='コンベアB', order_index=1)
        client = auth_client(self.customer)
        res = client.get('/check-items?machine_name=ポンプA')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        contents = [i['content'] for i in res.data]
        self.assertIn('共通確認', contents)
        self.assertIn('ポンプ専用', contents)
        self.assertNotIn('コンベア専用', contents)

    def test_machines_list(self):
        CheckItem.objects.create(content='確認', machine_name='ポンプA', order_index=0)
        make_report(self.customer, machine_name='コンベアB')
        client = auth_client(self.customer)
        res = client.get('/check-items/machines')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('ポンプA', res.data)
        self.assertIn('コンベアB', res.data)

    def test_dedup_removes_duplicates(self):
        CheckItem.objects.create(content='電源確認', machine_name='ポンプA', order_index=0)
        CheckItem.objects.create(content='電源確認', machine_name='ポンプA', order_index=0)
        CheckItem.objects.create(content='電源確認', machine_name='ポンプA', order_index=0)
        client = auth_client(self.maker)
        res = client.delete('/check-items/dedup')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['deleted'], 2)
        self.assertEqual(CheckItem.objects.count(), 1)

    def test_maker_can_delete_check_item(self):
        item = CheckItem.objects.create(content='確認', order_index=0)
        client = auth_client(self.maker)
        res = client.delete(f'/check-items/{item.id}')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)


# ── AI インタビュー ───────────────────────────────────────────────

class AIInterviewSuggestionsTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        make_report(self.customer, machine_name='ポンプA', location='第1工場')
        make_report(self.customer, machine_name='ポンプA', location='第2工場')
        make_report(self.customer, machine_name='コンベアB', location='第1工場')

    def test_suggestions_returns_sorted_by_frequency(self):
        client = auth_client(self.customer)
        res = client.get('/ai-interview/suggestions')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['machine_names'][0], 'ポンプA')
        self.assertIn('第1工場', res.data['locations'])


class AIInterviewTest(TestCase):
    def setUp(self):
        self.customer = make_user()

    def test_no_api_key_returns_503(self):
        client = auth_client(self.customer)
        with patch.dict('os.environ', {'GROQ_API_KEY': ''}):
            res = client.post('/ai-interview', {
                'messages': [{'role': 'user', 'content': 'ポンプが壊れました'}],
            }, format='json')
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)

    def test_groq_response_is_proxied(self):
        client = auth_client(self.customer)
        mock_response = type('R', (), {
            'choices': [type('C', (), {
                'message': type('M', (), {'content': 'どの機器ですか？'})()
            })()]
        })()
        with patch.dict('os.environ', {'GROQ_API_KEY': 'dummy'}):
            with patch('groq.Groq') as MockGroq:
                MockGroq.return_value.chat.completions.create.return_value = mock_response
                res = client.post('/ai-interview', {
                    'messages': [{'role': 'user', 'content': '機器が故障しました'}],
                }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['content'], 'どの機器ですか？')
        self.assertFalse(res.data['complete'])

    def test_complete_json_triggers_report_data(self):
        client = auth_client(self.customer)
        complete_json = (
            '{"type":"complete","machine_name":"ポンプA",'
            '"location":"第1工場","description":"振動","severity":"high"}'
        )
        mock_response = type('R', (), {
            'choices': [type('C', (), {
                'message': type('M', (), {'content': complete_json})()
            })()]
        })()
        with patch.dict('os.environ', {'GROQ_API_KEY': 'dummy'}):
            with patch('groq.Groq') as MockGroq:
                MockGroq.return_value.chat.completions.create.return_value = mock_response
                res = client.post('/ai-interview', {
                    'messages': [{'role': 'user', 'content': '完了'}],
                }, format='json')
        self.assertTrue(res.data['complete'])
        self.assertEqual(res.data['report_data']['machine_name'], 'ポンプA')
        self.assertEqual(res.data['report_data']['severity'], 'high')
