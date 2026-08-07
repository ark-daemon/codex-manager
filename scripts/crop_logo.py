import os
from PIL import Image

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src_path = os.path.join(root, "New Logo.png")

if not os.path.exists(src_path):
    print(f"Source image not found at {src_path}")
    exit(1)

img = Image.open(src_path).convert("RGBA")

# Trim transparent background to exact content bounds
bbox = img.getbbox()
if bbox:
    cropped = img.crop(bbox)
else:
    cropped = img

# 1. assets/icon.png (512x512 - 100% edge-to-edge content fill)
assets_dir = os.path.join(root, "assets")
os.makedirs(assets_dir, exist_ok=True)
img_512 = cropped.resize((512, 512), Image.Resampling.LANCZOS)
img_512.save(os.path.join(assets_dir, "icon.png"), "PNG")

# 2. assets/tray-icon.png (32x32 - 100% edge-to-edge content fill)
img_32 = cropped.resize((32, 32), Image.Resampling.LANCZOS)
img_32.save(os.path.join(assets_dir, "tray-icon.png"), "PNG")

# 3. build/icon.ico (16, 32, 48, 64, 128, 256)
build_dir = os.path.join(root, "build")
os.makedirs(build_dir, exist_ok=True)
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
ico_images = [cropped.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
ico_images[0].save(
    os.path.join(build_dir, "icon.ico"),
    format="ICO",
    sizes=ico_sizes,
    append_images=ico_images[1:]
)

# 4. public/logo.png & hamburger-*.png
public_dir = os.path.join(root, "public")
os.makedirs(public_dir, exist_ok=True)
img_512.save(os.path.join(public_dir, "logo.png"), "PNG")

for s in [16, 32, 48, 64, 96, 128, 256, 512]:
    r = cropped.resize((s, s), Image.Resampling.LANCZOS)
    r.save(os.path.join(public_dir, f"hamburger-{s}.png"), "PNG")

print("Generated 100% edge-to-edge max-size icons!")
