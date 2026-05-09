"""eng-org Setup Guide — clean, professional, well-spaced PDF.

Mirrors the visual language of GR-Reviewer-Setup-Guide.pdf.
"""

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, NextPageTemplate, HRFlowable
)

# ============ Brand palette ============
INK         = colors.HexColor("#0b1120")
INK_SOFT    = colors.HexColor("#1e293b")
TEXT        = colors.HexColor("#1f2937")
MUTED       = colors.HexColor("#64748b")
SUBTLE      = colors.HexColor("#94a3b8")
LINE        = colors.HexColor("#e5e7eb")
LINE_SOFT   = colors.HexColor("#f1f5f9")
SURFACE     = colors.HexColor("#fafbfc")
PAPER       = colors.white

# Slightly different primary (emerald) so the two guides feel sibling, not identical.
PRIMARY     = colors.HexColor("#0d9488")  # teal 600
PRIMARY_DARK = colors.HexColor("#115e59")
PRIMARY_SOFT = colors.HexColor("#ccfbf1")
ACCENT      = colors.HexColor("#22d3ee")  # cyan 400

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
CODE_INLINE = colors.HexColor("#ecfeff")
CODE_INLINE_TXT = colors.HexColor("#155e75")

BODY_FONT = "Helvetica"
BOLD_FONT = "Helvetica-Bold"
MONO_FONT = "Courier"

# ============ Layout ============
PAGE_W, PAGE_H = A4
MARGIN_X = 18*mm
MARGIN_TOP = 22*mm
MARGIN_BOTTOM = 22*mm
CONTENT_W = PAGE_W - 2 * MARGIN_X

# ============ Text styles ============
H1_STYLE = ParagraphStyle("H1", fontName=BOLD_FONT, fontSize=20, leading=24,
                          textColor=INK, spaceBefore=0, spaceAfter=4)
H2_STYLE = ParagraphStyle("H2", fontName=BOLD_FONT, fontSize=13, leading=17,
                          textColor=INK_SOFT, spaceBefore=4, spaceAfter=6)
LEAD_STYLE = ParagraphStyle("Lead", fontName=BODY_FONT, fontSize=10.5, leading=15,
                            textColor=MUTED, spaceBefore=0, spaceAfter=0)
BODY_STYLE = ParagraphStyle("Body", fontName=BODY_FONT, fontSize=10, leading=15,
                            textColor=TEXT, spaceBefore=0, spaceAfter=0)
SMALL_STYLE = ParagraphStyle("Small", fontName=BODY_FONT, fontSize=9, leading=13,
                             textColor=MUTED)
TABLE_HEAD_STYLE = ParagraphStyle("TH", fontName=BOLD_FONT, fontSize=9.5, leading=12,
                                  textColor=PAPER)
TABLE_CELL_STYLE = ParagraphStyle("TD", fontName=BODY_FONT, fontSize=9.5, leading=13,
                                  textColor=TEXT)
TABLE_CELL_BOLD = ParagraphStyle("TDB", fontName=BOLD_FONT, fontSize=9.5, leading=13,
                                 textColor=INK_SOFT)


def ic(text):
    """Inline code wrapper."""
    return (
        f'<font name="Courier" size="9" backColor="{CODE_INLINE.hexval()}" '
        f'color="{CODE_INLINE_TXT.hexval()}">&nbsp;{text}&nbsp;</font>'
    )


# ============ Components ============
def section_title(title, kicker=None):
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
    items.append(HRFlowable(width="100%", thickness=0.6, color=LINE,
                            spaceBefore=0, spaceAfter=14))
    return items


def subhead(title):
    return Paragraph(title, H2_STYLE)


def body(text):
    return Paragraph(text, BODY_STYLE)


def lead(text):
    return Paragraph(text, LEAD_STYLE)


def code_block(text):
    safe = (text.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\n", "<br/>"))
    p = Paragraph(
        f'<font name="Courier" size="9.5" color="{CODE_TXT.hexval()}">{safe}</font>',
        ParagraphStyle("CodeP", fontName=MONO_FONT, fontSize=9.5,
                       leading=14, textColor=CODE_TXT)
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
                  ParagraphStyle("CO", fontName=BODY_FONT, fontSize=10,
                                 leading=14, textColor=txt))
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


# ============ Cover ============
def draw_cover(canv, doc):
    canv.saveState()
    w, h = A4

    canv.setFillColor(INK)
    canv.rect(0, 0, w, h, fill=1, stroke=0)

    canv.setFillColor(colors.HexColor("#0d1b2a"))
    canv.rect(0, h*0.45, w, h*0.55, fill=1, stroke=0)

    # Top accent bar — teal
    canv.setFillColor(ACCENT)
    canv.rect(0, h - 8, w, 8, fill=1, stroke=0)

    canv.setFillColor(colors.HexColor("#94a3b8"))
    canv.setFont(BODY_FONT, 8.5)
    canv.drawRightString(w - MARGIN_X, h - 22*mm, "OPEN-SOURCE  ·  v0.1.0")

    # Eyebrow
    canv.setFillColor(ACCENT)
    canv.setFont(BOLD_FONT, 9)
    canv.drawString(MARGIN_X, h - 70*mm, "CLAUDE CODE PLUGIN")

    # Title
    canv.setFillColor(PAPER)
    canv.setFont(BOLD_FONT, 60)
    canv.drawString(MARGIN_X, h - 95*mm, "eng-org")

    # Sub-title underline
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(2)
    canv.line(MARGIN_X, h - 100*mm, MARGIN_X + 36*mm, h - 100*mm)

    # Tagline
    canv.setFillColor(colors.HexColor("#cbd5e1"))
    canv.setFont(BODY_FONT, 14)
    tagline_lines = [
        "5-role multi-agent engineering org.",
        "EM, Tech Leads, Devs, Tests, Reviewers.",
        "One command sets up your project.",
    ]
    y = h - 115*mm
    for line in tagline_lines:
        canv.drawString(MARGIN_X, y, line)
        y -= 7*mm

    # Stats row
    stats = [("16", "Specialist\nagents"),
             ("10", "Slash\ncommands"),
             ("1",  "Setup\ncommand"),
             ("0",  "Manual\nconfig")]
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

    # Feature strip
    feat_y = h - 215*mm
    canv.setFillColor(ACCENT)
    canv.setFont(BOLD_FONT, 8.5)
    canv.drawString(MARGIN_X, feat_y, "WHAT'S INSIDE")

    canv.setFillColor(colors.HexColor("#cbd5e1"))
    canv.setFont(BODY_FONT, 10.5)
    features = [
        "EM intake, triage and Mode A / Mode B routing",
        "Tech Lead per domain — auto-generated from your project",
        "Independent test agents: unit / integration / e2e / regression / load",
        "Specialist reviewers: architecture / security / perf / standards / observability",
    ]
    fy = feat_y - 9*mm
    for line in features:
        canv.setFillColor(ACCENT)
        canv.circle(MARGIN_X + 1.2*mm, fy + 1.2*mm, 0.9, fill=1, stroke=0)
        canv.setFillColor(colors.HexColor("#cbd5e1"))
        canv.drawString(MARGIN_X + 5*mm, fy, line)
        fy -= 7*mm

    # Bottom info
    canv.setStrokeColor(colors.HexColor("#1e293b"))
    canv.setLineWidth(0.4)
    canv.line(MARGIN_X, 32*mm, w - MARGIN_X, 32*mm)

    canv.setFillColor(colors.HexColor("#94a3b8"))
    canv.setFont(BOLD_FONT, 9)
    canv.drawString(MARGIN_X, 24*mm, "PROJECT SETUP GUIDE")
    canv.setFont(BODY_FONT, 8.5)
    canv.setFillColor(colors.HexColor("#64748b"))
    canv.drawString(MARGIN_X, 18*mm, "Last updated: May 2026  ·  Author: Imran Khan")

    canv.setFont(BODY_FONT, 8)
    canv.drawRightString(w - MARGIN_X, 18*mm, "github.com/Immy6315/claude-marketplace")

    canv.restoreState()


def draw_page(canv, doc):
    canv.saveState()
    w, h = A4

    canv.setFillColor(MUTED)
    canv.setFont(BODY_FONT, 8.5)
    canv.drawString(MARGIN_X, h - 13*mm, "eng-org  ·  Project Setup Guide")
    canv.drawRightString(w - MARGIN_X, h - 13*mm, "v0.1.0")

    canv.setStrokeColor(LINE)
    canv.setLineWidth(0.5)
    canv.line(MARGIN_X, h - 16*mm, w - MARGIN_X, h - 16*mm)

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
    out_path = "/Users/imrankhan/Desktop/Gokwik-Github/claude-marketplace/docs/Eng-Org-Setup-Guide.pdf"
    doc = BaseDocTemplate(
        out_path, pagesize=A4,
        leftMargin=MARGIN_X, rightMargin=MARGIN_X,
        topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOTTOM,
        title="eng-org — Project Setup Guide",
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
    story.append(NextPageTemplate("Body"))
    story.append(PageBreak())

    # ============ What is eng-org ============
    story += section_title("What is eng-org?", kicker="The big picture")

    story.append(lead(
        "A complete engineering organisation as a Claude Code plugin. "
        "It drops a 5-role multi-agent process into any project — separation "
        "of duties, independent review, audit trail — without you having to "
        "wire any of it up."
    ))
    story.append(Spacer(1, 14))

    story.append(body(
        "The pipeline runs in this order, with each role handing artifacts "
        "to the next:"
    ))
    story.append(Spacer(1, 12))

    story.append(styled_table(
        ["Role", "What they do"],
        [
            [Paragraph("<b>Engineering Manager</b>", TABLE_CELL_BOLD),
             Paragraph("Intakes the requirement, triages Mode A vs Mode B, "
                       "gates merge readiness, writes the human summary.",
                       TABLE_CELL_STYLE)],
            [Paragraph("<b>Tech Lead</b>", TABLE_CELL_BOLD),
             Paragraph("One per domain. Decomposes the work into tasks, "
                       "spawns Devs, aggregates findings.", TABLE_CELL_STYLE)],
            [Paragraph("<b>Domain Devs</b>", TABLE_CELL_BOLD),
             Paragraph("Specialists by stack: postgres-drizzle, tRPC, pure "
                       "domain logic, Expo/RN, UI/animation.", TABLE_CELL_STYLE)],
            [Paragraph("<b>Test agents</b>", TABLE_CELL_BOLD),
             Paragraph("Independent: unit, integration (real DB), e2e, "
                       "regression (against MISTAKES.md), load.", TABLE_CELL_STYLE)],
            [Paragraph("<b>Reviewers</b>", TABLE_CELL_BOLD),
             Paragraph("Architecture, security, performance, standards, "
                       "observability — concurrent and independent.", TABLE_CELL_STYLE)],
            [Paragraph("<b>Human</b>", TABLE_CELL_BOLD),
             Paragraph("Final approval. Always.", TABLE_CELL_STYLE)],
        ],
        col_widths=[45*mm, CONTENT_W - 45*mm]
    ))
    story.append(Spacer(1, 18))

    story.append(info_callout(
        "The framework stops at <b>production-ready PR approval</b>. "
        "Deployment stays human-controlled.",
        label="scope"
    ))

    story.append(PageBreak())

    # ============ Prerequisites ============
    story += section_title("Prerequisites", kicker="Before you begin")

    story.append(body("You need three things before installing eng-org."))
    story.append(Spacer(1, 12))
    story.append(styled_table(
        ["Requirement", "Notes"],
        [
            [Paragraph("<b>Claude Code</b>", TABLE_CELL_BOLD),
             Paragraph(f"Install from {ic('docs.claude.com/claude-code')}",
                       TABLE_CELL_STYLE)],
            [Paragraph("<b>Node 18 or higher</b>", TABLE_CELL_BOLD),
             Paragraph(f"Used by the validator {ic('governance/scripts/check.mjs')}. "
                       "Zero npm dependencies — just Node.", TABLE_CELL_STYLE)],
            [Paragraph("<b>An existing project</b>", TABLE_CELL_BOLD),
             Paragraph("Any stack. eng-org reads your manifests "
                       f"({ic('package.json')}, {ic('pyproject.toml')}, "
                       f"{ic('go.mod')}, etc.) to detect language and frameworks.",
                       TABLE_CELL_STYLE)],
        ],
        col_widths=[55*mm, CONTENT_W - 55*mm]
    ))
    story.append(Spacer(1, 18))

    story.append(warn_callout(
        f"Run {ic('/eng-org:init')} from the <b>root</b> of your project. "
        "It refuses to run inside a temp directory or a project that is "
        "already initialised.",
        label="important"
    ))

    story.append(PageBreak())

    # ============ Setup ============
    story += section_title("One-Time Setup", kicker="Three commands")

    story.append(lead(
        "Open Claude Code and run these slash commands in order. "
        "The plugin install persists across all future sessions; the "
        f"{ic('/eng-org:init')} run is per project."
    ))
    story.append(Spacer(1, 18))

    story.append(step_card("1", "Add the marketplace",
                           "/plugin marketplace add Immy6315/claude-marketplace"))
    story.append(step_card("2", "Install the plugin",
                           "/plugin install eng-org@immy6315-marketplace"))

    story.append(body(
        f"&nbsp;&nbsp;&nbsp;→ When prompted, choose {ic('Install for you (user scope)')} "
        "and press Enter."
    ))
    story.append(Spacer(1, 14))

    story.append(KeepTogether([
        step_card("3", "Initialise your project (run from project root)",
                  "/eng-org:init"),
        success_callout(
            "eng-org reads your manifests, infers domains from your folder "
            "structure, asks you to confirm, and then writes the full "
            f"{ic('governance/')} tree, {ic('CLAUDE.md')}, {ic('PROJECT.yml')} "
            "and one Tech Lead agent per domain."
        ),
    ]))

    story.append(PageBreak())

    # ============ The 5-role pipeline ============
    story += section_title("The 5-Role Pipeline", kicker="Daily workflow")

    story.append(lead(
        "For any non-trivial change (Mode B), run the slash commands in order. "
        "Each command produces artifacts the next one reads."
    ))
    story.append(Spacer(1, 16))

    story.append(styled_table(
        ["Step", "Command", "Output"],
        [
            [Paragraph("<b>1.</b>", TABLE_CELL_BOLD),
             Paragraph(ic('/eng-org:em-intake "&lt;requirement&gt;"'), TABLE_CELL_STYLE),
             Paragraph(f"{ic('REQ-&lt;id&gt;/spec.md')} + triage decision",
                       TABLE_CELL_STYLE)],
            [Paragraph("<b>2.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:tl-analyze REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("Tasks plan + risk list", TABLE_CELL_STYLE)],
            [Paragraph("<b>3.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:tl-assign REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("Devs write the code", TABLE_CELL_STYLE)],
            [Paragraph("<b>4.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:run-tests REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("5 test reports — independent agents", TABLE_CELL_STYLE)],
            [Paragraph("<b>5.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:run-reviews REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("5 reviewer reports — concurrent", TABLE_CELL_STYLE)],
            [Paragraph("<b>6.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:merge-readiness REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("TL aggregate · EM gate", TABLE_CELL_STYLE)],
            [Paragraph("<b>7.</b>", TABLE_CELL_BOLD),
             Paragraph(ic("/eng-org:em-summary REQ-&lt;id&gt;"), TABLE_CELL_STYLE),
             Paragraph("Human-facing summary", TABLE_CELL_STYLE)],
        ],
        col_widths=[14*mm, 78*mm, CONTENT_W - 14*mm - 78*mm]
    ))

    story.append(Spacer(1, 18))

    story.append(info_callout(
        f"Use {ic('/eng-org:pilot-check')} any time to self-test the framework "
        "on its own files — useful right after install or after upgrades.",
        label="tip"
    ))

    story.append(PageBreak())

    # ============ Triage ============
    story += section_title("Mode A vs Mode B", kicker="Triage is the first decision")

    story.append(lead(
        "Triage happens in step 1 (em-intake). The EM picks Mode A or Mode B "
        "based on what the change touches."
    ))
    story.append(Spacer(1, 16))

    story.append(subhead("Mode A — Maker → Checker (lightweight)"))
    story.append(body(
        f"Use when the change touches <b>only</b>: {ic('governance/**')}, "
        f"{ic('.claude/**')}, {ic('**/*.md')}, or {ic('PROJECT.yml')} — "
        "and adds no dependencies."
    ))
    story.append(Spacer(1, 6))
    story.append(body(
        "Examples: editing CONSTITUTION, adding a MISTAKES.md entry, "
        "updating an agent prompt, doc fixes."
    ))
    story.append(Spacer(1, 16))

    story.append(subhead("Mode B — Full 5-role pipeline"))
    story.append(body(
        "Use when the change touches application code, schema migrations, "
        "new dependencies, user-visible flows, or governance core "
        "(CONSTITUTION, ROLES, agent definitions)."
    ))
    story.append(Spacer(1, 6))
    story.append(body(
        "Examples: a new tRPC router, a Drizzle migration, a new Expo screen, "
        "a billing rule change."
    ))
    story.append(Spacer(1, 18))

    story.append(warn_callout(
        "When in doubt, prefer Mode B. The cost of unnecessary review is low; "
        "the cost of skipping necessary review is high.",
        label="rule of thumb"
    ))

    story.append(PageBreak())

    # ============ What /eng-org:init does ============
    story += section_title("What /eng-org:init Does", kicker="Auto-detection")

    story.append(lead(
        f"{ic('/eng-org:init')} is the magic command. Here is what it does, "
        "in order:"
    ))
    story.append(Spacer(1, 18))

    story.append(styled_table(
        ["Step", "Action"],
        [
            [Paragraph("<b>1.&nbsp;Detect manifests</b>", TABLE_CELL_BOLD),
             Paragraph(f"Reads {ic('package.json')}, {ic('pyproject.toml')}, "
                       f"{ic('go.mod')}, {ic('Cargo.toml')}, {ic('Gemfile')}, "
                       f"{ic('pom.xml')}.", TABLE_CELL_STYLE)],
            [Paragraph("<b>2.&nbsp;Infer stack</b>", TABLE_CELL_BOLD),
             Paragraph("From dependencies — backend (tRPC / Next / Django / "
                       "Rails / Go) and frontend (Expo / Next / Nuxt / "
                       "SvelteKit).", TABLE_CELL_STYLE)],
            [Paragraph("<b>3.&nbsp;Infer domains</b>", TABLE_CELL_BOLD),
             Paragraph("From folder structure — tRPC routers, Django apps, "
                       "Rails models, Expo route groups.", TABLE_CELL_STYLE)],
            [Paragraph("<b>4.&nbsp;Confirm with you</b>", TABLE_CELL_BOLD),
             Paragraph("Shows what it found and asks before writing anything.",
                       TABLE_CELL_STYLE)],
            [Paragraph("<b>5.&nbsp;Pre-flight</b>", TABLE_CELL_BOLD),
             Paragraph(f"Refuses to overwrite an existing {ic('PROJECT.yml')} "
                       f"or a {ic('CLAUDE.md')} without the framework markers.",
                       TABLE_CELL_STYLE)],
            [Paragraph("<b>6.&nbsp;Write files</b>", TABLE_CELL_BOLD),
             Paragraph(f"Generates {ic('governance/')}, {ic('CLAUDE.md')}, "
                       f"{ic('PROJECT.yml')}, and one "
                       f"{ic('.claude/agents/tl-&lt;domain&gt;.md')} "
                       "per declared domain.", TABLE_CELL_STYLE)],
            [Paragraph("<b>7.&nbsp;Validate</b>", TABLE_CELL_BOLD),
             Paragraph(f"Runs {ic('node governance/scripts/check.mjs')} and "
                       "prints a final report.", TABLE_CELL_STYLE)],
        ],
        col_widths=[42*mm, CONTENT_W - 42*mm]
    ))

    story.append(Spacer(1, 18))

    story.append(info_callout(
        "Domains and stack are <b>declarative</b>. If init misses a domain or "
        f"infers something wrong, edit {ic('PROJECT.yml')} and re-run "
        f"{ic('/eng-org:doctor')} to verify.",
        label="declarative"
    ))

    story.append(PageBreak())

    # ============ File layout ============
    story += section_title("Files Written to Your Project", kicker="What lands on disk")

    story.append(code_block(
        "your-project/\n"
        "├── PROJECT.yml                       # framework configuration\n"
        "├── CLAUDE.md                         # session-binding rules\n"
        "├── governance/\n"
        "│   ├── ROLES.md                      # role contracts (binding)\n"
        "│   ├── REVIEW_PROCESS.md             # workflow narrative\n"
        "│   ├── CONSTITUTION.md               # project rules + §H iron rules\n"
        "│   ├── MISTAKES.md                   # append-only lessons log\n"
        "│   ├── TECH_DEBT.md                  # sanctioned waivers\n"
        "│   ├── COVERAGE_THRESHOLDS.md        # test gates\n"
        "│   ├── ARCHITECTURE.md               # system shape, layering, SLAs\n"
        "│   ├── requirements/README.md        # per-REQ folder layout\n"
        "│   └── scripts/check.mjs             # zero-dep validator\n"
        "└── .claude/\n"
        "    └── agents/\n"
        "        └── tl-<domain>.md            # one Tech Lead per domain"
    ))

    story.append(Spacer(1, 18))

    story.append(body(
        "The 16 specialist agents (1 EM, 5 Devs, 5 Tests, 5 Reviewers) live "
        "inside the plugin and are available globally as registered subagents. "
        "They are not copied into your project."
    ))
    story.append(Spacer(1, 14))

    story.append(info_callout(
        f"In {ic('CLAUDE.md')} the framework block is wrapped in "
        f"{ic('&lt;!-- FRAMEWORK:START --&gt;')} / "
        f"{ic('&lt;!-- FRAMEWORK:END --&gt;')} markers. Edit your "
        "project-specific rules <b>outside</b> these markers — the framework "
        "block is owned by the plugin and may be rewritten by future updates.",
        label="ownership"
    ))

    story.append(PageBreak())

    # ============ Iron rules ============
    story += section_title("Iron Rules", kicker="Constitution §H")

    story.append(lead(
        f"{ic('/eng-org:init')} writes these nine rules into the §H block of "
        f"your project's {ic('CONSTITUTION.md')}. They are binding on every "
        "agent in the pipeline."
    ))
    story.append(Spacer(1, 16))

    rules = [
        ("42", "No agent self-approves."),
        ("43", "Same agent never reused on the same artifact."),
        ("44", "Role contracts in ROLES.md are binding."),
        ("45", "Communication is artifact-only — no agent reads another's memory."),
        ("46", "Audit trail mandatory in governance/.audit/."),
        ("47", "Human approval non-negotiable for merge."),
        ("48", "ROLES / CONSTITUTION changes follow Mode B."),
        ("49", "Triage is the first decision per REQ."),
    ]
    rule_rows = [
        [Paragraph(f"<b>{n}</b>", TABLE_CELL_BOLD),
         Paragraph(text, TABLE_CELL_STYLE)] for n, text in rules
    ]
    story.append(styled_table(
        ["Rule", "Statement"],
        rule_rows,
        col_widths=[16*mm, CONTENT_W - 16*mm]
    ))

    story.append(PageBreak())

    # ============ Maintenance ============
    story += section_title("Maintenance", kicker="Day 2 ops")

    story.append(subhead("Audit your installation"))
    story.append(code_block("/eng-org:doctor"))
    story.append(body(
        "Read-only check. Verifies every framework file is present, every "
        f"declared domain has its TL agent, runs the validator, and reports "
        f"any drift between {ic('PROJECT.yml')} and the on-disk state."
    ))
    story.append(Spacer(1, 22))

    story.append(subhead("Update the plugin to a newer version"))
    story.append(code_block(
        "/plugin marketplace update immy6315-marketplace\n"
        "/plugin install eng-org@immy6315-marketplace\n"
        "/reload-plugins"
    ))
    story.append(Spacer(1, 22))

    story.append(subhead("Add a new domain"))
    story.append(body(
        f"Edit {ic('PROJECT.yml')} and add an entry under {ic('domains:')}. "
        f"Then run {ic('/eng-org:doctor')} to verify, and a future "
        f"{ic('/eng-org:update')} command will regenerate the missing TL agent."
    ))
    story.append(Spacer(1, 22))

    story.append(subhead("Uninstall the plugin"))
    story.append(code_block("/plugin uninstall eng-org"))
    story.append(body(
        f"Files written into your project ({ic('governance/')}, "
        f"{ic('CLAUDE.md')}, {ic('PROJECT.yml')}, {ic('.claude/agents/tl-*.md')}) "
        "are <b>not</b> deleted — they are yours. Remove them by hand if you "
        "want a clean slate."
    ))

    story.append(PageBreak())

    # ============ Troubleshooting ============
    story += section_title("Troubleshooting", kicker="Common fixes")

    story.append(styled_table(
        ["Problem", "Fix"],
        [
            [Paragraph("Plugin not in / menu", TABLE_CELL_STYLE),
             Paragraph(f"Run {ic('/reload-plugins')}", TABLE_CELL_STYLE)],
            [Paragraph(f"{ic('/eng-org:init')} refuses to run", TABLE_CELL_STYLE),
             Paragraph(f"Already initialised. Run {ic('/eng-org:doctor')} "
                       "instead, or remove existing files manually.",
                       TABLE_CELL_STYLE)],
            [Paragraph("Init didn't detect my domain", TABLE_CELL_STYLE),
             Paragraph(f"Edit {ic('PROJECT.yml')} and add it under "
                       f"{ic('domains:')}, then run {ic('/eng-org:doctor')}.",
                       TABLE_CELL_STYLE)],
            [Paragraph("Validator reports a missing file", TABLE_CELL_STYLE),
             Paragraph(f"Re-run the relevant template manually or rerun "
                       f"{ic('/eng-org:init')} in a fresh checkout.",
                       TABLE_CELL_STYLE)],
            [Paragraph("Wrong stack inferred", TABLE_CELL_STYLE),
             Paragraph(f"Edit {ic('stack.backend')} and "
                       f"{ic('stack.frontend')} in {ic('PROJECT.yml')}.",
                       TABLE_CELL_STYLE)],
            [Paragraph("Want only governance, no agents", TABLE_CELL_STYLE),
             Paragraph(f"Empty the {ic('domains:')} list in "
                       f"{ic('PROJECT.yml')} — no TL agents will be generated.",
                       TABLE_CELL_STYLE)],
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
             Paragraph(ic("/plugin marketplace add Immy6315/claude-marketplace"),
                       TABLE_CELL_STYLE)],
            [Paragraph("Install plugin", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin install eng-org@immy6315-marketplace"),
                       TABLE_CELL_STYLE)],
            [Paragraph("Initialise project", TABLE_CELL_STYLE),
             Paragraph(ic("/eng-org:init"), TABLE_CELL_STYLE)],
            [Paragraph("Audit installation", TABLE_CELL_STYLE),
             Paragraph(ic("/eng-org:doctor"), TABLE_CELL_STYLE)],
            [Paragraph("Self-test", TABLE_CELL_STYLE),
             Paragraph(ic("/eng-org:pilot-check"), TABLE_CELL_STYLE)],
            [Paragraph("New requirement", TABLE_CELL_STYLE),
             Paragraph(ic('/eng-org:em-intake "&lt;requirement&gt;"'),
                       TABLE_CELL_STYLE)],
            [Paragraph("Run pipeline (Mode B)", TABLE_CELL_STYLE),
             Paragraph(f"{ic('tl-analyze')} → {ic('tl-assign')} → "
                       f"{ic('run-tests')} → {ic('run-reviews')} → "
                       f"{ic('merge-readiness')} → {ic('em-summary')}",
                       TABLE_CELL_STYLE)],
            [Paragraph("Update plugin", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin marketplace update immy6315-marketplace"),
                       TABLE_CELL_STYLE)],
            [Paragraph("Uninstall", TABLE_CELL_STYLE),
             Paragraph(ic("/plugin uninstall eng-org"), TABLE_CELL_STYLE)],
        ],
        col_widths=[55*mm, CONTENT_W - 55*mm]
    ))

    doc.build(story)
    print(f"Built: {out_path}")


if __name__ == "__main__":
    build()
