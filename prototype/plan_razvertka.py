import math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A3, landscape
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

D = "/usr/share/fonts/truetype/dejavu/"
pdfmetrics.registerFont(TTFont("C", D + "DejaVuSansCondensed.ttf"))
pdfmetrics.registerFont(TTFont("CB", D + "DejaVuSansCondensed-Bold.ttf"))
pdfmetrics.registerFont(TTFont("CI", D + "DejaVuSansCondensed-Oblique.ttf"))

OUT = "/mnt/user-data/outputs/Развернутый_план_помещения.pdf"
PW, PH = landscape(A3)

# room model (условные единицы ~ метры, без масштаба)
L, W, H, T = 17.0, 7.5, 3.5, 0.3
U = 12.2 * mm
X0, Y0 = 14 * mm, 46 * mm

RED = colors.HexColor("#C0392B")
INK = colors.HexColor("#1A1A1A")
GREY = colors.HexColor("#8A8A8A")
LIGHT = colors.HexColor("#EFEFEF")
WOOD = colors.HexColor("#E9D8C4")
GLASS = colors.HexColor("#DCEBF5")

c = canvas.Canvas(OUT, pagesize=(PW, PH))
c.setTitle("Развёрнутый план помещения")


def P(x, y):
    return X0 + (x + T + H) * U, Y0 + (y + T + H) * U


def wall_pt(wall, s, h):
    """точка на развёрнутой стене: s — вдоль стены, h — высота от пола"""
    if wall == "A":   # нижняя, оконная (y=0)
        return P(s, -T - h)
    if wall == "B":   # верхняя, дверная (y=W)
        return P(s, W + T + h)
    if wall == "V":   # левая, передняя (x=0)
        return P(-T - h, s)
    if wall == "G":   # правая, задняя (x=L)
        return P(L + T + h, s)


def wpoly(wall, s0, s1, h0, h1, stroke=INK, fill=None, lw=0.6, dash=None):
    pts = [wall_pt(wall, s0, h0), wall_pt(wall, s1, h0), wall_pt(wall, s1, h1), wall_pt(wall, s0, h1)]
    poly(pts, stroke, fill, lw, dash)


def wline(wall, s0, h0, s1, h1, color=INK, lw=0.5, dash=None):
    a, b = wall_pt(wall, s0, h0), wall_pt(wall, s1, h1)
    line(a, b, color, lw, dash)


def poly(pts, stroke=INK, fill=None, lw=0.6, dash=None):
    c.saveState()
    c.setLineWidth(lw)
    c.setStrokeColor(stroke)
    if dash:
        c.setDash(list(dash))
    p = c.beginPath()
    p.moveTo(*pts[0])
    for q in pts[1:]:
        p.lineTo(*q)
    p.close()
    if fill is not None:
        c.setFillColor(fill)
        c.drawPath(p, stroke=1, fill=1)
    else:
        c.drawPath(p, stroke=1, fill=0)
    c.restoreState()


def line(a, b, color=INK, lw=0.5, dash=None):
    c.saveState()
    c.setStrokeColor(color)
    c.setLineWidth(lw)
    if dash:
        c.setDash(list(dash))
    c.line(a[0], a[1], b[0], b[1])
    c.restoreState()


def rect(x0, y0, x1, y1, **kw):
    poly([P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], **kw)


def text(xy, s, size=7, font="C", color=INK, anchor="c", rot=0):
    c.saveState()
    c.setFont(font, size)
    c.setFillColor(color)
    c.translate(*xy)
    c.rotate(rot)
    if anchor == "c":
        c.drawCentredString(0, -size * 0.35, s)
    elif anchor == "l":
        c.drawString(0, -size * 0.35, s)
    else:
        c.drawRightString(0, -size * 0.35, s)
    c.restoreState()


def marker(xy, n, r=3.2 * mm):
    c.saveState()
    c.setFillColor(colors.white)
    c.setStrokeColor(RED)
    c.setLineWidth(1.2)
    c.circle(xy[0], xy[1], r, stroke=1, fill=1)
    c.setFillColor(RED)
    c.setFont("CB", 9)
    c.drawCentredString(xy[0], xy[1] - 3.2, str(n))
    c.restoreState()


# ---------------- элементы стен (развёртка) ----------------
def window(wall, s0, s1, h0=0.9, h1=3.1, open_sash=None):
    wpoly(wall, s0, s1, h0, h1, fill=GLASS, lw=0.8)
    wpoly(wall, s0 + 0.08, s1 - 0.08, h0 + 0.08, h1 - 0.08, lw=0.4)
    mid = (s0 + s1) / 2
    wline(wall, mid, h0 + 0.08, mid, h1 - 0.62, lw=0.4)
    wline(wall, s0 + 0.08, h1 - 0.62, s1 - 0.08, h1 - 0.62, lw=0.4)
    if open_sash:
        # створка открыта: условные линии к стороне петель
        a, b = open_sash
        hm = (h0 + h1 - 0.62) / 2
        wline(wall, b, h0 + 0.1, a, hm, color=RED, lw=0.6, dash=(3, 2))
        wline(wall, b, h1 - 0.7, a, hm, color=RED, lw=0.6, dash=(3, 2))
    # подоконник
    wpoly(wall, s0 - 0.1, s1 + 0.1, h0 - 0.06, h0, fill=colors.white, lw=0.5)


def radiator(wall, sc, w=1.2):
    s0, s1 = sc - w / 2, sc + w / 2
    wpoly(wall, s0, s1, 0.15, 0.7, fill=colors.white, lw=0.5)
    n = 10
    for i in range(1, n):
        s = s0 + (s1 - s0) * i / n
        wline(wall, s, 0.18, s, 0.67, lw=0.3)


def door(wall, s0, s1, label, hinge_left=True):
    wpoly(wall, s0, s1, 0, 2.1, fill=WOOD, lw=0.8)
    wpoly(wall, s0 + 0.1, s1 - 0.1, 0.15, 0.95, lw=0.35)
    wpoly(wall, s0 + 0.1, s1 - 0.1, 1.1, 1.95, lw=0.35)
    hx = s1 - 0.15 if hinge_left else s0 + 0.15
    a = wall_pt(wall, hx, 1.0)
    c.setFillColor(INK)
    c.circle(a[0], a[1], 0.8, fill=1, stroke=0)
    text(wall_pt(wall, (s0 + s1) / 2, 2.4), label, 7, "CB")


# стена А — оконная (вдоль окон)
WIN_A = [(1.0, 2.6), (4.3, 5.9), (7.6, 9.2), (10.9, 12.5), (14.2, 15.8)]
for s0, s1 in WIN_A:
    window("A", s0, s1)
    radiator("A", (s0 + s1) / 2)

# стена Г — задняя (2 окна, одно открыто: окно №2)
window("G", 0.9, 3.0, open_sash=(0.9, 1.95))
radiator("G", 1.95)
window("G", 4.5, 6.6)
radiator("G", 5.55)

# стена Б — дверная
door("B", 2.0, 2.9, "Д1")
door("B", 11.6, 12.5, "Д2")
# вешалка
wpoly("B", 13.0, 16.3, 1.55, 1.85, fill=WOOD, lw=0.6)
for i in range(12):
    s = 13.2 + i * 0.27
    wline("B", s, 1.85, s, 2.0, lw=0.5)
text(wall_pt("B", 14.65, 2.35), "вешалка", 6.5, "CI")
# картины
for s0, s1, h0, h1 in [(3.7, 4.2, 1.6, 2.25), (5.9, 6.3, 1.7, 2.1), (8.0, 8.35, 1.7, 2.1)]:
    wpoly("B", s0, s1, h0, h1, fill=colors.HexColor("#F3EBD3"), lw=0.5)
text(wall_pt("B", 6.0, 2.55), "картины", 6.5, "CI")

# стена В — передняя (экран, доска, камера)
wpoly("V", 2.2, 5.0, 0.9, 1.6, fill=colors.HexColor("#3E6B4F"), lw=0.7)
wline("V", 3.13, 0.9, 3.13, 1.6, color=colors.white, lw=0.6)
wline("V", 4.07, 0.9, 4.07, 1.6, color=colors.white, lw=0.6)
wpoly("V", 1.4, 5.6, 1.75, 3.3, fill=colors.white, lw=0.8)
text(wall_pt("V", 3.5, 2.55), "экран", 7, "CI", rot=-90)
text(wall_pt("V", 3.6, 1.25), "доска", 6.5, "CI", color=colors.white, rot=-90)
cam = wall_pt("V", 7.05, 3.25)
c.setFillColor(INK)
c.rect(cam[0] - 2, cam[1] - 2, 4, 4, fill=1, stroke=0)
text((cam[0] + 7, cam[1]), "видеокамера", 5.5, "CI", rot=-90)

# ---------------- линии сгиба и подписи развёрток ----------------
for a, b in [(P(-T, -T), P(L + T, -T)), (P(-T, W + T), P(L + T, W + T)),
             (P(-T, -T), P(-T, W + T)), (P(L + T, -T), P(L + T, W + T))]:
    line(a, b, GREY, 0.5, dash=(8, 2, 1, 2))

# контуры развёрток стен (потолочная линия)
poly([P(0, -T - H), P(L, -T - H), P(L, -T), P(0, -T)], GREY, None, 0.5)
poly([P(0, W + T), P(L, W + T), P(L, W + T + H), P(0, W + T + H)], GREY, None, 0.5)
poly([P(-T - H, 0), P(-T, 0), P(-T, W), P(-T - H, W)], GREY, None, 0.5)
poly([P(L + T, 0), P(L + T + H, 0), P(L + T + H, W), P(L + T, W)], GREY, None, 0.5)

text(P(L / 2, -T - H + 0.25), "СТЕНА А — оконная (развёртка)", 8, "CB", GREY)
text(P(L / 2, W + T + H - 0.25), "СТЕНА Б — с дверями (развёртка)", 8, "CB", GREY)
text(P(-T - 3.42, W / 2), "СТЕНА В — передняя (развёртка)", 7, "CB", GREY, rot=90)
text(P(L + T + 3.42, W / 2), "СТЕНА Г — задняя (развёртка)", 7, "CB", GREY, rot=-90)

# ---------------- план пола ----------------
# стены (толщина), с штриховкой
poly([P(-T, -T), P(L + T, -T), P(L + T, W + T), P(-T, W + T)], INK, LIGHT, 1.4)
rect(0, 0, L, W, stroke=INK, fill=colors.white, lw=1.2)
c.saveState()
p = c.beginPath()
for q in [[P(-T, -T), P(L + T, -T), P(L + T, W + T), P(-T, W + T)]]:
    p.moveTo(*q[0])
    for r in q[1:]:
        p.lineTo(*r)
    p.close()
x0, y0 = P(0, 0)
x1, y1 = P(L, W)
p.moveTo(x0, y0); p.lineTo(x0, y1); p.lineTo(x1, y1); p.lineTo(x1, y0); p.close()
c.clipPath(p, stroke=0, fill=0, fillMode=1)
c.setStrokeColor(GREY)
c.setLineWidth(0.35)
ax, ay = P(-T, -T)
bx, by = P(L + T, W + T)
k = ax - (by - ay)
while k < bx:
    c.line(k, ay, k + (by - ay), by)
    k += 2.2 * mm
c.restoreState()


def wall_gap_x(x0_, x1_, y_side, kind):
    """проём в горизонтальной стене плана"""
    if y_side == 0:
        rect(x0_, -T, x1_, 0, stroke=INK, fill=colors.white, lw=0.8)
        yy = [-T * 0.35, -T * 0.65]
    else:
        rect(x0_, W, x1_, W + T, stroke=INK, fill=colors.white, lw=0.8)
        yy = [W + T * 0.35, W + T * 0.65]
    if kind == "win":
        for y in yy:
            line(P(x0_, y), P(x1_, y), INK, 0.4)


def wall_gap_y(y0_, y1_, x_side, kind):
    if x_side == 0:
        rect(-T, y0_, 0, y1_, stroke=INK, fill=colors.white, lw=0.8)
        xx = [-T * 0.35, -T * 0.65]
    else:
        rect(L, y0_, L + T, y1_, stroke=INK, fill=colors.white, lw=0.8)
        xx = [L + T * 0.35, L + T * 0.65]
    if kind == "win":
        for x in xx:
            line(P(x, y0_), P(x, y1_), INK, 0.4)


for s0, s1 in WIN_A:
    wall_gap_x(s0, s1, 0, "win")
    rect(s0 + 0.2, 0.05, s1 - 0.2, 0.22, stroke=INK, fill=colors.white, lw=0.4)  # радиатор
wall_gap_y(0.9, 3.0, L, "win")
wall_gap_y(4.5, 6.6, L, "win")
rect(L - 0.22, 1.35, L - 0.05, 2.55, stroke=INK, fill=colors.white, lw=0.4)
rect(L - 0.22, 4.95, L - 0.05, 6.15, stroke=INK, fill=colors.white, lw=0.4)
wall_gap_x(2.0, 2.9, W, "door")
wall_gap_x(11.6, 12.5, W, "door")
text(P(2.45, W + T / 2), "Д1", 6.5, "CB")
text(P(12.05, W + T / 2), "Д2", 6.5, "CB")

# открытая створка окна №2 (внутрь помещения)
hx, hy = L, 0.9
ang = math.radians(55)
lw_ = 1.05
ex, ey = hx - lw_ * math.sin(ang), hy + lw_ * math.cos(ang)
line(P(hx, hy), P(ex, ey), RED, 1.4)
c.saveState()
c.setStrokeColor(RED)
c.setLineWidth(0.5)
c.setDash(2, 2)
cx_, cy_ = P(hx, hy)
r_ = lw_ * U
c.arc(cx_ - r_, cy_ - r_, cx_ + r_, cy_ + r_, 90, 55)
c.restoreState()

# ряды столов и стулья
ROW0, PITCH, NROW = 2.6, 1.35, 10
COLS = [(1.0, 2.9), (4.2, 6.1)]
for i in range(NROW):
    x = ROW0 + i * PITCH
    for y0_, y1_ in COLS:
        rect(x, y0_, x + 0.6, y1_, stroke=INK, fill=WOOD, lw=0.6)
        for k in range(3):
            yc = y0_ + 0.32 + k * 0.63
            rect(x + 0.68, yc - 0.19, x + 1.02, yc + 0.19, stroke=colors.HexColor("#2C4FA3"),
                 fill=colors.HexColor("#C9D6F2"), lw=0.4)
text(P(ROW0 + 4.5 * PITCH + 0.3, 1.95 - 0.0), "", 6)

# стол преподавателя
poly([P(1.5, 1.0), P(2.2, 1.0), P(2.2, 3.2), P(1.62, 3.2), P(1.5, 2.9)], INK, colors.HexColor("#E0C49E"), 0.8)
rect(1.0, 1.95, 1.34, 2.33, stroke=colors.HexColor("#2C4FA3"), fill=colors.HexColor("#C9D6F2"), lw=0.4)
# клавиатура на стыке
poly([P(2.05, 1.55), P(2.35, 1.55), P(2.35, 2.45), P(2.05, 2.45)], INK, colors.HexColor("#444444"), 0.3)
# кафедра
rect(0.25, 0.95, 0.85, 1.65, stroke=INK, fill=colors.HexColor("#C79A6B"), lw=0.8)
text(P(0.55, 1.3), "К", 7, "CB")
# микрофонная стойка
mx, my = P(1.15, 0.5)
c.setStrokeColor(INK); c.setLineWidth(0.6)
c.circle(mx, my, 1.6 * mm, stroke=1, fill=0)
c.line(mx - 1.6 * mm, my, mx + 1.6 * mm, my)
# стол у передней стены и корзина
rect(0.2, 4.6, 0.8, 6.6, stroke=INK, fill=WOOD, lw=0.6)
rect(0.3, 6.75, 0.75, 7.2, stroke=INK, fill=colors.HexColor("#666666"), lw=0.4)
# экран/доска на плане (линия у стены)
line(P(0.06, 1.4), P(0.06, 5.6), INK, 2.0)
# проектор (на потолке)
rect(5.3, 3.5, 5.75, 3.95, stroke=INK, fill=None, lw=0.7, dash=(2, 1.5))
text(P(5.52, 3.25), "проектор (потолок)", 5.5, "CI", GREY)

# подписи на плане
text(P(9.0, 3.55), "ПОЛ — план помещения", 9, "CB", GREY)
text(P(9.0, 3.2), "центральный проход", 6.5, "CI", GREY)

# метки (бирки)
marker(P(1.85, 2.75), 1)
marker(P(L - 0.45, 2.3), 2)
marker(P(14.55, 3.6), 4)
m3 = P(L + T + 1.0, -T - 1.1)
tgt = wall_pt("G", 1.2, 0.9)
line(m3, tgt, RED, 0.6, dash=(3, 2))
c.setFillColor(RED); c.circle(tgt[0], tgt[1], 0.9 * mm, fill=1, stroke=0)
marker(m3, 3)
text((m3[0] + 4.5 * mm, m3[1] + 1.6 * mm), "снаружи здания,", 6.5, "CI", RED, anchor="l")
text((m3[0] + 4.5 * mm, m3[1] - 1.6 * mm), "на наружном отливе", 6.5, "CI", RED, anchor="l")
text((m3[0] + 4.5 * mm, m3[1] - 4.8 * mm), "окна № 2", 6.5, "CI", RED, anchor="l")
marker(wall_pt("G", 1.3, 1.8), 2, r=2.6 * mm)

# ---------------- размерные линии ----------------
def dim(a, b, label, off_vec, rot=0):
    ox, oy = off_vec
    a2 = (a[0] + ox, a[1] + oy)
    b2 = (b[0] + ox, b[1] + oy)
    line(a, a2, GREY, 0.35)
    line(b, b2, GREY, 0.35)
    line(a2, b2, INK, 0.5)
    for q in (a2, b2):
        c.saveState()
        c.translate(*q)
        c.rotate(45)
        c.setStrokeColor(INK)
        c.setLineWidth(0.9)
        c.line(-1.6 * mm, 0, 1.6 * mm, 0)
        c.restoreState()
    mxy = ((a2[0] + b2[0]) / 2, (a2[1] + b2[1]) / 2)
    if rot == 0:
        text((mxy[0], mxy[1] + 2.4 * mm), label, 8, "C")
    else:
        text((mxy[0] - 2.4 * mm, mxy[1]), label, 8, "C", rot=90)


dim(P(0, W + T + H), P(L, W + T + H), "L (длина помещения) = ________ м", (0, 6 * mm))
dim(P(L + T + H, 0), P(L + T + H, W), "W (ширина) = ________ м", (10 * mm, 0), rot=90)
dim(P(L + 0.2, -T), P(L + 0.2, -T - H), "h = ______ м", (3 * mm, 0), rot=90)

# ---------------- заголовок ----------------
c.setFillColor(INK)
c.setFont("CB", 15)
c.drawString(14 * mm, PH - 14 * mm, "Развёрнутый план помещения (план-схема с развёрткой стен)")
c.setFont("C", 9.5)
c.drawString(14 * mm, PH - 20 * mm,
             "Аудитория юридического института, ул. Широкая, 33 — приложение к протоколу осмотра места происшествия от 22.10.2026")

# ---------------- легенда ----------------
LX = PW - 88 * mm
ly = PH - 32 * mm
c.setFont("CB", 10)
c.drawString(LX, ly, "Условные обозначения")
ly -= 7 * mm


def leg(draw, label, label2=None):
    global ly
    draw(LX + 5 * mm, ly)
    c.setFont("C", 7.3)
    c.setFillColor(INK)
    if label2:
        c.drawString(LX + 12 * mm, ly + 0.6 * mm, label)
        c.drawString(LX + 12 * mm, ly - 2.9 * mm, label2)
        ly -= 7.4 * mm
    else:
        c.drawString(LX + 12 * mm, ly - 2.5, label)
        ly -= 6.2 * mm


def lg_marker(n):
    return lambda x, y: marker((x, y), n, r=2.6 * mm)


def lg_box(fill, stroke=INK, dash=None):
    def f(x, y):
        c.saveState()
        c.setFillColor(fill if fill else colors.white)
        c.setStrokeColor(stroke)
        c.setLineWidth(0.6)
        if dash:
            c.setDash(list(dash))
        c.rect(x - 4 * mm, y - 2 * mm, 8 * mm, 4 * mm, fill=1 if fill else 0, stroke=1)
        c.restoreState()
    return f


def lg_window(x, y):
    c.setFillColor(colors.white); c.setStrokeColor(INK); c.setLineWidth(0.7)
    c.rect(x - 4 * mm, y - 1.5 * mm, 8 * mm, 3 * mm, fill=1, stroke=1)
    c.setLineWidth(0.4)
    c.line(x - 4 * mm, y - 0.5 * mm, x + 4 * mm, y - 0.5 * mm)
    c.line(x - 4 * mm, y + 0.5 * mm, x + 4 * mm, y + 0.5 * mm)


def lg_fold(x, y):
    c.saveState(); c.setStrokeColor(GREY); c.setLineWidth(0.6); c.setDash([8, 2, 1, 2])
    c.line(x - 4.5 * mm, y, x + 4.5 * mm, y); c.restoreState()


def lg_sash(x, y):
    c.saveState(); c.setStrokeColor(RED); c.setLineWidth(1.3)
    c.line(x - 4 * mm, y - 2 * mm, x + 3 * mm, y + 2 * mm); c.restoreState()


leg(lg_marker(1), "Предметы на столе преподавателя:", "клавиатура, мышь, карандаши")
leg(lg_marker(2), "Окно с открытой створкой", "(предполагаемый путь проникновения)")
leg(lg_marker(3), "Грязевой след на наружном отливе", "окна № 2 (снаружи здания)")
leg(lg_marker(4), "Шариковая ручка на полу в проходе")
ly -= 1.5 * mm
leg(lg_window, "Оконный проём (на плане)")
leg(lg_sash, "Створка окна, открытая внутрь помещения")
leg(lg_box(WOOD), "Двери Д1 (вход из коридора), Д2; столы")
leg(lg_box(colors.HexColor("#C9D6F2"), colors.HexColor("#2C4FA3")), "Стулья")
leg(lg_box(colors.HexColor("#E0C49E")), "Стол преподавателя")
leg(lg_box(colors.HexColor("#C79A6B")), "К — кафедра (трибуна)")
leg(lg_box(None, INK, (2, 1.5)), "Проектор (на потолке)")
leg(lg_box(colors.white), "Радиаторы отопления")
leg(lg_fold, "Линия сгиба: стены развёрнуты на плоскость пола")

ly -= 2 * mm
c.setFont("CB", 8.5)
c.drawString(LX, ly, "Примечания")
ly -= 5 * mm
notes = [
    "1. Схема составлена по фотоснимкам,",
    "    масштаб не соблюдён.",
    "2. Размеры L, W, h и расстояния от меток",
    "    до стен внести по результатам замеров.",
    "3. Направление на север: ________________",
    "4. Метка № 3 находится вне помещения.",
]
c.setFont("C", 7.5)
for n in notes:
    c.drawString(LX, ly, n)
    ly -= 4.3 * mm

# ---------------- штамп ----------------
SX, SY = LX - 2 * mm, 12 * mm
SW = PW - 10 * mm - SX
rows = [
    ("Наименование", "План-схема места происшествия"),
    ("Объект", "Аудитория, ул. Широкая, 33"),
    ("Составил", ""),
    ("Участники", ""),
    ("Дата", "22.10.2026"),
    ("Масштаб", "без масштаба   Лист 1 / 1"),
]
rh = 6.5 * mm
c.setStrokeColor(INK)
c.setLineWidth(1.0)
c.rect(SX, SY, SW, rh * len(rows), stroke=1, fill=0)
c.setLineWidth(0.4)
for i, (k_, v_) in enumerate(rows):
    yy = SY + rh * (len(rows) - 1 - i)
    if i:
        c.line(SX, yy + rh, SX + SW, yy + rh)
    c.setFont("CB", 7)
    c.drawString(SX + 2 * mm, yy + 2.2 * mm, k_)
    c.setFont("C", 7.5)
    c.drawString(SX + 27 * mm, yy + 2.2 * mm, v_)
c.line(SX + 25 * mm, SY, SX + 25 * mm, SY + rh * len(rows))

# рамка листа
c.setStrokeColor(INK)
c.setLineWidth(1.2)
c.rect(8 * mm, 7 * mm, PW - 16 * mm, PH - 14 * mm, stroke=1, fill=0)

c.save()
print("ok")
