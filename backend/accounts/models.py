from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    ROLES = [('admin', 'Admin'), ('maker', 'Maker'), ('customer', 'Customer')]

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=ROLES, default='customer')
    company_name = models.CharField(max_length=200, blank=True, null=True)

    USERNAME_FIELD = 'email'
    # username は AbstractUser が持つフィールドをそのまま使う（表示名として利用）
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
