from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
folder=Path(__file__).parent
im=Image.new('RGBA',(256,256),(0,0,0,0))
d=ImageDraw.Draw(im)
d.rounded_rectangle((8,8,248,248),radius=52,fill='#3b63df')
font=ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf',184)
box=d.textbbox((0,0),'P',font=font)
d.text(((256-(box[2]-box[0]))/2-box[0],(256-(box[3]-box[1]))/2-box[1]-2),'P',font=font,fill='white')
im.save(folder/'app.ico',sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
