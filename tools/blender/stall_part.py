import math
from mathutils import Vector

STALL_LIMIT = 400
DECO_LIMIT = 60
INK, STEEL, WOOD, SLATE = "#1a1026", "#5a5570", "#7a4e38", "#2c2640"
MAGENTA, CYAN, YELLOW, ORANGE, RED = "#ff2bd6", "#19e6ff", "#fff04a", "#ff7a1a", "#ff2e3d"
AMBER, ROSE, TEAL, BLUE, CREAM, WARM, LEAF = "#ffc21a", "#e8264f", "#17b8a6", "#2f6bff", "#ffe9c4", "#ffd27a", "#58c84a"
STEAM = "#c98fb6"
LAMP = "#e0ab7c"
MAT = "#3a2452"

FONT = {
    "A": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 4, 2, 5), (1, 2, 2, 3)],
    "C": [(0, 0, 1, 5), (1, 4, 3, 5), (1, 0, 3, 1)],
    "D": [(0, 0, 1, 5), (2, 1, 3, 4), (1, 4, 2, 5), (1, 0, 2, 1)],
    "E": [(0, 0, 1, 5), (1, 4, 3, 5), (1, 2, 2.5, 3), (1, 0, 3, 1)],
    "F": [(0, 0, 1, 5), (1, 4, 3, 5), (1, 2, 2.5, 3)],
    "H": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 2, 2, 3)],
    "I": [(1, 0, 2, 5)],
    "K": [(0, 0, 1, 5), (1, 2, 2, 3), (2, 3, 3, 5), (2, 0, 3, 2)],
    "L": [(0, 0, 1, 5), (1, 0, 3, 1)],
    "N": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 3.2, 2, 0.8, 2, 2.4, 1, 4.8)],
    "O": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 4, 2, 5), (1, 0, 2, 1)],
    "P": [(0, 0, 1, 5), (2, 2, 3, 5), (1, 4, 2, 5), (1, 2, 2, 3)],
    "R": [(0, 0, 1, 5), (2, 3, 3, 5), (1, 4, 2, 5), (1, 2, 2.2, 3), (2, 0, 3, 2)],
    "S": [(0, 4, 3, 5), (0, 3, 1, 4), (0, 2, 3, 3), (2, 1, 3, 2), (0, 0, 3, 1)],
    "T": [(1, 0, 2, 4), (0, 4, 3, 5)],
    "U": [(0, 0, 1, 5), (2, 0, 3, 5), (1, 0, 2, 1)],
    "2": [(0, 4, 3, 5), (2, 3, 3, 4), (0, 2, 3, 3), (0, 1, 1, 2), (0, 0, 3, 1)],
    "4": [(0, 2, 1, 5), (2, 0, 3, 5), (1, 2, 2, 3)],
}


def to_blender(p):
    return Vector((p[0], -p[2], p[1]))


def dim(hex_colour, share):
    return "#" + "".join(f"{round(int(hex_colour[i:i + 2], 16) * share):02x}" for i in (1, 3, 5))


def linear(hex_colour):
    out = []
    for i in (1, 3, 5):
        c = int(hex_colour[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*out, 1.0)


class Part:
    def __init__(self, name, limit):
        self.name, self.limit = name, limit
        self.points, self.faces, self.colours, self.slots = [], [], [], []
        self.footprint = None

    def face(self, pts, cols, glow=False):
        start = len(self.points)
        self.points += [to_blender(p) for p in pts]
        self.faces.append(tuple(range(start, start + len(pts))))
        self.colours += [linear(c) for c in cols] if isinstance(cols, (list, tuple)) else [linear(cols)] * len(pts)
        self.slots.append(1 if glow else 0)

    def box(self, c, s, col, top=None, low=None, glow=False, skip="b"):
        x0, x1 = c[0] - s[0] / 2, c[0] + s[0] / 2
        y0, y1 = c[1] - s[1] / 2, c[1] + s[1] / 2
        z0, z1 = c[2] - s[2] / 2, c[2] + s[2] / 2
        low = low or col
        side = [low, low, col, col]
        if "x" not in skip:
            self.face([(x1, y0, z1), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)], side, glow)
        if "X" not in skip:
            self.face([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)], side, glow)
        if "t" not in skip:
            self.face([(x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (x0, y1, z0)], top or col, glow)
        if "b" not in skip:
            self.face([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], low, glow)
        if "z" not in skip:
            self.face([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], side, glow)
        if "Z" not in skip:
            self.face([(x1, y0, z0), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)], side, glow)

    def post(self, x, z, y0, y1, col=STEEL, width=0.08):
        self.box((x, (y0 + y1) / 2, z), (width, y1 - y0, width), col, skip="tb")

    def prism(self, c, radius, length, n, col, top=None, axis="y", glow=False, cap=True):
        u, v = {"y": ((0, 0, 1), (1, 0, 0)), "x": ((0, 1, 0), (0, 0, 1)), "z": ((1, 0, 0), (0, 1, 0))}[axis]
        w = Vector(u).cross(Vector(v))
        centre = Vector(c)
        ring = []
        for i in range(n):
            a = math.tau * i / n
            ring.append(centre + (Vector(u) * math.cos(a) + Vector(v) * math.sin(a)) * radius)
        half = w * length / 2
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            self.face([a - half, b - half, b + half, a + half], col, glow)
        if cap:
            for i in range(1, n - 1):
                self.face([ring[0] + half, ring[i] + half, ring[i + 1] + half], top or col, glow)

    def bead(self, c, radius, tall, n, col, glow=True):
        x, y, z = c
        ring = [(x + radius * math.cos(math.tau * i / n), y, z - radius * math.sin(math.tau * i / n)) for i in range(n)]
        for i in range(n):
            a, b = ring[i], ring[(i + 1) % n]
            self.face([a, b, (x, y + tall, z)], col, glow)
            self.face([b, a, (x, y - tall, z)], col, glow)

    def lantern(self, c, radius, tall, n, col, band=None):
        x, y, z = c
        ring = lambda share, level: [
            (x + radius * share * math.cos(math.tau * i / n), level, z - radius * share * math.sin(math.tau * i / n)) for i in range(n)
        ]
        top, mid, low = ring(0.6, y + tall), ring(1.0, y), ring(0.6, y - tall)
        for i in range(n):
            j = (i + 1) % n
            self.face([mid[i], mid[j], top[j], top[i]], col, True)
            self.face([low[i], low[j], mid[j], mid[i]], col, True)
        for i in range(1, n - 1):
            self.face([top[0], top[i], top[i + 1]], band or col, True)
            self.face([low[i + 1], low[i], low[0]], band or col, True)

    def word(self, text, origin, right, up, height, col, stack=False, gap=0.22, wide=1.25):
        unit = height / 5
        o, r, u = Vector(origin), Vector(right), Vector(up)
        across = unit * wide
        for i, letter in enumerate(text):
            at = o - u * (i * height * (1 + gap)) if stack else o + r * (i * across * 3 * (1 + gap))
            for stroke in FONT[letter]:
                if len(stroke) == 4:
                    x0, y0, x1, y1 = stroke
                    corners = ((x0, y0), (x1, y0), (x1, y1), (x0, y1))
                else:
                    corners = tuple(zip(stroke[0::2], stroke[1::2]))
                self.face([at + r * cx * across + u * cy * unit for cx, cy in corners], col, True)

    def sign(self, c, wide, tall, facing, text, col, rim, height, stack=False, both=True):
        depth = 0.08
        size = (wide, tall, depth) if facing == "z" else (depth, tall, wide)
        self.box(c, size, rim, glow=True, skip="")
        for side in (1, -1) if both else (1,):
            if facing == "z":
                n, r = Vector((0, 0, side)), Vector((side, 0, 0))
            else:
                n, r = Vector((side, 0, 0)), Vector((0, 0, -side))
            u = Vector((0, 1, 0))
            mid = Vector(c) + n * (depth / 2 + 0.012)
            bw, bh = wide / 2 - 0.07, tall / 2 - 0.07
            self.face([mid - r * bw - u * bh, mid + r * bw - u * bh, mid + r * bw + u * bh, mid - r * bw + u * bh], INK)
            front = Vector(c) + n * (depth / 2 + 0.024)
            room_wide, room_tall = wide - 0.28, tall - 0.28
            if stack:
                fit = min(height, room_tall / (len(text) * 1.22 - 0.22), room_wide / 0.96)
                total = len(text) * fit * 1.22 - fit * 0.22
                start = front - r * (fit * 0.48) + u * (total / 2 - fit)
                self.word(text, start, r, u, fit, col, True, wide=1.6)
            else:
                span = (len(text) * 3 * 1.22 - 0.66) / 5 * 1.25
                fit = min(height, room_tall, room_wide / span)
                start = front - r * (span * fit / 2) - u * (fit / 2)
                self.word(text, start, r, u, fit, col)

    def awning(self, xb, xf, yb, yf, z0, z1, cols, n, drop=0.26, under=WARM, deep=ORANGE):
        step = (z1 - z0) / n
        for i in range(n):
            a, b = z0 + i * step, z0 + (i + 1) * step
            col = cols[i % len(cols)]
            self.face([(xb, yb, b), (xf, yf, b), (xf, yf, a), (xb, yb, a)], col)
            self.face([(xf, yf - drop, b), (xf, yf - drop, a), (xf, yf, a), (xf, yf, b)], col)
            self.face([(xf, yf - drop, a), (xf, yf - drop, b), (xf, yf - drop - step * 0.42, (a + b) / 2)], col)
        lift = 0.03
        self.face([(xb, yb - lift, z0), (xf, yf - lift, z0), (xf, yf - lift, z1), (xb, yb - lift, z1)], [deep, under, under, deep], True)
        self.face([(xf, yf - drop, z0), (xf, yf - drop, z1), (xf, yf, z1), (xf, yf, z0)], SLATE)
        edge = cols[0]
        self.face([(xb, yb - drop, z1), (xf, yf - drop, z1), (xf, yf, z1), (xb, yb, z1)], edge)
        self.face([(xf, yf - drop, z0), (xb, yb - drop, z0), (xb, yb, z0), (xf, yf, z0)], edge)

    def mat(self, wide, deep, col=MAT):
        x, z = deep / 2, wide / 2
        self.face([(-x, 0.02, z), (x, 0.02, z), (x, 0.02, -z), (-x, 0.02, -z)], col)
        self.footprint = {"depth": round(deep, 2), "wide": round(wide, 2)}

    def steam(self, x, y, z, puffs=3):
        rises = ((0.0, 0.0, 0.0, 0.2, 0.2), (0.08, 0.44, -0.06, 0.3, 0.26), (-0.04, 0.98, 0.06, 0.4, 0.3))
        for (dx, dy, dz, radius, tall), share in zip(rises[:puffs], (1.0, 0.85, 0.7)):
            self.lantern((x + dx, y + dy, z + dz), radius, tall, 4, dim(STEAM, share))

    def triangles(self):
        return sum(len(f) - 2 for f in self.faces)

    def glow_triangles(self):
        return sum(len(f) - 2 for f, s in zip(self.faces, self.slots) if s == 1)
