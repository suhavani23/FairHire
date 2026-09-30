import zlib
import struct
import os

def create_png(width, height, color_bg=(255, 201, 60), color_border=(0, 0, 0), color_fg=(0, 0, 0)):
    # Simple neo-brutalist square icon with border and 'F' letter
    raw_data = bytearray()
    
    # Simple bitmap rendering of an 'F'
    for y in range(height):
        raw_data.append(0)  # filter type 0 (None)
        for x in range(width):
            # Border check (2px on small, 4px on large)
            bw = max(1, width // 16)
            is_border = (x < bw or x >= width - bw or y < bw or y >= height - bw)
            
            # Simple 'F' pattern in the center
            nx = x / width
            ny = y / height
            
            # F vertical stem: nx between 0.30 and 0.45, ny between 0.25 and 0.75
            is_f_stem = (0.28 <= nx <= 0.44 and 0.22 <= ny <= 0.78)
            # F top bar: nx between 0.28 and 0.72, ny between 0.22 and 0.36
            is_f_top = (0.28 <= nx <= 0.72 and 0.22 <= ny <= 0.36)
            # F middle bar: nx between 0.28 and 0.62, ny between 0.46 and 0.58
            is_f_mid = (0.28 <= nx <= 0.62 and 0.46 <= ny <= 0.58)
            
            is_f = is_f_stem or is_f_top or is_f_mid
            
            if is_border:
                raw_data.extend(color_border)
            elif is_f:
                raw_data.extend(color_fg)
            else:
                raw_data.extend(color_bg)
                
    def chunk(tag, data):
        return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff)

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0))
    idat = chunk(b"IDAT", zlib.compress(raw_data, 9))
    iend = chunk(b"IEND", b"")
    return header + ihdr + idat + iend

out_dir = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(out_dir, exist_ok=True)

for size in [16, 48, 128]:
    png_bytes = create_png(size, size)
    path = os.path.join(out_dir, f"icon{size}.png")
    with open(path, "wb") as f:
        f.write(png_bytes)
    print(f"Generated {path} ({size}x{size})")
