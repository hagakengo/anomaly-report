import io
import os

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

BASE_DIR = os.path.dirname(os.path.dirname(__file__))


def _register_japanese_font() -> str:
    """
    日本語フォントを環境に応じて自動で選択・登録する。

    【工夫点】
    Mac / Windows / Linux / サーバー（Railway）など環境によってフォントの場所が異なる。
    複数の候補パスを上から試し、存在するものを使うことで環境依存を解消している。
    どれも見つからない場合は英字フォント 'Helvetica' にフォールバックする
    （日本語が豆腐になるが、クラッシュよりはマシな選択）。
    """
    candidates = [
        (os.path.join(BASE_DIR, 'ipaexg.ttf'), 'IPAexGothic'),         # プロジェクト同梱フォント（最優先）
        ('/System/Library/Fonts/ヒラギノ角ゴ ProN W3.ttc', 'HiraginoKaku'),  # Mac
        ('c:/Windows/Fonts/meiryo.ttc', 'Meiryo'),                      # Windows
        ('/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf', 'IPAGothic'),  # Linux
    ]
    for path, name in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue
    return 'Helvetica'


# モジュール読み込み時に一度だけフォントを登録する（リクエストのたびに登録しないための最適化）
FONT = _register_japanese_font()

# 重要度・ステータスの日本語ラベル変換テーブル
SEVERITY_LABEL = {'high': '高', 'medium': '中', 'low': '低'}
STATUS_LABEL   = {'open': '未対応', 'in_progress': '対応中', 'resolved': '解決済み'}

# 重要度に応じた色（PDFの視認性を高めるため）
SEVERITY_COLOR = {
    'high':   colors.HexColor('#ef4444'),  # 赤
    'medium': colors.HexColor('#f97316'),  # オレンジ
    'low':    colors.HexColor('#22c55e'),  # 緑
}


def generate_pdf(report) -> bytes:
    """
    Report オブジェクトを受け取り、PDF のバイト列を返す。

    【工夫点】
    ファイルに書き出さず io.BytesIO（メモリ上のバッファ）に書き込むことで、
    ディスクI/Oを省略しレスポンスに直接渡せる。
    reportlab の SimpleDocTemplate + Platypus（story リスト）で
    要素を積み上げるように PDF を構成している。
    """

    # メモリ上にPDFを作成する（ディスクに保存しない）
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
    )

    # テキストスタイルの定義
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('title', fontName=FONT, fontSize=16, leading=22, spaceAfter=6)
    label_style = ParagraphStyle('label', fontName=FONT, fontSize=9,  textColor=colors.HexColor('#6b7280'))
    body_style  = ParagraphStyle('body',  fontName=FONT, fontSize=11, leading=16)

    # story = PDF に積み上げる要素のリスト（上から順に配置される）
    story = []
    story.append(Paragraph('異常報告書', title_style))
    story.append(Spacer(1, 4 * mm))

    # 日時の文字列変換（DB から datetime オブジェクトで来る場合に対応）
    reported_at = report.reported_at
    if hasattr(reported_at, 'strftime'):
        reported_at = reported_at.strftime('%Y-%m-%d %H:%M:%S')

    # 基本情報テーブル（2列×3行のグリッド）
    sev_color = SEVERITY_COLOR.get(report.severity, colors.gray)
    info_data = [
        ['報告ID',  f'#{report.id}',          '報告日時',   reported_at],
        ['機器名',  report.machine_name,        '発生場所',   report.location],
        ['重要度',  report.severity.upper() + f'（{SEVERITY_LABEL.get(report.severity, "")}）',
         'ステータス', STATUS_LABEL.get(report.status, report.status)],
    ]
    col_widths = [30 * mm, 65 * mm, 30 * mm, 45 * mm]
    tbl = Table(info_data, colWidths=col_widths)
    tbl.setStyle(TableStyle([
        ('FONTNAME',      (0, 0), (-1, -1), FONT),
        ('FONTSIZE',      (0, 0), (-1, -1), 10),
        ('BACKGROUND',    (0, 0), (0, -1),  colors.HexColor('#f3f4f6')),  # 左列（ラベル）の背景色
        ('BACKGROUND',    (2, 0), (2, -1),  colors.HexColor('#f3f4f6')),  # 3列目（ラベル）の背景色
        ('TEXTCOLOR',     (0, 0), (0, -1),  colors.HexColor('#374151')),
        ('TEXTCOLOR',     (2, 0), (2, -1),  colors.HexColor('#374151')),
        ('GRID',          (0, 0), (-1, -1), 0.5, colors.HexColor('#d1d5db')),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING',    (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING',   (0, 0), (-1, -1), 6),
        # 重要度の値セルだけ色を変えて視覚的に目立たせる
        ('TEXTCOLOR',     (1, 2), (1, 2),   sev_color),
        ('FONTNAME',      (1, 2), (1, 2),   FONT),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 6 * mm))

    # 異常内容（改行を <br/> に変換して Paragraph に渡す）
    story.append(Paragraph('異常内容', label_style))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(report.description.replace('\n', '<br/>'), body_style))
    story.append(Spacer(1, 8 * mm))

    # 添付ファイルの処理
    if report.file_path and report.file_type == 'image':
        full_path = os.path.join(settings.MEDIA_ROOT, report.file_path)
        if os.path.exists(full_path):
            story.append(Paragraph('添付画像', label_style))
            story.append(Spacer(1, 2 * mm))
            try:
                # kind='proportional' で縦横比を保ったままリサイズする
                img = Image(full_path, width=150 * mm, height=100 * mm, kind='proportional')
                story.append(img)
            except Exception:
                story.append(Paragraph('（画像の読み込みに失敗しました）', body_style))
    elif report.file_path and report.file_type == 'video':
        # 動画は PDF に埋め込めないためファイル名だけ記載する
        story.append(Paragraph('添付ファイル', label_style))
        story.append(Spacer(1, 2 * mm))
        story.append(Paragraph(
            f'動画ファイル: {os.path.basename(report.file_path)}（PDFには埋め込めません）',
            body_style,
        ))

    doc.build(story)

    # バッファの先頭から全バイトを取り出して返す
    return buf.getvalue()
