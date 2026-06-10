from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Django標準の AbstractUser を拡張したカスタムユーザーモデル。

    【工夫点】
    AbstractUser を継承することで、password のハッシュ化・ログイン処理・
    管理画面連携などの機能をゼロから作らずに引き継げる。
    自分で追加したのは role と company_name の2フィールドだけ。

    【工夫点】
    USERNAME_FIELD = 'email' にすることで、ログインIDをメールアドレスにしている。
    Djangoのデフォルトはusernameだが、現場では「メールでログイン」の方が自然。
    """

    # ロールの選択肢を定数として定義しておくことで、タイポを防ぎ変更も一箇所で済む
    ROLES = [('admin', 'Admin'), ('maker', 'Maker'), ('customer', 'Customer')]

    # unique=True でメールアドレスの重複登録を禁止する
    email = models.EmailField(unique=True)

    # admin: 管理者, maker: メーカー技術者, customer: お客さん（現場作業員）
    role = models.CharField(max_length=20, choices=ROLES, default='customer')

    # 任意項目。お客さんがどの会社か識別するために使う。
    company_name = models.CharField(max_length=200, blank=True, null=True)

    # ログインIDをメールアドレスに変更する
    USERNAME_FIELD = 'email'

    # createsuperuser コマンド実行時に追加で要求するフィールド
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
