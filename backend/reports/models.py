from django.conf import settings
from django.db import models
from django.utils import timezone


class Report(models.Model):
    """
    異常報告の本体テーブル。
    このアプリの中心となるデータで、1行＝1件の異常報告を表す。
    """

    # 機器名・場所・内容は必須項目（blank/nullを指定していないので空にできない）
    machine_name = models.CharField(max_length=200)
    location     = models.CharField(max_length=200)

    # TextField は CharField と違い文字数の上限がない。長文の説明文に使う。
    description = models.TextField()

    #重要度。high/medium/low の3段階。デフォルトは medium にしておく
    #入力漏れがあっても「中程度」として扱われ、報告が握り潰されにくい。
    severity = models.CharField(max_length=20, default='medium')

    # デフォルトを open にすることで、登録直後は「未対応」として表示される。
    status = models.CharField(max_length=20, default='open')

    # 添付ファイル。任意項目なので blank=True、null=True(必須項目ではない)
    # file_path はサーバー上の保存パスを保持する。
    file_path = models.CharField(max_length=500, blank=True, null=True)
    #file_type は image/videoの種別を保持する。
    file_type = models.CharField(max_length=20, blank=True, null=True)

    # 報告作成時にユーザーの company_name をコピーして保存する。（会社名は必須項目ではない）
    company_name = models.CharField(max_length=200, blank=True, null=True)

    # 報告日時。DateTimeFieldを使うとデフォルトで現在時刻が入る。auto_now_add と違い手動でも上書き可能。
    reported_at = models.DateTimeField(default=timezone.now)

    # 報告者（お客さん）。ユーザーが退会してもレポートを残したい
    # on_delete=SET_NULL にしている（CASCADE だとユーザー削除時に報告も消えてしまう）。
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='reports',        
    )

    # 担当者（メーカー側）。任意なので blank=True。
    # SET_NULL により担当者が退会しても報告は残る。
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_reports',
    )

    # 担当者名を文字列でも保存しておく。
    # assignee（外部キー）だけだとユーザー削除後に名前が表示できなくなる
    assignee_name = models.CharField(max_length=200, blank=True, null=True)

    class Meta:
        db_table = 'reports'
        # '-' を付けると降順。新しい報告が一覧の上に来るようにする。
        ordering = ['-reported_at']


class Message(models.Model):
    #報告ごとのチャットメッセージ。
    #お客さんとメーカーが1つの報告スレッド内でやり取りするためのテーブル。
    

    # どの報告のメッセージかを紐付ける。
    # CASCADE にすることで報告が削除されたらメッセージも一緒に消える。
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='messages')

    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )

    content    = models.TextField()
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'messages'
        # メッセージは古い順に並べる（created_atを使うことで降順になる)
        ordering = ['created_at']

  #報告前にユーザーが確認すべきチェックリスト項目。
class CheckItem(models.Model):
    
    #メーカー側が設定し、報告フォームで表示される。
    #machine_name を null にすることで「全機器共通の確認項目」を表現している。
    #特定機器向けの項目と共通項目を1つのテーブルで管理できるシンプルな設計。
    

    content = models.CharField(max_length=500)

    # null = 全機器共通、値あり = その機器専用
    machine_name = models.CharField(max_length=200, blank=True, null=True)

    # チェック項目の表示を小さい数字が先に表示する。
    order_index = models.IntegerField(default=0)

    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'check_items'
        # 機器名でグループ化し、その中で order_index 順に並べる
        ordering = ['machine_name', 'order_index', 'id']

    #報告ステータスの変更履歴（監査ログ）。
    #「誰がいつ、何から何にステータスを変えたか」を記録する。
class StatusLog(models.Model):
    
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name='status_logs')

    # 誰が変更したかを記録。SET_NULL にしてユーザー削除後もログを残す。
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )

    old_status = models.CharField(max_length=20)  # 変更前のステータス
    new_status = models.CharField(max_length=20)  # 変更後のステータス
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'status_logs'
        # 時系列順に並べることで変更の流れを追いやすくする
        ordering = ['changed_at']
