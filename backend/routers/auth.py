from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import User, get_db
from schemas import LoginRequest, SignupRequest, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _create_user(db: Session, data: SignupRequest, role: str) -> TokenOut:
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="このメールアドレスは既に使用されています")
    user = User(
        email=data.email,
        username=data.username,
        hashed_pw=hash_password(data.password),
        role=role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenOut(
        access_token=token,
        role=user.role,
        username=user.username,
        user_id=user.id,
    )


@router.post("/signup", response_model=TokenOut, status_code=201)
def signup(data: SignupRequest, db: Session = Depends(get_db)):
    return _create_user(db, data, role="customer")


@router.post("/signup/maker", response_model=TokenOut, status_code=201)
def signup_maker(data: SignupRequest, db: Session = Depends(get_db)):
    return _create_user(db, data, role="maker")


@router.post("/login", response_model=TokenOut)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_pw):
        raise HTTPException(
            status_code=401,
            detail="メールアドレスまたはパスワードが間違っています",
        )

    token = create_access_token({"sub": str(user.id), "role": user.role})
    return TokenOut(
        access_token=token,
        role=user.role,
        username=user.username,
        user_id=user.id,
    )


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/staff", response_model=list[UserOut])
def get_staff(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(User).filter(User.role.in_(["admin", "maker"])).all()
