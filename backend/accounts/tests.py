from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import User


def make_user(email='user@test.com', username='ユーザー', password='pass1234',
              role='customer', company_name='テスト工場'):
    return User.objects.create_user(
        email=email, username=username, password=password,
        role=role, company_name=company_name,
    )


def auth_client(user):
    client = APIClient()
    res = client.post('/auth/login', {'email': user.email, 'password': 'pass1234'}, format='json')
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {res.data["access_token"]}')
    return client


class SignupTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_signup_customer(self):
        res = self.client.post('/auth/signup', {
            'email': 'new@test.com', 'username': '新規', 'password': 'pass1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('access_token', res.data)
        self.assertEqual(res.data['role'], 'customer')

    def test_signup_maker(self):
        res = self.client.post('/auth/signup/maker', {
            'email': 'maker@test.com', 'username': 'メーカー', 'password': 'pass1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['role'], 'maker')

    def test_signup_duplicate_email(self):
        make_user()
        res = self.client.post('/auth/signup', {
            'email': 'user@test.com', 'username': '別ユーザー', 'password': 'pass1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class LoginTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_login_success(self):
        res = self.client.post('/auth/login', {
            'email': 'user@test.com', 'password': 'pass1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access_token', res.data)
        self.assertEqual(res.data['username'], 'ユーザー')

    def test_login_wrong_password(self):
        res = self.client.post('/auth/login', {
            'email': 'user@test.com', 'password': 'wrong',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_unknown_email(self):
        res = self.client.post('/auth/login', {
            'email': 'nobody@test.com', 'password': 'pass1234',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class MeTest(TestCase):
    def test_me_authenticated(self):
        user = make_user()
        client = auth_client(user)
        res = client.get('/auth/me')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['email'], 'user@test.com')
        self.assertEqual(res.data['role'], 'customer')

    def test_me_unauthenticated(self):
        res = APIClient().get('/auth/me')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class StaffListTest(TestCase):
    def setUp(self):
        self.customer = make_user()
        self.maker = make_user('maker@test.com', 'メーカー', 'pass1234', role='maker')
        make_user('admin@test.com', '管理者', 'pass1234', role='admin')

    def test_staff_list_returns_only_staff(self):
        client = auth_client(self.customer)
        res = client.get('/auth/staff')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        roles = {u['role'] for u in res.data}
        self.assertNotIn('customer', roles)
        self.assertEqual(len(res.data), 2)
