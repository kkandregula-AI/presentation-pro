import json
import os
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent

ROBOTO_REG_CANDIDATES = [
    "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf",
    "/usr/share/fonts/truetype/roboto/Roboto-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
ROBOTO_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/roboto/Roboto-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]

def existing_font(candidates):
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[-1]

FONT_REG = existing_font(ROBOTO_REG_CANDIDATES)
FONT_BOLD = existing_font(ROBOTO_BOLD_CANDIDATES)

THEMES = {
    "midnight": {
        "bg1": (9, 17, 31),
        "bg2": (16, 25, 53),
        "bg3": (13, 27, 61),
        "card": (10, 18, 34, 235),
        "border": (255, 255, 255, 70),
        "title": (255, 255, 255),
        "text": (245, 248, 255),
        "accent": (124, 152, 255),
        "accent2": (135, 239, 255),
    },
    "ivory": {
        "bg1": (255, 250, 242),
        "bg2": (247, 239, 227),
        "bg3": (242, 234, 220),
        "card": (255, 255, 255, 245),
        "border": (27, 35, 58, 35),
        "title": (27, 35, 58),
        "text": (40, 48, 70),
        "accent": (0, 90, 214),
        "accent2": (122, 92, 255),
    },
    "carbon": {
        "bg1": (17, 18, 19),
        "bg2": (31, 35, 40),
        "bg3": (13, 13, 16),
        "card": (22, 26, 34, 235),
        "border": (255, 255, 255, 55),
        "title": (247, 249, 255),
        "text": (240, 244, 250),
        "accent": (0, 212, 255),
        "accent2": (143, 124, 255),
    },
}

def font(path, size):
    return ImageFont.truetype(path, size=size)

def rounded_rectangle(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)

def make_gradient(size, c1, c2, c3):
    w, h = size
    img = Image.new("RGB", size, c1)
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        for x in range(w):
            s = x / max(w - 1, 1)
            a = tuple(int(c1[i] * (1 - t) + c2[i] * t) for i in range(3))
            b = tuple(int(a[i] * (1 - s * 0.35) + c3[i] * s * 0.35) for i in range(3))
            px[x, y] = b
    return img

def glow(base, center, radius, color):
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    overlay = overlay.filter(ImageFilter.GaussianBlur(radius // 2))
    return Image.alpha_composite(base.convert("RGBA"), overlay)

def text_width(draw, text, fnt):
    return draw.textlength(text, font=fnt)

def wrap_text(draw, text, fnt, max_width):
    words = str(text).split()
    lines = []
    current = ""
    for word in words:
        test = word if not current else current + " " + word
        if text_width(draw, test, fnt) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]

def centered_text(draw, text, y, fnt, fill, cx):
    tw = text_width(draw, text, fnt)
    draw.text((cx - tw / 2, y), text, font=fnt, fill=fill)

def draw_centered_paragraph(draw, text, box, fnt, fill, line_gap=12):
    x1, y1, x2, y2 = box
    lines = []
    for paragraph in str(text).split("\n"):
        if not paragraph.strip():
            lines.append("")
            continue
        lines.extend(wrap_text(draw, paragraph, fnt, x2 - x1))
    y = y1
    ascent, descent = fnt.getmetrics()
    line_h = ascent + descent + line_gap
    cx = (x1 + x2) / 2
    for line in lines:
        centered_text(draw, line, y, fnt, fill, cx)
        y += line_h
        if y > y2:
            break
    return y

def draw_centered_bullets(draw, bullets, box, fnt, fill, bullet_color, line_gap=14):
    x1, y1, x2, y2 = box
    y = y1
    cx = (x1 + x2) / 2
    ascent, descent = fnt.getmetrics()
    line_h = ascent + descent + line_gap
    for bullet in bullets:
        lines = wrap_text(draw, str(bullet), fnt, x2 - x1 - 90)
        for idx, line in enumerate(lines):
            tw = text_width(draw, line, fnt)
            block_w = tw + 38
            left = cx - (block_w / 2)
            if idx == 0:
                draw.ellipse((left, y + 12, left + 10, y + 22), fill=bullet_color)
            draw.text((left + 24, y), line, font=fnt, fill=fill)
            y += line_h
            if y > y2:
                return y
        y += 8
    return y

def fit_and_paste(base, img_path, box, radius=24, contain=True):
    x1, y1, x2, y2 = map(int, box)
    w, h = x2 - x1, y2 - y1
    image = Image.open(img_path).convert("RGB")
    if contain:
        image.thumbnail((w, h))
        canvas = Image.new("RGB", (w, h), (23, 27, 40))
        offx = (w - image.width) // 2
        offy = (h - image.height) // 2
        canvas.paste(image, (offx, offy))
    else:
        ratio = max(w / image.width, h / image.height)
        nw, nh = int(image.width * ratio), int(image.height * ratio)
        image = image.resize((nw, nh))
        left = (nw - w) // 2
        top = (nh - h) // 2
        canvas = image.crop((left, top, left + w, top + h))
    mask = Image.new("L", (w, h), 0)
    mdraw = ImageDraw.Draw(mask)
    mdraw.rounded_rectangle((0, 0, w, h), radius=radius, fill=255)
    base.paste(canvas, (x1, y1), mask)

def draw_presenter(base, img_path, box):
    x1, y1, x2, y2 = map(int, box)
    w, h = x2 - x1, y2 - y1
    image = Image.open(img_path).convert("RGB").resize((w, h))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, w, h), radius=24, fill=255)
    shadow = Image.new("RGBA", (w + 20, h + 20), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((10, 10, w + 10, h + 10), radius=24, fill=(0, 0, 0, 90))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(shadow, (x1 - 10, y1 - 10))
    base.paste(image, (x1, y1), mask)
    border = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(border).rounded_rectangle((0, 0, w - 1, h - 1), radius=24, outline=(255, 255, 255, 180), width=2)
    base.alpha_composite(border, (x1, y1))

def main():
    src = Path(sys.argv[1])
    out = Path(sys.argv[2])
    payload = json.loads(src.read_text())
    width = int(payload["width"])
    height = int(payload["height"])
    theme_name = payload.get("theme", "midnight")
    theme = THEMES.get(theme_name, THEMES["midnight"])
    title = payload.get("title", "Untitled Slide")
    subtitle = payload.get("subtitle", "")
    body = payload.get("body", "")
    bullets = payload.get("bullets", [])
    if not bullets and body:
        bullets = [line.strip() for line in str(body).split("\n") if line.strip()]
    layout = payload.get("layout", "image-right-text-left")
    project_title = payload.get("projectTitle", "Presentation")
    project_subtitle = payload.get("projectSubtitle", "")
    slide_label = payload.get("slideLabel", "")
    image_path = payload.get("imagePath") or ""
    presenter_path = payload.get("presenterPath") or ""
    portrait = width < height

    base = make_gradient((width, height), theme["bg1"], theme["bg2"], theme["bg3"]).convert("RGBA")
    base = glow(base, (int(width * 0.12), int(height * 0.12)), int(min(width, height) * 0.16), (*theme["accent"], 110))
    base = glow(base, (int(width * 0.9), int(height * 0.85)), int(min(width, height) * 0.18), (*theme["accent2"], 80))
    draw = ImageDraw.Draw(base)

    outer_pad = 60 if not portrait else 34
    topbar_h = 68
    title_f = font(FONT_BOLD, 54 if not portrait else 44)
    subtitle_f = font(FONT_REG, 16 if not portrait else 15)
    body_f = font(FONT_REG, 24 if not portrait else 25)
    bullet_f = font(FONT_REG, 25 if not portrait else 26)
    project_f = font(FONT_BOLD, 24 if not portrait else 26)
    meta_f = font(FONT_REG, 14)

    draw.text((outer_pad, outer_pad), project_title, font=project_f, fill=theme["title"])
    if project_subtitle:
        draw.text((outer_pad, outer_pad + 34), project_subtitle, font=meta_f, fill=theme["text"])

    pill_w = 122
    pill_h = 40
    pill_x = width - outer_pad - pill_w
    pill_y = outer_pad
    rounded_rectangle(draw, (pill_x, pill_y, pill_x + pill_w, pill_y + pill_h), 20, theme["card"], outline=theme["border"], width=1)
    draw.text((pill_x + 20, pill_y + 11), slide_label, font=meta_f, fill=theme["title"])

    content_top = outer_pad + topbar_h
    content_bottom = height - outer_pad - 44
    content_left = outer_pad
    content_right = width - outer_pad
    content_fill = theme["title"] if theme_name in ("midnight", "carbon") else theme["text"]

    def card(box, radius=28):
        rounded_rectangle(draw, box, radius, theme["card"], outline=theme["border"], width=1)

    def add_tag_centered(box_top, box_left, box_right, text):
        if not text:
            return box_top
        tw = int(text_width(draw, text, subtitle_f)) + 28
        x = (box_left + box_right - tw) / 2
        rounded_rectangle(draw, (x, box_top, x + tw, box_top + 34), 17, (255,255,255,18), outline=theme["border"], width=1)
        draw.text((x + 14, box_top + 8), text, font=subtitle_f, fill=theme["title"])
        return box_top + 48

    def text_block_centered(box):
        x1, y1, x2, y2 = box
        y = add_tag_centered(y1 + 28, x1, x2, subtitle) if subtitle else y1 + 34
        title_lines = wrap_text(draw, title, title_f, (x2 - x1) - 100)
        cx = (x1 + x2) / 2
        ascent, descent = title_f.getmetrics()
        title_h = ascent + descent + 12
        for line in title_lines:
            centered_text(draw, line, y, title_f, theme["title"], cx)
            y += title_h
        y += 14
        if bullets:
            y = draw_centered_bullets(draw, bullets, (x1 + 38, y, x2 - 38, y2 - 48), bullet_f, content_fill, theme["accent2"])
            y += 10
        elif body:
            draw_centered_paragraph(draw, body, (x1 + 44, y, x2 - 44, y2 - 44), body_f, content_fill)
        else:
            centered_text(draw, "Add content", y, body_f, content_fill, cx)

    if layout in ("image-right-text-left", "image-left-text-right"):
        gap = 24
        if portrait:
            text_box = (content_left, content_top, content_right, content_top + int((content_bottom - content_top) * 0.44))
            media_box = (content_left, text_box[3] + gap, content_right, content_bottom)
        else:
            split = int((content_right - content_left - gap) * 0.5)
            left_box = (content_left, content_top, content_left + split, content_bottom)
            right_box = (content_left + split + gap, content_top, content_right, content_bottom)
            text_box, media_box = (left_box, right_box) if layout == "image-right-text-left" else (right_box, left_box)
        card(text_box)
        card(media_box)
        text_block_centered(text_box)
        if image_path and os.path.exists(image_path):
            fit_and_paste(base, image_path, (media_box[0] + 18, media_box[1] + 18, media_box[2] - 18, media_box[3] - 18), contain=True)
        else:
            rounded_rectangle(draw, (media_box[0] + 18, media_box[1] + 18, media_box[2] - 18, media_box[3] - 18), 22, (255,255,255,12), outline=theme["border"], width=2)
            msg = "Drop screen image here"
            centered_text(draw, msg, media_box[1] + ((media_box[3]-media_box[1]) / 2) - 12, body_f, theme["title"], (media_box[0] + media_box[2]) / 2)
    elif layout == "title-bullets":
        box = (content_left, content_top, content_right, content_bottom)
        card(box)
        text_block_centered(box)
    elif layout == "full-image-overlay":
        box = (content_left, content_top, content_right, content_bottom)
        if image_path and os.path.exists(image_path):
            fit_and_paste(base, image_path, box, radius=28, contain=False)
        else:
            card(box)
        ow = int((content_right - content_left) * (0.62 if not portrait else 0.92))
        oh = int((content_bottom - content_top) * (0.48 if not portrait else 0.38))
        overlay = ((width - ow)//2, content_bottom - oh - 26, (width + ow)//2, content_bottom - 26)
        card(overlay)
        text_block_centered(overlay)
    elif layout == "two-column-text":
        box = (content_left, content_top, content_right, content_bottom)
        card(box)
        y = add_tag_centered(content_top + 26, content_left, content_right, subtitle) if subtitle else content_top + 30
        title_lines = wrap_text(draw, title, title_f, (content_right - content_left) - 120)
        cx = (content_left + content_right) / 2
        ascent, descent = title_f.getmetrics()
        line_h = ascent + descent + 12
        for line in title_lines:
            centered_text(draw, line, y, title_f, theme["title"], cx)
            y += line_h
        y += 24
        inner_gap = 28
        mid = content_left + (content_right - content_left) // 2
        left_col = (content_left + 34, y, mid - inner_gap, content_bottom - 34)
        right_col = (mid + inner_gap, y, content_right - 34, content_bottom - 34)
        if bullets:
            draw_centered_bullets(draw, bullets, left_col, bullet_f, content_fill, theme["accent2"])
        else:
            centered_text(draw, "Add bullet points", left_col[1], body_f, content_fill, (left_col[0] + left_col[2]) / 2)
        if body:
            draw_centered_paragraph(draw, body, right_col, body_f, content_fill)
        else:
            centered_text(draw, "Add body text", right_col[1], body_f, content_fill, (right_col[0] + right_col[2]) / 2)
    elif layout == "section-divider":
        y = (content_top + content_bottom) // 2
        draw.line((content_left, y, content_right, y), fill=theme["accent"], width=3)
        box_w = int((content_right - content_left) * (0.72 if not portrait else 0.86))
        box_h = int((content_bottom - content_top) * (0.36 if not portrait else 0.30))
        box = ((width - box_w)//2, (height - box_h)//2, (width + box_w)//2, (height + box_h)//2)
        card(box, radius=30)
        text_block_centered(box)

    if presenter_path and os.path.exists(presenter_path):
        size = 100 if not portrait else 116
        draw_presenter(base, presenter_path, (outer_pad - (26 if portrait else 30), height - outer_pad - size + (18 if portrait else 26), outer_pad - (26 if portrait else 30) + size, height - outer_pad + (18 if portrait else 26)))

    footer_tag = f"{layout}"
    fw = int(text_width(draw, footer_tag, meta_f)) + 30
    fx = width - outer_pad - fw
    fy = height - outer_pad
    rounded_rectangle(draw, (fx, fy - 36, fx + fw, fy), 18, theme["card"], outline=theme["border"], width=1)
    draw.text((fx + 14, fy - 26), footer_tag, font=meta_f, fill=theme["title"])

    base.convert("RGB").save(out, quality=95)

if __name__ == "__main__":
    main()
