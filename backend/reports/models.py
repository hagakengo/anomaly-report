from django.conf import settings
from django.db import models
from django.utils import timezone


class Report(models.Model):
    machine_name = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    description = models.TextField()
    severity = models.CharField(max_length=20, default='medium')
    status = models.CharField(max_length=20, default='open')
    file_path = models.CharField(max_length=500, blank=True, null=True)
    file_type = models.CharField(max_length=20, blank=True, null=True)
    company_name = models.CharField(max_length=200, blank=True, null=True)
    reported_at = models.DateTimeField(default=timezone.now)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='reports',
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_reports',
    )
    assignee_name = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'reports'
        ordering = ['-reported_at']


class Message(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    content = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'messages'
        ordering = ['created_at']


class CheckItem(models.Model):
    content = models.CharField(max_length=500)
    machine_name = models.CharField(max_length=200, blank=True, null=True)
    order_index = models.IntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'check_items'
        ordering = ['machine_name', 'order_index', 'id']


class StatusLog(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='status_logs')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'status_logs'
        ordering = ['changed_at']
