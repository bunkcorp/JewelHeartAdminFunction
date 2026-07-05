#!/usr/bin/env python3
"""Flatten apple-touch-icon.png to opaque RGB (iOS home screen requirement)."""
import sys
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else 'apple-touch-icon.png'
im = Image.open(path).convert('RGBA')
bg = Image.new('RGBA', im.size, (91, 182, 232, 255))
Image.alpha_composite(bg, im).convert('RGB').save(path)
out = Image.open(path)
print(f'{path}: {out.size[0]}x{out.size[1]} {out.mode}')
