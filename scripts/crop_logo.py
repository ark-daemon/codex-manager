import os
from PIL import Image, ImageDraw

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_path = os.path.join(root, "New Logo.png")

if not os.path.exists(src_path):
    print(f"Source image not found at {src_path}")
    exit(1)

img = Image.open(src_path).convert("RGBA")

# The source artwork is delivered on an opaque black canvas. Remove that
# canvas first so native chrome and the renderer do not display a dark square.
pixels = img.load()
for y in range(img.height):
    for x in range(img.width):
        red, green, blue, alpha = pixels[x, y]
        if alpha == 0 or max(red, green, blue) < 24:
            pixels[x, y] = (0, 0, 0, 0)

# Trim the transparent canvas to the actual mark bounds.
bbox = img.getchannel("A").getbbox()
if bbox:
    cropped = img.crop(bbox)
else:
    cropped = img

def fit_square(source: Image.Image, size: int, fill_ratio: float = 0.92) -> Image.Image:
    """Fit the mark inside a square without distorting its aspect ratio."""
    max_dimension = round(size * fill_ratio)
    scale = min(max_dimension / source.width, max_dimension / source.height)
    fitted = source.resize(
        (max(1, round(source.width * scale)), max(1, round(source.height * scale))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return canvas

def make_notification_icon(source: Image.Image, size: int = 96) -> Image.Image:
    """Create a high-contrast badge for Windows' dark notification surface."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    inset = round(size * 0.06)
    draw.rounded_rectangle(
        (inset, inset, size - inset - 1, size - inset - 1),
        radius=round(size * 0.22),
        fill=(249, 115, 22, 255),
    )

    mark = fit_square(source, round(size * 0.72))
    dark_mark = Image.new("RGBA", mark.size, (10, 10, 15, 255))
    dark_mark.putalpha(mark.getchannel("A"))
    canvas.alpha_composite(dark_mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas

# 1. assets/icon.png (512x512, aspect-ratio-preserving)
assets_dir = os.path.join(root, "assets")
os.makedirs(assets_dir, exist_ok=True)
img_512 = fit_square(cropped, 512)
img_512.save(os.path.join(assets_dir, "icon.png"), "PNG")

# 2. assets/tray-icon.png (32x32, aspect-ratio-preserving)
fit_square(cropped, 32, fill_ratio=0.98).save(os.path.join(assets_dir, "tray-icon.png"), "PNG")

# 3. build/icon.ico (16, 32, 48, 64, 128, 256; aspect-ratio-preserving)
build_dir = os.path.join(root, "build")
os.makedirs(build_dir, exist_ok=True)
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_images = [fit_square(cropped, s[0], fill_ratio=0.98) for s in ico_sizes]
ico_images[0].save(
    os.path.join(build_dir, "icon.ico"),
    format="ICO",
    sizes=ico_sizes,
    append_images=ico_images[1:]
)

# 4. assets/notification-icon.png (96x96 high-contrast Windows toast badge)
make_notification_icon(cropped).save(os.path.join(assets_dir, "notification-icon.png"), "PNG")

# 5. public/logo.png & hamburger-*.png
public_dir = os.path.join(root, "public")
os.makedirs(public_dir, exist_ok=True)
img_512.save(os.path.join(public_dir, "logo.png"), "PNG")

for s in [16, 32, 48, 64, 96, 128, 256, 512]:
    r = fit_square(cropped, s)
    r.save(os.path.join(public_dir, f"hamburger-{s}.png"), "PNG")

print("Generated renderer and native chrome icon assets.")
