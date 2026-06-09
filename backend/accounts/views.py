from django.contrib.auth import authenticate
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from .models import User
from .serializers import LoginSerializer, SignupSerializer, UserSerializer


def _token_response(user) -> dict:
    token = str(RefreshToken.for_user(user).access_token)
    return {
        'access_token': token,
        'token_type': 'bearer',
        'role': user.role,
        'username': user.username,
        'user_id': user.id,
    }


class SignupView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, role='customer'):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if User.objects.filter(email=data['email']).exists():
            return Response(
                {'detail': 'このメールアドレスは既に使用されています'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            email=data['email'],
            username=data['username'],
            password=data['password'],
            role=role,
            company_name=data.get('company_name') or None,
        )
        return Response(_token_response(user), status=status.HTTP_201_CREATED)


class SignupMakerView(SignupView):
    def post(self, request):
        return super().post(request, role='maker')


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = authenticate(request, username=data['email'], password=data['password'])
        if not user:
            return Response(
                {'detail': 'メールアドレスまたはパスワードが間違っています'},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        return Response(_token_response(user))


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class StaffListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        staff = User.objects.filter(role__in=['admin', 'maker'])
        return Response(UserSerializer(staff, many=True).data)
