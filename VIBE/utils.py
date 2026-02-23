import json
import random
from datetime import date

from django.http import JsonResponse


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
