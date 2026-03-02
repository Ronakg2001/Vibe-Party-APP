from decimal import Decimal, InvalidOperation
from math import asin, cos, radians, sin, sqrt

from django.contrib.auth import get_user_model
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.template import loader
from django.http import HttpResponse, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST

from . import mongo_store
from .models import Event
from .utils import _error, _json_body


@never_cache
def index_page(request):
    if request.user.is_authenticated:
        return redirect("/home/")

    template = loader.get_template('index.html')
    response = HttpResponse(template.render({}, request))
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response

@never_cache
def Signup_signin_page(request):
    if request.user.is_authenticated:
        return redirect("/home/")

    template = loader.get_template('signup_signin.html')
    context = {
        "server_note": "Backend connected. You can now send and receive auth data.",
    }
    response = HttpResponse(template.render(context, request))
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response

def forgot_password(request):
    template = loader.get_template('forgot_password.html')
    return HttpResponse(template.render())

@never_cache
def Home_page(request):
    if not request.user.is_authenticated:
        return redirect("/signin/")

    template = loader.get_template('home_page.html')
    profile = getattr(request.user, "profile", None)
    mongo_profile = mongo_store.profile_for_user(request.user.id)
    response = HttpResponse(
        template.render(
            {
                "current_username": request.user.username,
                "current_avatar_url": (
                    (mongo_profile or {}).get("profile_picture_url")
                    or (getattr(profile, "profile_picture_url", "") if profile else "")
                ),
            },
            request,
        )
    )
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def signup_details_page(request):
    mobile = request.session.get("pending_signup_mobile")
    if not mobile:
        return redirect("/signin/")

    template = loader.get_template("signup_details.html")
    return HttpResponse(template.render({"mobile": mobile}, request))


def signup_profile_page(request):
    if not request.user.is_authenticated:
        return redirect("/signin/")
    if not request.session.get("pending_profile_setup"):
        return redirect("/home/")

    template = loader.get_template("signup_profile_optional.html")
    return HttpResponse(template.render({}, request))


def party_loader_demo_page(request):
    template = loader.get_template("party_loader_demo.html")
    return HttpResponse(template.render({}, request))

@never_cache
def custom_location_page(request):
    if not request.user.is_authenticated:
        return redirect("/signin/")
    template = loader.get_template("custom_location.html")
    return HttpResponse(template.render({}, request))


@never_cache
@require_http_methods(["GET", "POST"])
def logout_view(request):
    logout(request)
    response = redirect("/signin/")
    response["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response["Pragma"] = "no-cache"
    response["Expires"] = "0"
    return response


def _haversine_km(lat1, lon1, lat2, lon2):
    lat1_rad, lon1_rad, lat2_rad, lon2_rad = map(radians, [lat1, lon1, lat2, lon2])
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    hav = sin(dlat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(dlon / 2) ** 2
    return 6371.0 * 2 * asin(sqrt(hav))


def _serialize_event(event, distance_km=None):
    lat = float(event.latitude)
    lon = float(event.longitude)
    data = {
        "id": event.id,
        "hostUsername": event.host.username,
        "title": event.title,
        "description": event.description,
        "startLabel": event.start_label,
        "locationName": event.location_name,
        "latitude": lat,
        "longitude": lon,
        "price": float(event.price),
        "imageUrl": event.image_url,
        "mapUrl": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
    }
    if distance_km is not None:
        data["distanceKm"] = round(distance_km, 2)
    return data


@require_POST
def create_event_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()
    start_label = str(payload.get("startLabel", "")).strip()
    location_name = str(payload.get("locationName", "")).strip()
    image_url = str(payload.get("imageUrl", "")).strip()

    if not title:
        return _error("Event title is required.")
    if not location_name:
        return _error("Event location is required.")

    try:
        latitude = float(payload.get("latitude"))
        longitude = float(payload.get("longitude"))
    except (TypeError, ValueError):
        return _error("Valid latitude and longitude are required.")

    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return _error("Latitude/longitude values are out of valid range.")

    try:
        price = Decimal(str(payload.get("price", 0) or 0))
    except (InvalidOperation, TypeError, ValueError):
        return _error("Price must be a valid number.")

    if price < 0:
        return _error("Price cannot be negative.")

    event = Event.objects.create(
        host=request.user,
        title=title,
        description=description,
        start_label=start_label,
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        price=price,
        image_url=image_url,
    )
    mongo_store.sync_event(event.id)

    return JsonResponse(
        {
            "message": "Event created successfully.",
            "event": _serialize_event(event),
        }
    )


@require_GET
def nearby_events_api(request):
    try:
        latitude = float(request.GET.get("latitude", ""))
        longitude = float(request.GET.get("longitude", ""))
    except (TypeError, ValueError):
        return _error("latitude and longitude query params are required.")

    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return _error("Latitude/longitude values are out of valid range.")

    try:
        radius_km = float(request.GET.get("radiusKm", "10"))
    except ValueError:
        return _error("radiusKm must be a number.")
    if radius_km <= 0 or radius_km > 500:
        return _error("radiusKm must be between 0 and 500.")

    north = request.GET.get("north")
    south = request.GET.get("south")
    east = request.GET.get("east")
    west = request.GET.get("west")
    use_bbox = all(v is not None for v in [north, south, east, west])

    queryset = Event.objects.filter(is_active=True).select_related("host")
    if use_bbox:
        try:
            north_f = float(north)
            south_f = float(south)
            east_f = float(east)
            west_f = float(west)
        except (TypeError, ValueError):
            return _error("north/south/east/west must be valid numbers.")
        if south_f > north_f:
            return _error("south cannot be greater than north.")
        queryset = queryset.filter(
            latitude__gte=south_f,
            latitude__lte=north_f,
            longitude__gte=west_f,
            longitude__lte=east_f,
        )

    nearby = []
    for event in queryset:
        distance_km = _haversine_km(
            latitude,
            longitude,
            float(event.latitude),
            float(event.longitude),
        )
        if distance_km <= radius_km:
            nearby.append((distance_km, event))

    nearby.sort(key=lambda item: item[0])
    serialized = [_serialize_event(event, distance) for distance, event in nearby]

    return JsonResponse(
        {
            "radiusKm": radius_km,
            "count": len(serialized),
            "events": serialized,
        }
    )


@require_GET
def search_users_api(request):
    query = str(request.GET.get("q", "")).strip()
    if not query:
        return _error("q query param is required.")

    try:
        limit = int(request.GET.get("limit", "20"))
    except ValueError:
        return _error("limit must be an integer.")

    if limit <= 0 or limit > 100:
        return _error("limit must be between 1 and 100.")

    docs = mongo_store.search_profiles(query=query, limit=limit)
    if docs:
        return JsonResponse({"source": "mongo", "count": len(docs), "users": docs})

    # Fallback keeps endpoint usable before Mongo backfill/config is complete.
    User = get_user_model()
    fallback_qs = User.objects.filter(username__icontains=query).values(
        "id", "username", "first_name"
    ).order_by("username")[:limit]
    users = [
        {
            "sql_user_id": row["id"],
            "username": row["username"],
            "full_name": row["first_name"] or "",
            "profile_picture_url": "",
        }
        for row in fallback_qs
    ]
    return JsonResponse({"source": "sql-fallback", "count": len(users), "users": users})


@require_GET
def current_profile_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    mongo_profile = mongo_store.profile_for_user(request.user.id)
    if mongo_profile:
        return JsonResponse({"source": "mongo", "profile": mongo_profile})

    profile = getattr(request.user, "profile", None)
    payload = {
        "sql_user_id": request.user.id,
        "username": request.user.username,
        "email": (request.user.email or "").lower(),
        "full_name": (request.user.first_name or "").strip(),
        "mobile": getattr(profile, "mobile", "") if profile else "",
        "sex": getattr(profile, "sex", "") if profile else "",
        "date_of_birth": (
            profile.date_of_birth.isoformat()
            if profile and getattr(profile, "date_of_birth", None)
            else None
        ),
        "bio": getattr(profile, "bio", "") if profile else "",
        "profile_picture_url": getattr(profile, "profile_picture_url", "") if profile else "",
        "gov_id_verified": bool(getattr(profile, "gov_id_verified", False)),
    }
    return JsonResponse({"source": "sql-fallback", "profile": payload})
