#!/usr/bin/env python3
"""Generate Vigil app icons from the blocky V logo SVG."""

from PIL import Image, ImageDraw
import os

# Logo geometry (from SVG, scaled)
# Original viewBox 0 0 512 512
# Circle cx=256 cy=256 r=240 fill=#000000
# Rects are 32x32 at various positions

def render_logo(size):
    """Render the Vigil logo at given pixel size."""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    scale = size / 512.0
    
    # Black circle background
    cx = int(256 * scale)
    cy = int(256 * scale)
    r = int(240 * scale)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(0, 0, 0, 255))
    
    # White blocks
    rects = [
        (152, 160, 32, 32),   # left arm top
        (176, 208, 32, 32),   # left arm mid
        (200, 256, 32, 32),   # left arm lower
        (224, 304, 32, 32),   # left arm bottom
        (328, 160, 32, 32),   # right arm top
        (304, 208, 32, 32),   # right arm mid
        (280, 256, 32, 32),   # right arm lower
        (256, 304, 32, 32),   # right arm bottom
        (240, 348, 32, 32),   # bottom point
    ]
    
    for x, y, w, h in rects:
        x0 = int(x * scale)
        y0 = int(y * scale)
        x1 = int((x + w) * scale)
        y1 = int((y + h) * scale)
        draw.rectangle([x0, y0, x1, y1], fill=(255, 255, 255, 255))
    
    return img

def main():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    icons_dir = os.path.join(base_dir, '..', 'src-tauri', 'icons')
    
    sizes = {
        '16x16.png': 16,
        '32x32.png': 32,
        '128x128.png': 128,
        '128x128@2x.png': 256,
        'icon.png': 512,
    }
    
    for filename, size in sizes.items():
        img = render_logo(size)
        path = os.path.join(icons_dir, filename)
        img.save(path, 'PNG')
        print(f"Generated {path} ({size}x{size})")

if __name__ == '__main__':
    main()
