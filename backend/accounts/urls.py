from django.urls import path

from . import views

# config/urls.py で path('auth/', include('accounts.urls')) と指定されているため
# ここで定義したパスは全て /auth/〇〇 というURLになる。
urlpatterns = [
    path('signup',       views.SignupView.as_view()),        # POST: 新規登録（customer）
    path('signup/maker', views.SignupMakerView.as_view()),   # POST: 新規登録（maker）
    path('login',        views.LoginView.as_view()),         # POST: ログイン
    path('me',           views.MeView.as_view()),            # GET:  自分の情報を取得
    path('staff',        views.StaffListView.as_view()),     # GET:  スタッフ一覧を取得
]
