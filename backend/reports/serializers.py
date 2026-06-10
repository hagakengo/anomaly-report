from rest_framework import serializers

from .models import CheckItem, Message, Report, StatusLog


class ReportSerializer(serializers.ModelSerializer):
    """
    報告データをJSONに変換するシリアライザー。

    【工夫点】
    user_id / assignee_id は ForeignKey だが、フロントに返すのは ID だけでよい。
    read_only=True にすることで受け取りには使わず、返却専用フィールドにしている。
    reported_at はフォーマットを統一することでフロントの日時パースを容易にする。
    """

    user_id     = serializers.IntegerField(read_only=True)
    assignee_id = serializers.IntegerField(read_only=True, allow_null=True)

    # '%Y-%m-%d %H:%M:%S' 形式に統一。フロントで new Date() に渡しやすい。
    reported_at = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)

    class Meta:
        model = Report
        fields = [
            'id', 'machine_name', 'location', 'description', 'severity', 'status',
            'file_path', 'file_type', 'company_name', 'reported_at',
            'user_id', 'assignee_id', 'assignee_name',
        ]


class MessageSerializer(serializers.ModelSerializer):
    """
    チャットメッセージのシリアライザー。

    【工夫点】
    sender_name は ForeignKey 先のフィールドなので、
    SerializerMethodField で get_sender_name() を定義して取得している。
    送信者が削除済みの場合は '不明' を返してエラーにしない。
    """

    sender_id   = serializers.IntegerField(read_only=True)
    report_id   = serializers.IntegerField(read_only=True)
    created_at  = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)

    # 関連モデルのフィールドを返すカスタムフィールド。get_〇〇() メソッドと対応する。
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'report_id', 'sender_id', 'sender_name', 'content', 'created_at']

    def get_sender_name(self, obj):
        # sender が None（退会済みユーザー）の場合でも安全に処理する
        return obj.sender.username if obj.sender else '不明'


class CheckItemSerializer(serializers.ModelSerializer):
    """確認項目のシリアライザー。シンプルな CRUD 用途なので最小限の定義。"""

    class Meta:
        model = CheckItem
        fields = ['id', 'content', 'machine_name', 'order_index']


class StatusLogSerializer(serializers.ModelSerializer):
    """
    ステータス変更履歴のシリアライザー。

    【工夫点】
    changed_by は「誰が変えたか」を名前で返すカスタムフィールド。
    user が削除済みの場合は 'システム' と表示してエラーにしない。
    """

    user_id    = serializers.IntegerField(read_only=True, allow_null=True)
    report_id  = serializers.IntegerField(read_only=True)
    changed_at = serializers.DateTimeField(format='%Y-%m-%d %H:%M:%S', read_only=True)
    changed_by = serializers.SerializerMethodField()

    class Meta:
        model = StatusLog
        fields = ['id', 'report_id', 'user_id', 'changed_by', 'old_status', 'new_status', 'changed_at']

    def get_changed_by(self, obj):
        return obj.user.username if obj.user else 'システム'
