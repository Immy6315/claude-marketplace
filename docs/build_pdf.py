"""GR Reviewer Setup Guide — clean, professional, well-spaced PDF."""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, NextPageTemplate, HRFlowable
)

# ============ Brand palette ============
INK         = colors.HexColor("#0b1120")  # nearly black
INK_SOFT    = colors.HexColor("#1e293b")
TEXT        = colors.HexColor("#1f2937")
MUTED       = colors.HexColor("#64748b")
SUBTLE      = colors.HexColor("#94a3b8")
LINE        = colors.HexColor("#e5e7eb")
LINE_SOFT   = colors.HexColor("#f1f5f9")
SURFACE     = colors.HexColor("#fafbfc")
PAPER       = colors.white

PRIMARY     = colors.HexColor("#4f46e5")  # indigo 600
PRIMARY_DARK = colors.HexColor("#3730a3")
PRIMARY_SOFT = colors.HexColor("#eef2ff")
ACCENT      = colors.HexColor("#06b6d4")  # cyan 500

GREEN       = colors.HexColor("#059669")
GREEN_SOFT  = colors.HexColor("#ecfdf5")
GREEN_TXT   = colors.HexColor("#065f46")
AMBER       = colors.HexColor("#d97706")
AMBER_SOFT  = colors.HexColor("#fffbeb")
AMBER_TXT   = colors.HexColor("#92400e")
INFO        = colors.HexColor("#0284c7")
INFO_SOFT   = colors.HexColor("#f0f9ff")
INFO_TXT    = colors.HexColor("#075985")

CODE_BG     = colors.HexColor("#0f172a")
CODE_TXT    = colors.HexColor("#e2e8f0")
CODE_INLINE = colors.HexColor("#fdf2f8")
CODE_INLINE_TXT = colors.HexColor("#9d174d")

BODY_FONT = "Helvetica"
BOLD_FONT = "Helvetica-Bold"
MONO_FONT = "Courier"
MONO_BOLD = "Courier-Bold"

# ============ Layout constants ============
PAGE_W, PAGE_H = A4
MARGIN_X = 18*mm
MARGIN_TOP = 22*mm
MARGIN_BOTTOM = 22*mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

# ============ Text styles ============
H1_STYLE = ParagraphStyle(
    "H1", fontName=BOLD_FONT, fontSize=20, leading=24,
    textColor=INK, spaceBefore=0, spaceAfter=4,
)
H2_STYLE = ParagraphStyle(
    "H2", fontName=BOLD_FONT, fontSize=13, leading=17,
    textColor=INK_SOFT, spaceBefore=4, spaceAfter=6,
)
LEAD_STYLE = ParagraphStyle(
    "Lead", fontName=BODY_FONT, fontSize=10.5, leading=15,
    textColor=MUTED, spaceBefore=0, spaceAfter=0,
)
BODY_STYLE = ParagraphStyle(
    "Body", fontName=BODY_FONT, fontSize=10, leading=15,
    textColor=TEXT, spaceBefore=0, spaceAfter=0,
)
SMALL_STYLE = ParagraphStyle(
    "Small", fontName=BODY_FONT, fontSize=9, leading=13,
    textColor=MUTED,
)
TABLE_HEAD_STYLE = ParagraphStyle(
    "TH", fontName=BOLD_FONT, fontSize=9.5, leading=12,
    textColor=PAPER,
)
TABLE_CELL_STYLE = ParagraphStyle(
    "TD", fontName=BODY_FONT, fontSize=9.5, leading=13,
    textColor=TEXT,
)
TABLE_CELL_BOLD = ParagraphStyle(
    "TDB", fontName=BOLD_FONT, fontSize=9.5, leading=13,
    textColor=INK_SOFT,
)

# Inline code formatting tag
def ic(text):
    """Inline code wrapper."""
    return (
        f'<font name="Courier" size="9" backColor="{CODE_INLINE.hexval()}" '
        f'color="{CODE_INLINE_TXT.hexval()}">&nbsp;{text}&nbsp;</font>'
    )

# ============ Components ============

def section_title(title, kicker=None):
    """A section heading with kicker eyebrow + thin full-width underline."""
    items = []
    if kicker:
        items.append(Paragraph(
            f'<font color="{PRIMARY.hexval()}" size="8.5">'
            f'<b>{kicker.upper()}</b></font>',
            ParagraphStyle("Kicker", spaceBefore=0, spaceAfter=4,
                           fontName=BOLD_FONT, textColor=PRIMARY,
                           fontSize=8.5, leading=10)
        ))
    items.append(Paragraph(title, H1_STYLE))
    items.append(Spacer(1, 6))
    items.append(HRFlowable(
        width="100%", thickness=0.6, color=LINE,
        spaceBefore=0, spaceAfter=14
    ))
    return items

def subhead(title):
    """Smaller, quieter sub-heading above a code block."""
    return Paragraph(title, H2_STYLE)

def body(text):
    return Paragraph(text, BODY_STYLE)

def lead(text):
    """Slightly larger muted intro text."""
    return Paragraph(text, LEAD_STYLE)

def code_block(text):
    """A dark, padded, rounded code block with consistent margins."""
    safe = (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>"))
    p = Paragraph(
        f'<font name="Courier" size="9.5" color="{CODE_TXT.hexval()}">{safe}</font>',
        ParagraphStyle("CodeP", fontName=MONO_FONT, fontSize=9.5,
                       leading=14, textColor=CODE_TXT,
                       leftIndent=0, rightIndent=0)
    )
    t = Table([[p]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODE_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    return t

def callout(text, bg, border, txt, label=""):
    """A soft callout box: label + text on the left, colored left border."""
    parts = []
    if label:
        parts.append(
            f'<font name="{BOLD_FONT}" color="{txt.hexval()}" size="9"><b>'
            f'{label.upper()}</b></font><br/>'
        )
    parts.append(
        f'<font name="{BODY_FONT}" color="{txt.hexval()}" size="10">{text}</font>'
    )
    p = Paragraph("".join(parts),
                  ParagraphStyle("CO", fontName=BODY_FONT,
                                 fontSize=10, leading=14, textColor=txt,
                                 spaceBefore=0, spaceAfter=0))
    t = Table([[p]], colWidths=[CONTENT_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (-1, -1), 3, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t

def info_callout(text, label="info"):    return callout(text, INFO_SOFT, INFO, INFO_TXT, label)
def success_callout(text, label="done"): return callout(text, GREEN_SOFT, GREEN, GREEN_TXT, label)
def warn_callout(text, label="note"):    return callout(text, AMBER_SOFT, AMBER, AMBER_TXT, label)

def step_card(num, title, command):
    """A clean step card: numbered indigo badge + title + command."""
    badge = Table([[Paragraph(
        f'<para alignment="center"><font name="{BOLD_FONT}" size="13" color="white"><b>'
        f'{num}</b></font></para>',
        ParagraphStyle("BG", textColor=PAPER, alignment=TA_CENTER)
    )]], colWidths=[10*mm], rowHeights=[10*mm])
    badge.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PRIMARY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("ROUNDEDCORNERS", [5, 5, 5, 5]),
    ]))

    title_p = Paragraph(
        f'<font name="{BOLD_FONT}" size="11.5" color="{INK.hexval()}"><b>'
        f'{title}</b></font>',
        ParagraphStyle("ST", spaceBefore=0, spaceAfter=0)
    )

    header = Table([[badge, title_p]], colWidths=[14*mm, CONTENT_W - 14*mm])
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    return KeepTogether([
        header,
        Spacer(1, 8),
        code_block(command),
        Spacer(1, 14),
    ])

def styled_table(headers, rows, col_widths=None):
    head_cells = [Paragraph(h, TABLE_HEAD_STYLE) for h in headers]
    data = [head_cells] + rows
    t = Table(data, colWidths=col_widths or [60*mm, CONTENT_W - 60*mm])
    style = TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), INK_SOFT),
        ("TEXTCOLOR", (0, 0), (-1, 0), PAPER),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 10),
        ("TOPPADDING", (0, 1), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 1), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ])
    for i in range(1, len(data)):
        if i % 2 == 0:
            style.add("BACKGROUND", (0, i), (-1, i), SURFACE)
    t.setStyle(style)
    return t

# ============ Cover page ============
def draw_cover(canv, doc):
    canv.saveState()
    w, h = A4

    # Solid deep background — one consistent INK
    canv.setFillColor(INK)
    canv.rect(0, 0, w, h, fill=1, stroke=0)

    # Single soft top tint (subtle, not banded)
    canv.setFillColor(colors.HexColor("#111a36"))
    canv.rect(0, h*0.45, w, h*0.55, fill=1, stroke=0)

    # Top accent bar
    canv.setFillColor(ACCENT)
    canv.rect(0, h - 8, w, 8, fill=1, stroke=0)

    # Top-right version marker (no random line above)
    canv.setFillColor(colors.HexColor("#94a3b8"))
    canv.setFont(BODY_FONT, 8.5)
    canv.drawRightString(w - MARGIN_X, h - 22*mm, "INTERNAL  ·  v0.1.6")

    # Eyebrow / kicker
    canv.setFillColor(ACCENT)
    canv.setFont(BOLD_FONT, 9)
    canv.drawString(MARGIN_X, h - 70*mm, "CLAUDE CODE PLUGIN")

    # Title
    canv.setFillColor(PAPER)
    canv.setFont(BOLD_FONT, 52)
    canv.drawString(MARGIN_X, h - 95*mm, "GR Reviewer")

    # Sub-title underline
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(2)
    canv.line(MARGIN_X, h - 100*mm, MARGIN_X + 36*mm, h - 100*mm)

    # Tagline
    canv.setFillColor(colors.HexColor("#cbd5e1"))
    canv.setFont(BODY_FONT, 14)
    tagline_lines = [
        "Multi-agent AI code reviewer.",
        "Seven specialists. Parallel execution.",
        "Inline GitHub PR comments.",
    ]
    y = h - 115*mm
    for line in tagline_lines:
        canv.drawString(MARGIN_X, y, line)
        y -= 7*mm

    # Stats row
    stats = [("7", "Specialist\nagents"),
             ("3", "Setup\ncommands"),
             ("0", "Manual\nconfig"),
             ("∞", "Reviews\nper install")]
    stat_y = h - 168*mm
    stat_w = 36*mm
    gap = 4*mm
    total = len(stats)*stat_w + (len(stats)-1)*gap
    start_x = (w - total) / 2

    for i, (num, label) in enumerate(stats):
        x = start_x + i*(stat_w + gap)
        canv.setFillColor(colors.HexColor("#0b1120"))
        canv.setStrokeColor(colors.HexColor("#1e293b"))
        canv.setLineWidth(0.5)
        canv.roundRect(x, stat_y, stat_w, 28*mm, 4, fill=1, stroke=1)
        canv.setFillColor(ACCENT)
        canv.setFont(BOLD_FONT, 32)
        canv.drawCentredString(x + stat_w/2, stat_y + 17*mm, num)
        canv.setFillColor(colors.HexColor("#94a3b8"))
        canv.setFont(BODY_FONT, 8)
        for j, ln in enumerate(label.split("\n")):
            canv.drawCentredString(x + stat_w/2, stat_y + 9*mm - j*9, ln)

    # Feature strip — fills the void between stats and footer
    feat_y = h - 215*mm
    canv.setFillColor(ACCENT)
    canv.setFont(BOLD_FONT, 8.5)
    canv.drawString(MARGIN_X, feat_y, "WHAT'S INSIDE")

    canv.setFillColor(colors.HexColor("#cbd5e1"))
    canv.setFont(BODY_FONT, 10.5)
    features = [
        "Security · Performance · Observability · Architecture",
        "Code Quality · Testing · Domain — running concurrently",
        "Auto-extracts your GitHub token from the local repo",
        "Inline review comments posted directly on the PR diff",
    ]
    fy = feat_y - 9*mm
    for line in features:
        # bullet dot
        canv.setFillColor(ACCENT)
        canv.circle(MARGIN_X + 1.2*mm, fy + 1.2*mm, 0.9, fill=1, stroke=0)
        canv.setFillColor(colors.HexColor("#cbd5e1"))
        canv.drawString(MARGIN_X + 5*mm, fy, line)
        fy -= 7*mm

    # Bottom info area
    canv.setStrokeColor(colors.HexColor("#1e293b"))
    canv.setLineWidth(0.4)
    canv.line(MARGIN_X, 32*mm, w - MARGIN_X, 32*mm)

    canv.setFillColor(colors.HexColor("#94a3b8"))
    canv.setFont(BOLD_FONT, 9)
    canv.drawString(MARGIN_X, 24*mm, "TEAM SETUP GUIDE")
    canv.setFont(BODY_FONT, 8.5)
    canv.setFillColor(colors.HexColor("#64748b"))
    canv.drawString(MARGIN_X, 18*mm, "Last updated: November 2025  ·  Author: Imran Khan")

    canv.setFont(BODY_FONT, 8)
    canv.drawRightString(w - MARGIN_X, 18*mm, "github.com/Immy6315/claude-marketplace")

    canv.restoreState()

# ============ Page header / footer ============
def draw_page(canv, doc):
    canv.saveState()
    w, h = A4

    # Header
    canv.setFillColor(MUTED)
    canv.setFont(BODY_FONT, 8.5)
    canv.drawString(MARGIN_X, h - 13*mm, "GR Reviewer  ·  Team Setup Guide")
    canv.drawRightString(w - MARGIN_X, h - 13*mm, "v0.1.6")

    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(MARGIN_X, h - 16*mm, w - MARGIN_X, h - 16*mm)

    # Footer
    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(MARGIN_X, 15*mm, w - MARGIN_X, 15*mm)

    canv.setFillColor(SUBTLE)
    canv.setFont(BODY_FONT, 8)
    canv.drawString(MARGIN_X, 9*mm, "github.com/Immy6315/claude-marketplace")
    canv.drawRightString(w - MARGIN_X, 9*mm, f"{doc.page - 1}")

    canv.restoreState()

# ============ Build ============
def build():
    out_path = "/Users/imrankhan/Desktop/Gokwik-Github/claude-marketplace/docs/GR-Reviewer-Setup-Guide.pdf"
    doc = BaseDocTemplate(
        out_path, pagesize=A4,
        leftMargin=MARGIN_X, rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOTTOM,
        title="GR Reviewer — Team Setup Guide",
        author="Imran Khan",
    )
    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, showBoundary=0,
                        leftPadding=0, rightPadding=0,
                        topPadding=0, bottomPadding=0)
    body_frame = Frame(MARGIN_X, MARGIN_BOTTOM,
                       CONTENT_W, PAGE_H - MARGIN_TOP - MARGIN_BOTTOM,
                       showBoundary=0,
                       leftPadding=0, rightPadding=0,
                       topPadding=0, bottomPadding=0)

    doc.addPageTemplates([
        PageTemplate(id="Cover", frames=[cover_frame], onPage=draw_cover),
        PageTemplate(id="Body", frames=[body_frame], onPage=draw_page),
    ])

    story = []

    # Cover (drawn by onPage), then jump to body template
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # ============ Prerequisites ============
    story += section_title("Prerequisites", kicker="Before you begin")

    story.append(body(
        "You'll need three things before installing GR Reviewer."
    ))
    story.append(Spacer(1, 12))
    story.append(styled_table(
        ["Requirement", "Notes"],
        [
            [Paragraph("<b>Claude Code</b>", TABLE_CELL_BOLD),
             Paragraph(f"Install from {ic('docs.claude.com/claude-code')}", TABLE_CELL_STYLE)],
            [Paragraph("<b>macOS or Linux</b>", TABLE_CELL_BOLD),
             Paragraph("Apple Silicon · Intel · x86_64 · arm64 — all supported", TABLE_CELL_STYLE)],
            [Paragraph("<b>A local clone of the repo</b>", TABLE_CELL_BOLD),
             Paragraph("Or let GR clone it for you on first run", TABLE_CELL_STYLE)],
        ],
        col_widths=[55*mm, CONTENT_W - 55*mm]
    ))

    story.append(Spacer(1, 28))

    # ============ Setup ============
    story += section_title("One-Time Setup", kicker="Three commands")

    story.append(lead(
        "Open Claude Code and run these slash commands in order. "
        "The whole setup persists across all future sessions on your machine."
    ))
    story.append(Spacer(1, 18))

    story.append(step_card("1", "Add the marketplace",
                           "/plugin marketplace add Immy6315/claude-marketplace"))
    story.append(step_card("2", "Install the plugin",
                           "/plugin install gr-reviewer@immy6315-marketplace"))

    story.append(body(
        f"&nbsp;&nbsp;&nbsp;→ When prompted, choose {ic('Install for you (user scope)')} "
        "and press Enter."
    ))
    story.append(Spacer(1, 14))

    story.append(KeepTogether([
        step_card("3", "Reload Claude Code", "/reload-plugins"),
        success_callout(
            "Setup complete. The first time you use GR, the binary auto-installs to "
            f"{ic('~/.local/bin/gr')} — no sudo, no token required."
        ),
    ]))

    story.append(Spacer(1, 26))

    # ============ Usage ============
    story += section_title("How to Use", kicker="Daily workflow")

    story.append(subhead("Review a PR — preview only (nothing posted)"))
    story.append(code_block("/gr-reviewer:review-pr https://github.com/owner/repo/pull/123"))
    story.append(body(
        "Default behavior is preview mode. Findings appear in your terminal — nothing is posted to GitHub."
    ))
    story.append(Spacer(1, 22))

    story.append(subhead("Review and post inline comments on the PR"))
    story.append(code_block("/gr-reviewer:review-pr https://github.com/owner/repo/pull/123 --post"))
    story.append(Spacer(1, 22))

    story.append(subhead("Manage GitHub credentials (optional)"))
    story.append(code_block(
        "/gr-reviewer:auth status\n"
        "/gr-reviewer:auth login\n"
        "/gr-reviewer:auth logout"
    ))

    story.append(PageBreak())

    # ============ Automation ============
    story += section_title("What Happens Automatically", kicker="No manual config")

    story.append(lead(
        f"When you run {ic('/gr-reviewer:review-pr &lt;pr-url&gt;')}, GR figures out everything for you."
    ))
    story.append(Spacer(1, 18))

    story.append(styled_table(
        ["Step", "Auto-detection"],
        [
            [Paragraph("<b>1.&nbsp;&nbsp;Find gr binary</b>", TABLE_CELL_BOLD),
             Paragraph(
                 f"Checks {ic('which gr')} → {ic('~/.local/bin/gr')} → "
                 "auto-installs if missing.", TABLE_CELL_STYLE)],
            [Paragraph("<b>2.&nbsp;&nbsp;Find local repo</b>", TABLE_CELL_BOLD),
             Paragraph(
                 "Current directory → immediate subfolders → asks you only "
                 "if not found.", TABLE_CELL_STYLE)],
            [Paragraph("<b>3.&nbsp;&nbsp;Find GitHub token</b>", TABLE_CELL_BOLD),
             Paragraph(
                 f"Repo's git remote → {ic('gh auth token')} → env vars → "
                 "asks you only if none found.", TABLE_CELL_STYLE)],
            [Paragraph("<b>4.&nbsp;&nbsp;Run review</b>", TABLE_CELL_BOLD),
             Paragraph(
                 "Seven specialist agents run in parallel; first run takes "
                 "1–3 min.", TABLE_CELL_STYLE)],
        ],
        col_widths=[45*mm, CONTENT_W - 45*mm]
    ))
    story.append(Spacer(1, 18))

    story.append(info_callout(
        "<b>You don't need to:</b> manually install the binary, set environment "
        "variables, configure tokens upfront, or be in any specific directory.",
        label="zero setup"
    ))

    story.append(PageBreak())

    # ============ Scenarios ============
    story += section_title("Common Scenarios", kicker="Real-world usage")

    story.append(subhead("Scenario A — You're inside the repo"))
    story.append(code_block("cd ~/projects/os-order"))
    story.append(Spacer(1, 6))
    story.append(body("Then in Claude Code:"))
    story.append(Spacer(1, 8))
    story.append(code_block("/gr-reviewer:review-pr https://github.com/gokwik/os-order/pull/123"))
    story.append(success_callout("Auto-detects everything.", label="result"))
    story.append(Spacer(1, 22))

    story.append(subhead("Scenario B — Parent folder with multiple repos"))
    story.append(code_block("cd ~/projects   # has os-order/, os-item/, os-inventory/, etc."))
    story.append(Spacer(1, 8))
    story.append(code_block("/gr-reviewer:review-pr https://github.com/gokwik/os-order/pull/123"))
    story.append(info_callout(
        f"Auto-detects {ic('./os-order')} subfolder by matching the repo name in the PR URL.",
        label="result"))
    story.append(Spacer(1, 22))

    story.append(subhead("Scenario C — Repo not cloned locally yet"))
    story.append(code_block("/gr-reviewer:review-pr https://github.com/some-org/some-repo/pull/45"))
    story.append(Spacer(1, 8))
    story.append(body(
        f"GR will ask you: <i>\"Where is your local clone? Reply with: path | clone | cancel\"</i> &nbsp;"
        f"Reply {ic('clone')} and it will clone to {ic('/tmp/gr-some-repo')} and review automatically."
    ))

    story.append(PageBreak())

    # ============ Update / Uninstall ============
    story += section_title("Update to Latest Version", kicker="Stay current")

    story.append(body("Run these three slash commands inside Claude Code:"))
    story.append(Spacer(1, 10))
    story.append(code_block(
        "/plugin marketplace update immy6315-marketplace\n"
        "/plugin install gr-reviewer@immy6315-marketplace\n"
        "/reload-plugins"
    ))

    story.append(Spacer(1, 28))

    story += section_title("Uninstall", kicker="Remove cleanly")

    story.append(subhead("Remove the plugin from Claude Code"))
    story.append(code_block("/plugin uninstall gr-reviewer"))
    story.append(Spacer(1, 18))

    story.append(subhead("Remove the gr binary from your machine"))
    story.append(code_block("rm ~/.local/bin/gr ~/.local/bin/GR"))
    story.append(Spacer(1, 18))

    story.append(subhead("Clear saved credentials (optional)"))
    story.append(code_block("~/.local/bin/gr uninstall --purge"))

    story.append(PageBreak())

    # ============ Troubleshooting ============
    story += section_title("Troubleshooting", kicker="Common fixes")

    story.append(styled_table(
        ["Problem", "Fix"],
        [
            [Paragraph("Plugin not in / menu", TABLE_CELL_STYLE),
             Paragraph(f"Run {ic('/reload-plugins')}", TABLE_CELL_STYLE)],
            [Paragraph(f"{ic('command not found: gr')}", TABLE_CELL_STYLE),
             Paragraph(
                 f"Add to PATH in {ic('~/.zshrc')}: "
                 f"{ic('export PATH=&quot;$HOME/.local/bin:$PATH&quot;')}",
                 TABLE_CELL_STYLE)],
            [Paragraph(f"{ic('401 Unauthorized')}", TABLE_CELL_STYLE),
             Paragraph(
                 f"Run {ic('gr auth login')} with a fresh PAT "
                 f"(scope: {ic('repo')})",
                 TABLE_CELL_STYLE)],
            [Paragraph("Stale plugin version", TABLE_CELL_STYLE),
             Paragraph("Run the three update commands above", TABLE_CELL_STYLE)],
            [Paragraph("Wrong repo auto-detected", TABLE_CELL_STYLE),
             Paragraph(f"Pass {ic('--repo &lt;path&gt;')} explicitly", TABLE_CELL_STYLE)],
        ],
        col_widths=[55*mm, CONTENT_W - 55*mm]
    ))

    story.append(Spacer(1, 28))

    # ============ Quick Reference ============
    story += section_title("Quick Reference", kicker="Cheat sheet")

    story.append(styled_table(
        ["Action", "Command"],
        [
            [Paragraph("Add marketplace", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin marketplace add Immy6315/claude-marketplace"), TABLE_CELL_STYLE)],
            [Paragraph("Install plugin", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin install gr-reviewer@immy6315-marketplace"), TABLE_CELL_STYLE)],
            [Paragraph("Reload", TABLE_CELL_STYLE),
             Paragraph(ic("/reload-plugins"), TABLE_CELL_STYLE)],
            [Paragraph("Update", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin marketplace update immy6315-marketplace"), TABLE_CELL_STYLE)],
            [Paragraph("Uninstall", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin uninstall gr-reviewer"), TABLE_CELL_STYLE)],
            [Paragraph("Review PR (preview)", TABLE_CELL_STYLE),
             Paragraph(ic("/gr-reviewer:review-pr &lt;url&gt;"), TABLE_CELL_STYLE)],
            [Paragraph("Review PR (post)", TABLE_CELL_STYLE),
             Paragraph(ic("/gr-reviewer:review-pr &lt;url&gt; --post"), TABLE_CELL_STYLE)],
            [Paragraph("Auth status / login", TABLE_CELL_STYLE),
             Paragraph(ic("/gr-reviewer:auth status | login"), TABLE_CELL_STYLE)],
        ],
        col_widths=[55*mm, CONTENT_W - 55*mm]
    ))

    # Footer of every page already carries version + repo URL, so no closing block needed.

    doc.build(story)
    print(f"Built: {out_path}")

if __name__ == "__main__":
    build()
