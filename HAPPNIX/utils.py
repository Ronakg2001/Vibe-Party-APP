import segno
import json
import random
from datetime import date

from django.http import JsonResponse
from django.utils.safestring import mark_safe

def _json_body(request):
    try:
        return json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return {}


def _error(message, status=400):
    return JsonResponse({"message": message}, status=status)


def _generate_otp():
    return f"{random.randint(100000, 999999)}"


def _calculate_age(dob):
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))

def generate_hybrid_happnix_qr(data_url):
    # 1. Generate the raw math (High Error Correction)
    qr = segno.make(data_url, error='h')
    matrix = qr.matrix # This gives us the 2D grid of True/False (1s and 0s)
    
    box_size = 10 # Size of each "cell"
    width = len(matrix[0]) * box_size
    height = len(matrix) * box_size
    
    # 2. Start building the SVG text
    svg_parts = [
        f'<svg viewBox="0 0 {width} {height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">',
        
        # Add the HappniX Custom Gradient Definition
        '''<defs>
            <linearGradient id="happnixNeon" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#22d3ee;stop-opacity:1" /> <stop offset="100%" style="stop-color:#d946ef;stop-opacity:1" /> </linearGradient>
        </defs>'''
    ]

    # 3. Loop through the raw matrix and draw custom shapes!
    for r, row in enumerate(matrix):
        for c, is_dark in enumerate(row):
            if is_dark:
                x = c * box_size
                y = r * box_size
                
                # Check if we are inside the 3 corner "Finder Patterns" (they are 7x7 blocks)
                is_top_left = (r < 7 and c < 7)
                is_top_right = (r < 7 and c > len(row) - 8)
                is_bottom_left = (r > len(matrix) - 8 and c < 7)
                
                if is_top_left or is_top_right or is_bottom_left:
                    # Draw sharp blocks for the corners so the scanner doesn't fail
                    svg_parts.append(
                        f'<rect x="{x}" y="{y}" width="{box_size}" height="{box_size}" fill="url(#happnixNeon)" rx="2" />'
                    )
                else:
                    # Draw CUSTOM SHAPES for the inner data!
                    # Let's draw modern, perfectly round circles with a slight gap between them
                    cx = x + (box_size / 2)
                    cy = y + (box_size / 2)
                    radius = box_size * 0.40 # 0.40 leaves a 20% gap between dots
                    
                    svg_parts.append(
                        f'<circle cx="{cx}" cy="{cy}" r="{radius}" fill="url(#happnixNeon)" />'
                    )
                    
    svg_parts.append('</svg>')
    
    # mark_safe tells Django this is safe HTML to render, not raw text
    return mark_safe("".join(svg_parts))