from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """
    管理者（admin）のみアクセスを許可するパーミッション。

    BasePermission を継承して has_permission() を定義するのが DRF の作法。
    True を返せばアクセス許可、False を返すと自動で 403 Forbidden を返す。
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsStaff(BasePermission):
    """
    スタッフ（admin または maker）のみアクセスを許可するパーミッション。

    【工夫点】
    admin と maker をまとめて「スタッフ」として扱い、
    ステータス変更・担当者アサインなどの管理操作を制限するために使う。
    customer には操作させたくない箇所で permission_classes に指定する。
    """

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ('admin', 'maker')
