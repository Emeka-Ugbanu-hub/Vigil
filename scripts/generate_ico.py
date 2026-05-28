#!/usr/bin/env python3
"""Generate Windows ICO file from PNGs."""

from PIL import Image
import os

base_dir = os.path.dirname(os.path.abspath(__file__))
icons_dir = os.path.join(base_dir, '..', 'src-tauri', 'icons')

# Load all sizes
images = []
for size in [16, 32, 48, 128, 256]:
    if size <= 32:
        path = os.path.join(icons_dir, '32x32.png')
    elif size <= 128:
        path = os.path.join(icons_dir, '128x128.png')
    else:
        path = os.path.join(icons_dir, 'icon.png')
    
    img = Image.open(path)
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    images.append(img)

# Save as ICO
ico_path = os.path.join(icons_dir, 'icon.ico')
images[0].save(ico_path, format='ICO', sizes=[(16,16), (32,32), (48,48), (128,128), (256,256)], append_images=images[1:])
print(f"Generated {ico_path}")
