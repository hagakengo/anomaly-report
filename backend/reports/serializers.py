from rest_framework import serializers

from .models import CheckItem, Message, Report, StatusLog


class ReportSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True)
    assignee_id = serializers.IntegerField(read_only=True, allow_null=True)
    reported_at = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'machine_name', 'location', 'description', 'severity', 'status',
            'file_path', 'file_type', 'company_name', 'reported_at',
            'user_id', 'assignee_id', 'assignee_name',
        ]


class MessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(read_only=True)
    sender_name = serializers.SerializerMethodField()
    report_id = serializers.IntegerField(read_only=True)
    created_at = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)

    class Meta:
        model = Message
        fields = ['id', 'report_id', 'sender_id', 'sender_name', 'content', 'created_at']

    def get_sender_name(self, obj):
        return obj.sender.username if obj.sender else '不明'


class CheckItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = CheckItem
        fields = ['id', 'content', 'machine_name', 'order_index']


class StatusLogSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(read_only=True, allow_null=True)
    changed_by = serializers.SerializerMethodField()
    report_id = serializers.IntegerField(read_only=True)
    changed_at = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)

    class Meta:
        model = StatusLog
        fields = ['id', 'report_id', 'user_id', 'changed_by', 'old_status', 'new_status', 'changed_at']

    def get_changed_by(self, obj):
        return obj.user.username if obj.user else 'システム'
