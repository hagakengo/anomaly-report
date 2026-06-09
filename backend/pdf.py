"""PDF 生成モジュール。
ReportLab を使って異常報告書を A4 サイズで生成する。

日本語フォントの問題：
PDF には使用するフォントを埋め込む必要がある。
ReportLab のデフォルトフォント（Helvetica など）は日本語に対応していないため、
日本語対応フォントを別途登録しないと文字化けする。

解決策：IPAex ゴシック（ipaexg.ttf）をリポジトリに同梱した。
IPA（情報処理推進機構）が無償公開しているフォントで、
商用・非商用問わず使用・配布が自由（IPA フォントライセンス）。
バンドル（同梱）することで、macOS / Windows / Linux / Docker どの環境でも
同じフォントが使われ、文字化けを防げる。
"""

import io
import os
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from database import Report


def _register_japanese_font() -> str:
    """日本語フォントを登録して、使用するフォント名を返す。
    候補リストを上から順に試し、最初に見つかったものを採用する。
    すべて見つからない場合は Helvetica（文字化けするが例外は出ない）を返す。

    バンドルフォントを最優先にすることで、
    サーバー環境（Linux / Docker）でも確実に日本語が表示される。"""
    candidates = [
        # バンドルフォント（最優先）: このファイルと同じディレクトリに置いた ipaexg.ttf
        (os.path.join(os.path.dirname(__file__), "ipaexg.ttf"), "IPAexGothic"),
        # macOS 環境
        ("/System/Library/Fonts/ヒラギノ角ゴ ProN W3.ttc", "HiraginoKaku"),
        ("/System/Library/Fonts/Hiragino Sans GB.ttc", "HiraginoSansGB"),
        # Windows 環境
        ("c:/Windows/Fonts/meiryo.ttc", "Meiryo"),
        ("c:/Windows/Fonts/msgothic.ttc", "MSGothic"),
        ("c:/Windows/Fonts/YuGothM.ttc", "YuGothic"),
        # Linux（apt でインストールした場合）
        ("/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf", "IPAGothic"),
        ("/usr/share/fonts/truetype/fonts-japanese-gothic.ttf", "JapaneseGothic"),
    ]
    for path, name in candidates:
        if os.path.exists(path):
            try:
                pdfmetrics.registerFont(TTFont(name, path))
                return name
            except Exception:
                continue  # 読み込みに失敗したら次の候補へ
    return "Helvetica"  # フォールバック（日本語は文字化けするが動作は継続）


# モジュールロード時に1回だけフォントを登録する（リクエストのたびに登録するのは非効率）。
FONT = _register_japanese_font()

# 重要度・ステータスの表示ラベル変換テーブル
SEVERITY_LABEL = {"high": "高", "medium": "中", "low": "低"}
STATUS_LABEL = {"open": "未対応", "in_progress": "対応中", "resolved": "解決済み"}
SEVERITY_COLOR = {
    "high": colors.HexColor("#ef4444"),   # 赤
    "medium": colors.HexColor("#f97316"), # オレンジ
    "low": colors.HexColor("#22c55e"),    # 緑
}


def generate_pdf(report: Report) -> bytes:
    """報告書を PDF として生成し、バイト列で返す。
    呼び出し元はバイト列を HTTP レスポンスとして返すだけでよい。

    ReportLab の Platypus（高レベル API）を使っている理由：
    低レベル Canvas API だと座標計算を自分でやる必要があるが、
    Platypus の SimpleDocTemplate を使うと要素を積み上げるだけでレイアウトが決まる。
    """
    # メモリ上にバイトストリームを作成してファイルI/Oを避ける
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=20 * mm,
        rightMargin=20 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
    )

    # スタイルの定義
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", fontName=FONT, fontSize=16, leading=22, spaceAfter=6
    )
    label_style = ParagraphStyle(
        "label", fontName=FONT, fontSize=9, textColor=colors.HexColor("#6b7280")
    )
    body_style = ParagraphStyle(
        "body", fontName=FONT, fontSize=11, leading=16
    )

    # story（要素のリスト）に追加した順番で PDF に積み上げられる
    story = []

    story.append(Paragraph("異常報告書", title_style))
    story.append(Spacer(1, 4 * mm))

    # 基本情報テーブル
    sev_color = SEVERITY_COLOR.get(report.severity, colors.gray)
    info_data = [
        ["報告ID", f"#{report.id}", "報告日時", report.reported_at],
        ["機器名", report.machine_name, "発生場所", report.location],
        [
            "重要度",
            report.severity.upper() + f"（{SEVERITY_LABEL.get(report.severity, '')}）",
            "ステータス",
            STATUS_LABEL.get(report.status, report.status),
        ],
    ]
    # colWidths は左から [ラベル列, 値列, ラベル列, 値列] の幅。合計 170mm（A4幅 - 左右余白 40mm）
    col_widths = [30 * mm, 65 * mm, 30 * mm, 45 * mm]
    tbl = Table(info_data, colWidths=col_widths)
    tbl.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), FONT),
                ("FONTSIZE", (0, 0), (-1, -1), 10),
                # ラベル列（0列目・2列目）を薄いグレーで塗る
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f3f4f6")),
                ("BACKGROUND", (2, 0), (2, -1), colors.HexColor("#f3f4f6")),
                ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#374151")),
                ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#374151")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d1d5db")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                # 重要度の値セル（行2・列1）の文字色を severity に合わせる
                ("TEXTCOLOR", (1, 2), (1, 2), sev_color),
                ("FONTNAME", (1, 2), (1, 2), FONT),
            ]
        )
    )
    story.append(tbl)
    story.append(Spacer(1, 6 * mm))

    # 異常内容（改行を <br/> タグに変換することで Paragraph が折り返しを再現する）
    story.append(Paragraph("異常内容", label_style))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(report.description.replace("\n", "<br/>"), body_style))
    story.append(Spacer(1, 8 * mm))

    # 添付画像（画像ファイルの場合だけ埋め込む）
    if report.file_path and report.file_type == "image" and os.path.exists(report.file_path):
        story.append(Paragraph("添付画像", label_style))
        story.append(Spacer(1, 2 * mm))
        try:
            max_w = 150 * mm
            max_h = 100 * mm
            # kind="proportional" でアスペクト比を維持したまま max サイズに収める
            img = Image(report.file_path, width=max_w, height=max_h, kind="proportional")
            story.append(img)
        except Exception:
            story.append(Paragraph("（画像の読み込みに失敗しました）", body_style))
    elif report.file_path and report.file_type == "video":
        # 動画は PDF に埋め込めないため、ファイル名だけ記載する
        story.append(Paragraph("添付ファイル", label_style))
        story.append(Spacer(1, 2 * mm))
        story.append(
            Paragraph(
                f"動画ファイル: {os.path.basename(report.file_path)}（PDFには埋め込めません）",
                body_style,
            )
        )

    doc.build(story)
    return buf.getvalue()
