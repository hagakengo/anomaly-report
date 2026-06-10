from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import LoginSerializer, SignupSerializer, UserSerializer


def _token_response(user) -> dict:
    """
    ログイン・登録成功時にフロントへ返すレスポンスデータを組み立てる。

    RefreshToken.for_user() で JWT を発行し、access_token だけを返す。
    refresh_token はセキュリティ上の理由から今回のアプリでは使用しない。
    role・username・user_id も一緒に返すことで、フロントが別途 /auth/me を
    叩かなくてもユーザー情報を即座に使えるようにしている。
    """
    token = str(RefreshToken.for_user(user).access_token)
    return {
        'access_token': token,
        'token_type': 'bearer',
        'role': user.role,
        'username': user.username,
        'user_id': user.id,
    }


class SignupView(APIView):
    """
    新規ユーザー登録エンドポイント（customer ロール）。
    POST /auth/signup

    AllowAny にすることで未ログインでもアクセスできる。
    登録成功時は即座に JWT を発行してログイン状態にする（UX向上）。
    """

    permission_classes = [AllowAny]

    def post(self, request, role='customer'):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)  # バリデーション失敗時は自動で400を返す
        data = serializer.validated_data

        # メールアドレスの重複チェック（DB のユニーク制約に頼らず先にチェックして丁寧なエラーを返す）
        if User.objects.filter(email=data['email']).exists():
            return Response(
                {'detail': 'このメールアドレスは既に使用されています'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            email=data['email'],
            username=data['username'],
            password=data['password'],   # create_user が自動でハッシュ化する
            role=role,
            company_name=data.get('company_name') or None,
        )
        return Response(_token_response(user), status=status.HTTP_201_CREATED)


class SignupMakerView(SignupView):
    """
    メーカー登録エンドポイント。
    POST /auth/signup/maker

    【工夫点】
    SignupView を継承して role='maker' を渡すだけ。
    共通ロジックをコピーせずに再利用できる。
    """

    def post(self, request):
        return super().post(request, role='maker')


class LoginView(APIView):
    """
    ログインエンドポイント。
    POST /auth/login

    Django の authenticate() はメールアドレス・パスワードを検証し、
    一致するユーザーオブジェクトを返す（失敗時は None）。
    """

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # authenticate はパスワードの照合（ハッシュ比較）も行う
        user = authenticate(request, username=data['email'], password=data['password'])
        if not user:
            return Response(
                {'detail': 'メールアドレスまたはパスワードが間違っています'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(_token_response(user))


class MeView(APIView):
    """
    ログイン中のユーザー自身の情報を返すエンドポイント。
    GET /auth/me

    フロントがページ読み込み時に「自分の role は何か」を確認するために使う。
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class StaffListView(APIView):
    """
    スタッフ（admin・maker）の一覧を返すエンドポイント。
    GET /auth/staff

    報告の担当者アサイン画面で「誰に割り当てるか」の選択肢として使う。
    customer は一覧に含めない。
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = User.objects.filter(role__in=['admin', 'maker'])
        return Response(UserSerializer(staff, many=True).data)
