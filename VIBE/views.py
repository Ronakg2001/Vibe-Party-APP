from decimal import Decimal, InvalidOperation
from math import asin, cos, radians, sin, sqrt
import json
import os
from pathlib import Path
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.template import loader
from django.http import HttpResponse, JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.core.files.storage import default_storage
from django.utils.text import slugify
from django.conf import settings
from urllib.parse import urlparse

from . import mongo_store
from .models import Event, EventMedia
from .utils import _error, _json_body


def _load_manifest_data():
    default_manifest = {
        "event_category": ["Local event"],
    }
    manifest_path = Path(__file__).resolve().parent / "manifest.json"
    try:
        with manifest_path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
        categories = payload.get("event_category")
        if isinstance(categories, list):
            clean_categories = [str(item).strip() for item in categories if str(item).strip()]
            if clean_categories:
                payload["event_category"] = clean_categories
            else:
                payload["event_category"] = default_manifest["event_category"]
        else:
            payload["event_category"] = default_manifest["event_category"]
        return payload
    except (OSError, ValueError, TypeError):
        return default_manifest


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
    manifest_data = _load_manifest_data()
    response = HttpResponse(
        template.render(
            {
                "current_username": request.user.username,
                "current_avatar_url": (
                    (mongo_profile or {}).get("profile_picture_url")
                    or (getattr(profile, "profile_picture_url", "") if profile else "")
                ),
                "manifest_data_json": json.dumps(manifest_data),
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
    response = redirect("/")
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
    media_items = list(event.media_items.all()) if hasattr(event, "media_items") else []
    media_urls = [item.file_url for item in media_items]
    image_media = [item.file_url for item in media_items if item.media_type == EventMedia.MediaType.IMAGE]
    cover_url = image_media[0] if image_media else (media_urls[0] if media_urls else event.image_url)
    data = {
        "id": event.id,
        "eventId": str(event.event_uid),
        "userId": event.host_id,
        "hostUsername": event.host.username,
        "title": event.title,
        "description": event.description,
        "startLabel": event.start_label,
        "endLabel": event.end_label,
        "eventCategory": event.event_category,
        "locationName": event.location_name,
        "latitude": lat,
        "longitude": lon,
        "price": float(event.price),
        "currency": event.currency,
        "maxAttendees": event.max_attendees,
        "ticketsSold": event.tickets_sold,
        "status": event.status,
        "imageUrl": cover_url,
        "mediaUrls": media_urls,
        "isActive": bool(event.is_active),
        "createdAt": event.created_at.isoformat() if event.created_at else None,
        "updatedAt": event.updated_at.isoformat() if event.updated_at else None,
        "mapUrl": f"https://www.google.com/maps/search/?api=1&query={lat},{lon}",
    }
    if distance_km is not None:
        data["distanceKm"] = round(distance_km, 2)
    return data


@require_POST
def create_event_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    is_multipart = (request.content_type or "").startswith("multipart/form-data")
    if is_multipart:
        payload = request.POST
    else:
        payload = _json_body(request)

    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()
    start_label = str(payload.get("startLabel", "")).strip()
    end_label = str(payload.get("endLabel", "")).strip()
    location_name = str(payload.get("locationName", "")).strip()
    image_url = str(payload.get("imageUrl", "")).strip()
    event_category = str(payload.get("eventCategory", "local event")).strip().lower() or "local event"
    currency = str(payload.get("currency", "INR")).strip().upper() or "INR"

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

    try:
        max_attendees = int(payload.get("maxAttendees", 0) or 0)
    except (TypeError, ValueError):
        return _error("maxAttendees must be a valid integer.")
    if max_attendees < 0:
        return _error("maxAttendees cannot be negative.")

    if len(currency) != 3:
        return _error("currency must be a 3-letter code.")

    cover_file = None
    uploaded_media = []
    if is_multipart:
        cover_file = request.FILES.get("vibeCover")
        highlight_files = request.FILES.getlist("vibeHighlights")
        event_media = request.FILES.getlist("eventMedia")
        if cover_file:
            uploaded_media.append(cover_file)
        uploaded_media.extend(event_media)
        uploaded_media.extend(highlight_files)

    if len(uploaded_media) > 10:
        return _error("Maximum 10 images/videos are allowed.")

    allowed_prefixes = ("image/", "video/")
    for media in uploaded_media:
        content_type = (getattr(media, "content_type", "") or "").lower()
        if media is not None and media is cover_file:
            if not content_type.startswith("image/"):
                return _error("Cover image must be an image file.")
            continue
        if not content_type.startswith(allowed_prefixes):
            return _error("Only image and video files are allowed.")

    event = Event.objects.create(
        host=request.user,
        title=title,
        description=description,
        start_label=start_label,
        end_label=end_label,
        location_name=location_name,
        latitude=latitude,
        longitude=longitude,
        price=price,
        currency=currency,
        event_category=event_category,
        max_attendees=max_attendees,
        tickets_sold=0,
        status=Event.EventStatus.PUBLISHED,
        image_url=image_url,
    )

    created_media = []
    for index, media in enumerate(uploaded_media):
        raw_name = os.path.basename(media.name or f"media-{index + 1}")
        stem, ext = os.path.splitext(raw_name)
        safe_stem = slugify(stem) or f"media-{index + 1}"
        safe_ext = ext[:12] if ext else ""
        filename = f"event_{event.id}_{uuid.uuid4().hex}_{safe_stem}{safe_ext}"
        storage_path = f"events/{request.user.id}/{filename}"
        saved_path = default_storage.save(storage_path, media)
        file_url = default_storage.url(saved_path)
        media_type = EventMedia.MediaType.IMAGE
        if (media.content_type or "").lower().startswith("video/"):
            media_type = EventMedia.MediaType.VIDEO
        created_media.append(
            EventMedia(
                event=event,
                media_type=media_type,
                file_url=file_url,
                sort_order=index,
            )
        )

    if created_media:
        EventMedia.objects.bulk_create(created_media)
        first_image = next((item.file_url for item in created_media if item.media_type == EventMedia.MediaType.IMAGE), None)
        event.image_url = first_image or created_media[0].file_url
        event.save(update_fields=["image_url", "updated_at"])

    mongo_store.sync_event(event.id)
    mongo_store.sync_user_profile(request.user.id)

    return JsonResponse(
        {
            "message": "Event created successfully.",
            "event": _serialize_event(Event.objects.select_related("host").prefetch_related("media_items").get(id=event.id)),
        }
    )


@require_http_methods(["DELETE"])
def delete_event_api(request, event_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    try:
        event = Event.objects.select_related("host").prefetch_related("media_items").get(id=event_id)
    except Event.DoesNotExist:
        return _error("Event not found.", status=404)

    if event.host_id != request.user.id:
        return _error("You are not allowed to delete this event.", status=403)

    media_urls = [item.file_url for item in event.media_items.all()]
    for media_url in media_urls:
        try:
            parsed = urlparse(media_url)
            media_path = parsed.path or ""
            if media_path.startswith(settings.MEDIA_URL):
                rel_path = media_path[len(settings.MEDIA_URL):].lstrip("/")
                if rel_path:
                    default_storage.delete(rel_path)
        except Exception:
            # Do not block deletion if storage cleanup fails.
            pass

    event.delete()
    mongo_store.sync_user_profile(request.user.id)
    return JsonResponse({"message": "Event deleted successfully.", "eventId": event_id})


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

    queryset = Event.objects.filter(is_active=True).select_related("host").prefetch_related("media_items")
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
