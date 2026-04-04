import qrcode
import os

# ==========================================
# 🎨 MASSIVE SHAPE CUSTOMIZATION ZONE
# ==========================================

QR_DATA = "happnix://ticket/demo/12345"
BG_COLOR = "#0f172a" # Dark background

# 1. Choose your corner style! 
# Change this to "CIRCLE" or "ROUNDED_BOX"
CORNER_SHAPE = "ROUNDED_BOX" 

# 2. Corner Colors
EYE_OUTER_COLOR = "#e879f9" # Fuchsia
EYE_INNER_COLOR = "#fbbf24" # Amber gold

# 3. Data Body (The 0s and 1s)
DATA_DARK_CHAR = "▢"
DATA_LIGHT_CHAR = "▢"
DATA_COLOR = "#38bdf8" # Sky blue

OUTPUT_FILENAME = "massive_shape_qr.svg"

# ==========================================

def generate_massive_shape_svg():
    print(f"Generating Massive Shape QR for: {QR_DATA}...")
    
    # Generate mathematical grid
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=10, border=2)
    qr.add_data(QR_DATA)
    qr.make(fit=True)
    matrix = qr.modules
    size = len(matrix)
    
    box_size = 10
    width = height = size * box_size
    
    # Setup canvas
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="400px" height="400px">',
        '<style>',
        '  .qr-txt { font-family: monospace; font-size: 11px; text-anchor: middle; dominant-baseline: central; font-weight: 900; }',
        f'  .qr-data-dark {{ fill: {DATA_COLOR}; }}',
        f'  .qr-data-light {{ fill: {DATA_COLOR}; opacity: 0.3; }}',
        f'  .qr-eye-outer {{ fill: {EYE_OUTER_COLOR}; }}',
        f'  .qr-eye-inner {{ fill: {EYE_INNER_COLOR}; }}',
        '</style>',
        f'<rect width="{width}" height="{height}" fill="{BG_COLOR}" rx="10"/>'
    ]
    
    # Helper to completely skip the 7x7 corner blocks
    def in_finder(r, c):
        if r < 7 and c < 7: return True                    # Top-Left
        if r < 7 and c >= size - 7: return True            # Top-Right
        if r >= size - 7 and c < 7: return True            # Bottom-Left
        return False

    # DRAW PHASE 1: The 0s and 1s
    for r in range(size):
        for c in range(size):
            # If we are in a corner, draw NOTHING. Leave it blank.
            if in_finder(r, c):
                continue 
            
            is_dark = matrix[r][c]
            x = (c * box_size) + (box_size / 2)
            y = (r * box_size) + (box_size / 2)
            
            if is_dark:
                svg_parts.append(f'<text x="{x}" y="{y}" class="qr-txt qr-data-dark">{DATA_DARK_CHAR}</text>')
            else:
                svg_parts.append(f'<text x="{x}" y="{y}" class="qr-txt qr-data-light">{DATA_LIGHT_CHAR}</text>')
                
    # DRAW PHASE 2: The Massive Corner Shapes
    # Find the exact center coordinates of the 3 corners
    centers = [
        (3.5, 3.5),                    # Top-Left
        (size - 3.5, 3.5),             # Top-Right
        (3.5, size - 3.5)              # Bottom-Left
    ]
    
    for cx_mod, cy_mod in centers:
        cx = cx_mod * box_size
        cy = cy_mod * box_size
        
        if CORNER_SHAPE == "CIRCLE":
            # Draw Giant Circles
            svg_parts.append(f'<circle cx="{cx}" cy="{cy}" r="35" class="qr-eye-outer"/>')
            svg_parts.append(f'<circle cx="{cx}" cy="{cy}" r="25" fill="{BG_COLOR}"/>') # Cutout ring
            svg_parts.append(f'<circle cx="{cx}" cy="{cy}" r="15" class="qr-eye-inner"/>')
            
        elif CORNER_SHAPE == "ROUNDED_BOX":
            # Draw Giant Apple-Style Rounded Rectangles
            tl_x = cx - 35
            tl_y = cy - 35
            svg_parts.append(f'<rect x="{tl_x}" y="{tl_y}" width="70" height="70" rx="16" class="qr-eye-outer"/>')
            svg_parts.append(f'<rect x="{tl_x + 10}" y="{tl_y + 10}" width="50" height="50" rx="10" fill="{BG_COLOR}"/>') # Cutout ring
            svg_parts.append(f'<rect x="{tl_x + 20}" y="{tl_y + 20}" width="30" height="30" rx="6" class="qr-eye-inner"/>')
            
    svg_parts.append('</svg>')
    
    # Save to file
    with open(OUTPUT_FILENAME, "w", encoding="utf-8") as f:
        f.write("\n".join(svg_parts))
        
    print(f"✅ Success! Saved to {os.path.abspath(OUTPUT_FILENAME)}")
    print("Double-click the SVG file to view it in your browser.")

if __name__ == "__main__":
    generate_massive_shape_svg()