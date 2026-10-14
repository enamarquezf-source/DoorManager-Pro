"""Render deterministic diagram scenes to PNG; no network or user records."""
from pathlib import Path
import json, math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'architecture-map'
FONT = Path('C:/Windows/Fonts/segoeui.ttf')
BOLD = Path('C:/Windows/Fonts/segoeuib.ttf')
fonts = {}
def font(size, weight=400):
    key = (round(size), weight >= 600)
    if key not in fonts:
        fonts[key] = ImageFont.truetype(str(BOLD if key[1] else FONT), key[0])
    return fonts[key]

for src, name in [('schema-scene.json', 'DMP-tablas-relaciones'),
                  ('DMP-recorrido-del-dato-scene.json', 'DMP-recorrido-del-dato'),
                  ('DMP-al-abrir-un-parte-scene.json', 'DMP-al-abrir-un-parte')]:
    data = json.loads((OUT / src).read_text(encoding='utf-8'))
    img = Image.new('RGB', (data['width'], data['height']), data['background'])
    draw = ImageDraw.Draw(img)
    for item in data['items']:
        kind = item['type']
        if kind == 'rect':
            x, y, w, h = [item[k] for k in ('x', 'y', 'w', 'h')]
            draw.rounded_rectangle((x, y, x+w, y+h), radius=item.get('radius', 12),
                                   fill=item['fill'], outline=item.get('stroke') or None, width=2)
        elif kind == 'text':
            draw.text((item['x'], item['y']), item['text'], font=font(item['size'], item.get('weight', 400)), fill=item['fill'], anchor='ls')
        elif kind == 'curve':
            pts=[]
            for i in range(61):
                t=i/60; u=1-t
                pts.append((u**3*item['x1']+3*u*u*t*item['c1x']+3*u*t*t*item['c2x']+t**3*item['x2'],
                            u**3*item['y1']+3*u*u*t*item['c1y']+3*u*t*t*item['c2y']+t**3*item['y2']))
            # Mix edge colour with the pale background to preserve label legibility.
            color = tuple(int(item['stroke'][j:j+2], 16) for j in (1, 3, 5))
            color = tuple(round(v*.42+255*.58) for v in color)
            if item.get('dashed'):
                for i in range(0, len(pts)-1, 3): draw.line(pts[i:i+2], fill=color, width=2)
            else:
                draw.line(pts, fill=color, width=2)
                x,y=pts[-1];px,py=pts[-2];a=math.atan2(y-py,x-px)
                draw.polygon([(x,y),(x-9*math.cos(a-.45),y-9*math.sin(a-.45)),(x-9*math.cos(a+.45),y-9*math.sin(a+.45))],fill=color)
        elif kind == 'line':
            x1,y1,x2,y2=[item[k] for k in ('x1','y1','x2','y2')]
            draw.line((x1,y1,x2,y2),fill=item['stroke'],width=item.get('strokeWidth',3))
            a=math.atan2(y2-y1,x2-x1)
            draw.polygon([(x2,y2),(x2-17*math.cos(a-.4),y2-17*math.sin(a-.4)),(x2-17*math.cos(a+.4),y2-17*math.sin(a+.4))],fill=item['stroke'])
    target=OUT/(name+'.png');img.save(target,optimize=True)
    preview=img.copy();preview.thumbnail((1600,1300));preview.save(OUT/(name+'-preview.png'))
    print(f'{name}: {img.width} x {img.height}, {target.stat().st_size:,} bytes')
