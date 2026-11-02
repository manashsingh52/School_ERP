"""
One-page printable A4 Student Details Form, for schools that don't have their data in a sheet.

    python3 docs/samples/forms/build_form.py

The parent fills sections A and B and signs; the school office fills section C (admission number,
class, fees). The fields follow the column order of docs/samples/imports (4-Students,
5-Optional-fees, 6-Fees-already-paid), so the office can type each form straight into those sheets
or the matching Google Form. Line art only, no filled areas, to keep printing cheap.
"""
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

OUT = Path(__file__).parent / "Student-Details-Form.pdf"
FONTS = "/usr/share/fonts/truetype"
pdfmetrics.registerFont(TTFont("Sans", f"{FONTS}/crosextra/Carlito-Regular.ttf"))
pdfmetrics.registerFont(TTFont("Sans-Bold", f"{FONTS}/crosextra/Carlito-Bold.ttf"))
pdfmetrics.registerFont(TTFont("Glyph", f"{FONTS}/dejavu/DejaVuSans.ttf"))  # ₹

INK = HexColor("#1B1F24")
LABEL = HexColor("#4A525C")
FAINT = HexColor("#8C959F")
RULE = HexColor("#A7AEB6")
ACCENT = HexColor("#0F5338")

W, H = A4
M = 30  # page margin
CW = W - 2 * M


class Form:
    def __init__(self, path):
        self.c = canvas.Canvas(str(path), pagesize=A4)
        self.c.setTitle("Student Details Form")
        self.c.setAuthor("Bastaa")
        self.y = H - M  # cursor from the top, in PDF units

    # ---- drawing helpers (y is measured from the page top) ----
    def text(self, x, y, s, size=8, font="Sans", color=LABEL):
        c = self.c
        c.setFillColor(color)
        if "₹" in s:  # Carlito lacks the rupee sign: draw it in DejaVu
            parts = s.split("₹")
            cx = x
            for i, part in enumerate(parts):
                if i:
                    c.setFont("Glyph", size)
                    c.drawString(cx, H - y, "₹")
                    cx += pdfmetrics.stringWidth("₹", "Glyph", size)
                c.setFont(font, size)
                c.drawString(cx, H - y, part)
                cx += pdfmetrics.stringWidth(part, font, size)
            return cx
        c.setFont(font, size)
        c.drawString(x, H - y, s)
        return x + pdfmetrics.stringWidth(s, font, size)

    def width(self, s, size=8, font="Sans"):
        return pdfmetrics.stringWidth(s.replace("₹", ""), font, size) + (pdfmetrics.stringWidth("₹", "Glyph", size) if "₹" in s else 0)

    def line(self, x1, x2, y, dash=False):
        c = self.c
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        c.setDash(1.2, 1.8) if dash else c.setDash()
        c.line(x1, H - y, x2, H - y)
        c.setDash()

    def field(self, x, y, w, label, need=False):
        """A label sitting above a writing line; returns the right edge."""
        self.text(x, y - 19, label + (" *" if need else ""), 7.6)
        self.line(x, x + w, y)
        return x + w

    def boxes(self, x, y, n, label=None, groups=None, need=False, bw=12.2, bh=14.5):
        """Character boxes; groups splits them with a slash (DD/MM/YYYY)."""
        c = self.c
        if label:
            self.text(x, y - 19, label + (" *" if need else ""), 7.6)
        c.setStrokeColor(RULE)
        c.setLineWidth(0.6)
        cx = x
        sizes = groups or [n]
        for gi, g in enumerate(sizes):
            for _ in range(g):
                c.rect(cx, H - y, bw, bh, stroke=1, fill=0)
                cx += bw
            if gi < len(sizes) - 1:
                self.text(cx + 1.2, y - 4, "/", 9, color=FAINT)
                cx += 7
        return cx

    def check(self, x, y, label, size=7.8):
        c = self.c
        c.setStrokeColor(LABEL)
        c.setLineWidth(0.6)
        c.rect(x, H - y, 7.5, 7.5, stroke=1, fill=0)
        return self.text(x + 10.5, y - 0.6, label, size, color=INK) + 9

    def section(self, letter, title, note=None):
        self.y += 15
        self.text(M, self.y, f"{letter}  {title}", 10.5, "Sans-Bold", ACCENT)
        if note:
            self.text(M + self.width(f"{letter}  {title}", 10.5, "Sans-Bold") + 10, self.y, note, 7.6, color=FAINT)
        self.c.setStrokeColor(ACCENT)
        self.c.setLineWidth(0.8)
        self.c.line(M, H - self.y - 4, W - M, H - self.y - 4)
        self.y += 6

    def row(self, h=32):
        self.y += h
        return self.y

    def save(self):
        self.c.showPage()
        self.c.save()


def build():
    f = Form(OUT)
    c = f.c

    # ---------------------------------------------------------------- header
    f.y = M + 14
    f.text(M, f.y, "STUDENT DETAILS FORM", 15, "Sans-Bold", INK)
    f.text(W - M - 150, f.y, "Academic year  20____ – ____", 9, color=INK)
    f.y += 34
    f.field(M, f.y, CW, "School name")
    f.y += 14
    f.text(M, f.y, "Please write in CAPITAL letters.  * needed.  Tick ☐ where it applies.  Return this form to the class teacher.".replace("☐", "[ ]"), 7.6, color=FAINT)

    # ---------------------------------------------------------------- A. student
    f.section("A", "Student")
    photo_w, photo_h = 74, 92
    px = W - M - photo_w
    top = f.y + 6
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    c.setDash(2, 2)
    c.rect(px, H - top - photo_h, photo_w, photo_h, stroke=1, fill=0)
    c.setDash()
    f.text(px + 13, top + 42, "Paste recent", 7, color=FAINT)
    f.text(px + 10, top + 52, "passport photo", 7, color=FAINT)
    inner = px - 14 - M  # width left of the photo

    y = f.row(34)
    half = (inner - 14) / 2
    f.field(M, y, half, "Student's first name", True)
    f.field(M + half + 14, y, half, "Last name / surname")

    y = f.row()
    f.field(M, y, 70, "Class", True)
    f.field(M + 84, y, 48, "Section", True)
    end = f.boxes(M + 146, y, 8, "Date of birth (DD/MM/YYYY)", groups=[2, 2, 4], need=True)
    gx = end + 14
    f.text(gx, y - 19, "Gender", 7.6)
    gx = f.check(gx, y - 6, "Boy")
    gx = f.check(gx, y - 6, "Girl")
    f.check(gx, y - 6, "Other")

    y = f.row()
    f.text(M, y - 19, "Blood group", 7.6)
    bx = M
    for g in ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Not known"]:
        bx = f.check(bx, y - 6, g)

    y = f.row()
    end = f.boxes(M, y, 10, "Student's mobile (if any)")
    f.field(end + 14, y, W - M - end - 14, "Student's email (if any)")

    y = f.row()
    f.field(M, y, CW, "Home address (house no., street, area)")
    y = f.row()
    f.field(M, y, 190, "City / town")
    f.field(M + 204, y, 160, "State")
    f.boxes(M + 378, y, 6, "PIN code")

    y = f.row()
    f.field(M, y, 206, "Brother / sister in this school: name")
    f.field(M + 220, y, 56, "Class")
    sx = M + 290
    f.text(sx, y - 19, "School bus needed?", 7.6)
    sx = f.check(sx, y - 6, "Yes")
    sx = f.check(sx, y - 6, "No")
    f.field(sx + 6, y, W - M - sx - 6, "Pick-up stop")

    # ---------------------------------------------------------------- B. parents
    f.section("B", "Parents / guardian", "At least one mobile number is needed. Each mobile gets the school app: attendance, homework, fees, results.")
    col = (CW - 2 * 16) / 3
    heads = ["Father", "Mother", "Guardian (if not living with parents)"]
    y = f.row(16)
    for i, h in enumerate(heads):
        f.text(M + i * (col + 16), y, h, 8.6, "Sans-Bold", INK)
    y = f.row(30)
    for i in range(3):
        f.field(M + i * (col + 16), y, col, "Full name and relation (uncle, grandparent…)" if i == 2 else "Full name", i == 0)
    y = f.row()
    for i in range(3):
        f.boxes(M + i * (col + 16), y, 10, "Mobile number", need=(i == 0), bw=min(12.2, col / 10))
    y = f.row()
    f.field(M, y, CW, "Parent's email (if any)")

    # ---------------------------------------------------------------- declaration
    y = f.row(28)
    f.check(M, y - 13, "")
    f.text(M + 12, y - 13, "The details above are correct. I agree that the school may keep them in its school app to send me attendance, homework,", 7.8, color=INK)
    f.text(M + 12, y - 3, "fee and result updates, and will tell the school when a phone number or address changes.", 7.8, color=INK)
    y = f.row(36)
    f.field(M, y, 230, "Parent / guardian's signature")
    f.field(M + 244, y, 110, "Name")
    f.boxes(M + 368, y, 8, "Date", groups=[2, 2, 4])

    # ---------------------------------------------------------------- C. office
    f.y += 10
    box_top = f.y
    f.section("C", "For school office only", "Do not fill — parents leave this part blank.")
    y = f.row(30)
    f.field(M + 6, y, 100, "Admission no.", True)
    end = f.boxes(M + 120, y, 8, "Admission date", groups=[2, 2, 4])
    f.field(end + 14, y, 54, "Class", True)
    f.field(end + 82, y, 44, "Section", True)
    f.field(end + 140, y, W - M - 6 - (end + 140), "Roll no.")

    y = f.row()
    f.field(M + 6, y, 170, "Fee structure / category")
    ox = M + 190
    f.text(ox, y - 19, "Optional fees", 7.6)
    ox = f.check(ox, y - 6, "Transport")
    f.field(ox, y, 92, "Route / stop")
    ox += 102
    ox = f.check(ox, y - 6, "Computer Lab")
    ox = f.check(ox, y - 6, "")
    f.line(ox - 6, W - M - 6, y)

    y = f.row()
    f.text(M + 6, y - 19, "Concession", 7.6)
    cx = M + 6
    for g in ["None", "Sibling", "Staff ward", "Merit", "Other"]:
        cx = f.check(cx, y - 6, g)
    f.line(cx - 4, cx + 70, y)
    f.field(cx + 84, y, W - M - 6 - (cx + 84), "Approved by")

    # Fees already paid this year: a small ruled table
    y = f.row(19)
    f.text(M + 6, y, "Fees already paid this year (before the school app)", 8.2, "Sans-Bold", INK)
    cols = [("Amount ₹", 90), ("Date paid", 92), ("Paid by: Cash / UPI / Bank / Card", 170), ("Old receipt no. / UTR", None)]
    widths = [w for _, w in cols[:-1]]
    widths.append(CW - 12 - sum(widths))
    y = f.row(13)
    x = M + 6
    for (label, _), w in zip(cols, widths):
        f.text(x + 3, y, label, 7.4)
        x += w
    c.setStrokeColor(RULE)
    c.setLineWidth(0.6)
    t_top = y + 4
    rows = 3
    rh = 20
    for r in range(rows + 1):
        c.line(M + 6, H - (t_top + r * rh), W - M - 6, H - (t_top + r * rh))
    x = M + 6
    for w in widths + [0]:
        c.line(x, H - t_top, x, H - (t_top + rows * rh))
        x += w
    f.y = t_top + rows * rh

    y = f.row()
    f.field(M + 6, y, 170, "Checked by")
    f.field(M + 190, y, 160, "Entered in the school app on (date)")
    f.field(M + 364, y, W - M - 6 - (M + 364), "Initials")
    f.y += 9

    # dashed frame around the office part
    c.setStrokeColor(FAINT)
    c.setLineWidth(0.7)
    c.setDash(3, 2.5)
    c.roundRect(M - 4, H - f.y, CW + 8, f.y - box_top + 4, 6, stroke=1, fill=0)
    c.setDash()

    f.text(M, H - M + 14, "Office: type each form into the Students sheet (sections A–B), then Optional fees and Fees already paid (section C).", 6.8, color=FAINT)
    f.text(W - M - f.width("Bastaa · Student details form", 6.8), H - M + 14, "Bastaa · Student details form", 6.8, color=FAINT)

    assert f.y < H - M - 4, f"overflows the page by {f.y - (H - M - 4):.0f}pt"
    f.save()
    print(f"Wrote {OUT} (content ends {H - M - f.y:.0f}pt above the bottom margin)")


if __name__ == "__main__":
    build()
