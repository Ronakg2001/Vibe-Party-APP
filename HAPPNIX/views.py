from decimal import Decimal, InvalidOperation
from datetime import datetime, time, timedelta
from math import asin, cos, radians, sin, sqrt
import json
import os
from pathlib import Path
import uuid

from django.contrib.auth import get_user_model
from django.contrib.auth import logout
from django.db.models import F, Q
from django.shortcuts import redirect
from django.template import loader
from django.http import HttpResponse, JsonResponse
from django.db import OperationalError, ProgrammingError
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET, require_http_methods, require_POST
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
from django.utils import timezone
from django.utils.text import slugify
from django.conf import settings
from urllib.parse import urlparse

from . import mongo_store
from .models import Event, EventMedia, EventTicket, Follow, UserProfile
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
    is_verified = profile.gov_id_verified if profile else False
    response = HttpResponse(
        template.render(
            {
                "current_username": request.user.username,
                "current_avatar_url": (
                    (mongo_profile or {}).get("profile_picture_url")
                    or (getattr(profile, "profile_picture_url", "") if profile else "")
                ),
                "manifest_data_json": json.dumps(manifest_data),
                "is_verified": is_verified,
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
@csrf_exempt
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
    now = timezone.now()
    is_ended = bool(event.end_at and event.end_at <= now)
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
        "startAt": event.start_at.isoformat() if event.start_at else None,
        "endAt": event.end_at.isoformat() if event.end_at else None,
        "eventCategory": event.event_category,
        "locationName": event.location_name,
        "latitude": lat,
        "longitude": lon,
        "price": float(event.price),
        "currency": event.currency,
        "maxAttendees": event.max_attendees,
        "ticketsSold": event.tickets_sold,
        "status": event.status,
        "isEnded": is_ended,
        "canBook": bool(event.is_active) and event.status == Event.EventStatus.PUBLISHED and not is_ended,
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


def _parse_event_start(start_label):
    raw = str(start_label or "").strip()
    if not raw:
        return None

    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        except ValueError:
            continue
    raise ValueError("Start date and time format is invalid.")


def _default_end_of_day(start_at):
    end_of_day = start_at.replace(hour=23, minute=59, second=0, microsecond=0)
    return timezone.localtime(end_of_day)


def _event_live_window(event):
    start_at = None
    end_at = None

    for raw_start in [getattr(event, 'start_label', ''), getattr(event, 'start_at', None)]:
        try:
            start_at = _parse_event_start(raw_start) if isinstance(raw_start, str) else raw_start
        except ValueError:
            continue
        if start_at is not None:
            break

    for raw_end in [getattr(event, 'end_label', ''), getattr(event, 'end_at', None)]:
        try:
            end_at = _parse_event_start(raw_end) if isinstance(raw_end, str) and raw_end else None
        except ValueError:
            continue
        if raw_end is not None and not isinstance(raw_end, str):
            end_at = raw_end
        if end_at is not None:
            break

    if start_at is None:
        return None, None
    if end_at is None:
        end_at = _default_end_of_day(start_at)
    return start_at, end_at


def _event_is_live(event, now=None):
    current = timezone.localtime(now or timezone.now())
    start_at, end_at = _event_live_window(event)
    if start_at is None or end_at is None:
        return False
    return start_at <= current < end_at


def _ticket_is_expired(ticket, now=None):
    current = timezone.localtime(now or timezone.now())
    _start_at, end_at = _event_live_window(ticket.event)
    return bool(end_at and end_at <= current and ticket.status == EventTicket.Status.ACTIVE)


def _serialize_ticket(ticket):
    now = timezone.localtime()
    return {
        "id": ticket.id,
        "status": ticket.status,
        "qty": int(ticket.quantity or 1),
        "userId": ticket.attendee_id,
        "username": ticket.attendee.username,
        "createdAt": ticket.booked_at.isoformat() if ticket.booked_at else None,
        "cancelledAt": ticket.cancelled_at.isoformat() if ticket.cancelled_at else None,
        "archivedAt": ticket.archived_at.isoformat() if getattr(ticket, 'archived_at', None) else None,
        "isExpired": _ticket_is_expired(ticket, now),
        "event": _serialize_event(ticket.event),
    }


def _build_event_schedule(payload):
    start_label = str(payload.get("startLabel", "")).strip()
    end_label = str(payload.get("endLabel", "")).strip()
    end_time = str(payload.get("endTime", "")).strip()
    duration_raw = payload.get("durationMinutes", "")

    start_at = _parse_event_start(start_label)
    if start_at is None:
        if end_label or end_time or duration_raw:
            raise ValueError("Start date and time are required before adding event duration or end time.")
        return start_label, end_label, None, None

    end_at = None
    if end_label:
        end_at = _parse_event_start(end_label)
        if end_at is None:
            raise ValueError("End date and time format is invalid.")
    elif end_time:
        for fmt in ("%H:%M", "%I:%M %p"):
            try:
                parsed_end = datetime.strptime(end_time, fmt)
                end_at = start_at.replace(
                    hour=parsed_end.hour,
                    minute=parsed_end.minute,
                    second=0,
                    microsecond=0,
                )
                if end_at <= start_at:
                    end_at += timedelta(days=1)
                break
            except ValueError:
                continue
        if end_at is None:
            raise ValueError("End time format is invalid.")
    elif str(duration_raw).strip():
        try:
            duration_minutes = int(duration_raw)
        except (TypeError, ValueError):
            raise ValueError("Duration must be a valid number of minutes.")
        if duration_minutes <= 0:
            raise ValueError("Duration must be greater than zero.")
        end_at = start_at + timedelta(minutes=duration_minutes)
    else:
        end_at = _default_end_of_day(start_at)

    if end_at is not None:
        duration_minutes = int((end_at - start_at).total_seconds() // 60)
        if duration_minutes < 30 or duration_minutes > 24 * 60:
            raise ValueError("Event duration must be between 30 min and 24 hr.")

    if not end_label and end_at is not None:
        end_label = timezone.localtime(end_at).strftime("%Y-%m-%d %H:%M")

    return start_label, end_label, start_at, end_at


@csrf_exempt
@require_POST
def create_event_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    
    # Aadhaar / government ID verification is temporarily bypassed for local testing.
    
    is_multipart = (request.content_type or "").startswith("multipart/form-data")
    if is_multipart:
        payload = request.POST
    else:
        payload = _json_body(request)

    title = str(payload.get("title", "")).strip()
    description = str(payload.get("description", "")).strip()
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

    try:
        start_label, end_label, start_at, end_at = _build_event_schedule(payload)
    except ValueError as exc:
        return _error(str(exc))

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
        start_at=start_at,
        end_at=end_at,
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
    _log_event_published_notifications(request.user, event)

    return JsonResponse(
        {
            "message": "Event created successfully.",
            "event": _serialize_event(Event.objects.select_related("host").prefetch_related("media_items").get(id=event.id)),
        }
    )


@csrf_exempt
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
    mongo_store.sync_event(event_id)
    mongo_store.sync_user_profile(request.user.id)
    return JsonResponse({"message": "Event deleted successfully.", "eventId": event_id})


@require_GET
def live_events_api(request):
    now = timezone.localtime()
    queryset = (
        Event.objects.filter(is_active=True, status=Event.EventStatus.PUBLISHED)
        .select_related('host')
        .prefetch_related('media_items')
        .order_by('-created_at')
    )
    live_events = [event for event in queryset if _event_is_live(event, now)]
    serialized = []
    for event in live_events:
        data = _serialize_event(event)
        start_at, end_at = _event_live_window(event)
        if start_at is not None:
            data['startAt'] = timezone.localtime(start_at).isoformat()
            data['startLabel'] = timezone.localtime(start_at).strftime('%Y-%m-%d %H:%M')
        if end_at is not None:
            data['endAt'] = timezone.localtime(end_at).isoformat()
            data['endLabel'] = timezone.localtime(end_at).strftime('%Y-%m-%d %H:%M')
        data['isEnded'] = False
        data['isLive'] = True
        serialized.append(data)
    return JsonResponse({'count': len(serialized), 'events': serialized})


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
def my_events_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    queryset = (
        Event.objects.filter(host=request.user)
        .select_related("host")
        .prefetch_related("media_items")
        .order_by("-created_at")
    )
    serialized = [_serialize_event(event) for event in queryset]
    return JsonResponse({"count": len(serialized), "events": serialized})


def _is_private_account(user):
    profile = getattr(user, "profile", None)
    return bool(getattr(profile, "is_private", False))


def _pending_follow_requests_count(user):
    try:
        return Follow.objects.filter(following=user, status=Follow.Status.PENDING).count()
    except (OperationalError, ProgrammingError):
        return 0


def _can_view_private_content(viewer, user):
    if not _is_private_account(user):
        return True
    if getattr(viewer, "is_authenticated", False) and viewer.id == user.id:
        return True
    if not getattr(viewer, "is_authenticated", False):
        return False
    try:
        return Follow.objects.filter(
            follower=viewer,
            following=user,
            status=Follow.Status.ACCEPTED,
        ).exists()
    except (OperationalError, ProgrammingError):
        return False


def _attach_follow_state(viewer, users):
    enriched = []
    for user in users:
        sql_user_id = int(user.get("sql_user_id") or 0)
        if getattr(viewer, "is_authenticated", False) and sql_user_id == viewer.id:
            continue
        next_user = dict(user)
        next_user.setdefault("is_following", False)
        next_user.setdefault("follows_you", False)
        next_user.setdefault("follow_request_pending", False)
        next_user.setdefault("is_private", False)
        enriched.append(next_user)

    if not getattr(viewer, "is_authenticated", False):
        return enriched

    user_ids = [int(user.get("sql_user_id") or 0) for user in enriched if user.get("sql_user_id")]
    if not user_ids:
        return enriched

    try:
        accepted_following_ids = set(
            Follow.objects.filter(
                follower=viewer,
                following_id__in=user_ids,
                status=Follow.Status.ACCEPTED,
            ).values_list("following_id", flat=True)
        )
        pending_following_ids = set(
            Follow.objects.filter(
                follower=viewer,
                following_id__in=user_ids,
                status=Follow.Status.PENDING,
            ).values_list("following_id", flat=True)
        )
        follower_ids = set(
            Follow.objects.filter(
                follower_id__in=user_ids,
                following=viewer,
                status=Follow.Status.ACCEPTED,
            ).values_list("follower_id", flat=True)
        )
    except (OperationalError, ProgrammingError):
        return enriched

    for user in enriched:
        sql_user_id = int(user.get("sql_user_id") or 0)
        user["is_following"] = sql_user_id in accepted_following_ids
        user["follows_you"] = sql_user_id in follower_ids
        user["follow_request_pending"] = sql_user_id in pending_following_ids
    return enriched


def _profile_counts(user):
    try:
        return {
            "followers_count": Follow.objects.filter(following=user, status=Follow.Status.ACCEPTED).count(),
            "following_count": Follow.objects.filter(follower=user, status=Follow.Status.ACCEPTED).count(),
        }
    except (OperationalError, ProgrammingError):
        return {
            "followers_count": 0,
            "following_count": 0,
        }


def _basic_user_payload(user):
    mongo_profile = mongo_store.profile_for_user(user.id) or {}
    profile = getattr(user, "profile", None)
    return {
        "sql_user_id": user.id,
        "username": user.username,
        "full_name": (mongo_profile.get("full_name") or user.first_name or "").strip(),
        "bio": mongo_profile.get("bio") or (getattr(profile, "bio", "") if profile else ""),
        "profile_picture_url": mongo_profile.get("profile_picture_url") or (getattr(profile, "profile_picture_url", "") if profile else ""),
        "gov_id_verified": bool(mongo_profile.get("gov_id_verified", getattr(profile, "gov_id_verified", False))),
        "is_private": bool(mongo_profile.get("is_private", getattr(profile, "is_private", False))),
    }


def _log_follow_notification(actor, target_user):
    mongo_store.log_notification(
        recipient_user_id=target_user.id,
        activity_type="follow",
        actor_user=actor,
        title="New fan",
        body=f"{(actor.first_name or actor.username).strip()} started following you.",
        payload={"target_user_id": target_user.id},
    )


def _log_follow_request_notification(actor, target_user):
    mongo_store.log_notification(
        recipient_user_id=target_user.id,
        activity_type="follow_request",
        actor_user=actor,
        title="Follow request",
        body=f"{(actor.first_name or actor.username).strip()} requested to follow you.",
        payload={"target_user_id": target_user.id},
    )


def _log_follow_request_accepted_notification(actor, requester_user):
    mongo_store.log_notification(
        recipient_user_id=requester_user.id,
        activity_type="follow_request_accepted",
        actor_user=actor,
        title="Request accepted",
        body=f"{(actor.first_name or actor.username).strip()} accepted your follow request.",
        payload={"target_user_id": actor.id},
    )


def _log_event_published_notifications(host_user, event):
    follower_ids = list(
        Follow.objects.filter(following=host_user, status=Follow.Status.ACCEPTED).values_list("follower_id", flat=True)
    )
    for follower_id in follower_ids:
        mongo_store.log_notification(
            recipient_user_id=follower_id,
            activity_type="event_published",
            actor_user=host_user,
            title="New event published",
            body=f"{(host_user.first_name or host_user.username).strip()} published {event.title}.",
            payload={"event_id": event.id, "event_title": event.title},
        )


def _serialize_public_profile(viewer, user):
    mongo_profile = mongo_store.profile_for_user(user.id) or {}
    profile = getattr(user, "profile", None)
    can_view_content = _can_view_private_content(viewer, user)
    hosted_events_qs = (
        Event.objects.filter(host=user, status=Event.EventStatus.PUBLISHED, is_active=True)
        .select_related("host")
        .prefetch_related("media_items")
        .order_by("-created_at")
    )
    hosted_events_count = hosted_events_qs.count()
    hosted_events = [_serialize_event(event) for event in hosted_events_qs] if can_view_content else []
    payload = {
        "sql_user_id": user.id,
        "username": user.username,
        "full_name": (mongo_profile.get("full_name") or user.first_name or "").strip(),
        "bio": mongo_profile.get("bio") or (getattr(profile, "bio", "") if profile else ""),
        "profile_picture_url": mongo_profile.get("profile_picture_url") or (getattr(profile, "profile_picture_url", "") if profile else ""),
        "gov_id_verified": bool(mongo_profile.get("gov_id_verified", getattr(profile, "gov_id_verified", False))),
        "is_private": bool(mongo_profile.get("is_private", getattr(profile, "is_private", False))),
        "can_view_content": can_view_content,
        "private_content_message": "This account is private. Follow to see posts and events." if not can_view_content and _is_private_account(user) else "",
        "hosted_events_count": hosted_events_count,
        "hosted_events": hosted_events,
        **_profile_counts(user),
    }
    attached = _attach_follow_state(viewer, [payload])
    return attached[0] if attached else payload


@require_GET
def search_users_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    query = str(request.GET.get("q", "")).strip()
    if not query:
        return _error("q query param is required.")

    try:
        limit = int(request.GET.get("limit", "20"))
    except ValueError:
        return _error("limit must be an integer.")

    if limit <= 0 or limit > 100:
        return _error("limit must be between 1 and 100.")

    docs = _attach_follow_state(request.user, mongo_store.search_profiles(query=query, limit=limit))
    if docs:
        return JsonResponse({"source": "mongo", "count": len(docs), "users": docs})

    User = get_user_model()
    fallback_qs = (
        User.objects.filter(Q(username__icontains=query) | Q(first_name__icontains=query))
        .select_related("profile")
        .order_by("username")[:limit]
    )
    users = _attach_follow_state(
        request.user,
        [
            {
                "sql_user_id": row.id,
                "username": row.username,
                "full_name": row.first_name or "",
                "profile_picture_url": getattr(getattr(row, "profile", None), "profile_picture_url", ""),
                "is_private": bool(getattr(getattr(row, "profile", None), "is_private", False)),
            }
            for row in fallback_qs
        ],
    )
    return JsonResponse({"source": "sql-fallback", "count": len(users), "users": users})


@csrf_exempt
@require_POST
def follow_user_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    action = str(payload.get("action", "follow")).strip().lower() or "follow"
    try:
        target_user_id = int(payload.get("targetUserId"))
    except (TypeError, ValueError):
        return _error("A valid targetUserId is required.")

    if target_user_id == request.user.id:
        return _error("You cannot follow yourself.")

    User = get_user_model()
    target_user = User.objects.filter(id=target_user_id).select_related("profile").first()
    if target_user is None:
        return _error("User not found.", status=404)

    is_private = _is_private_account(target_user)
    try:
        follows_you = Follow.objects.filter(
            follower=target_user,
            following=request.user,
            status=Follow.Status.ACCEPTED,
        ).exists()
        existing_link = Follow.objects.filter(follower=request.user, following=target_user).first()

        if action in {"unfollow", "cancel_request"}:
            deleted, _ = Follow.objects.filter(follower=request.user, following=target_user).delete()
            counts = _profile_counts(target_user)
            return JsonResponse(
                {
                    "message": "Follow request cancelled." if action == "cancel_request" and deleted else ("Unfollowed successfully." if deleted else "Nothing to update."),
                    "created": False,
                    "deleted": bool(deleted),
                    "follow": {
                        "sql_user_id": target_user.id,
                        "is_following": False,
                        "follows_you": follows_you,
                        "follow_request_pending": False,
                        "is_private": is_private,
                        **counts,
                    },
                }
            )

        if is_private:
            if existing_link and existing_link.status == Follow.Status.ACCEPTED:
                counts = _profile_counts(target_user)
                return JsonResponse(
                    {
                        "message": "Already following this user.",
                        "created": False,
                        "follow": {
                            "sql_user_id": target_user.id,
                            "is_following": True,
                            "follows_you": follows_you,
                            "follow_request_pending": False,
                            "is_private": True,
                            **counts,
                        },
                    }
                )

            if existing_link and existing_link.status == Follow.Status.PENDING:
                counts = _profile_counts(target_user)
                return JsonResponse(
                    {
                        "message": "Follow request already sent.",
                        "created": False,
                        "follow": {
                            "sql_user_id": target_user.id,
                            "is_following": False,
                            "follows_you": follows_you,
                            "follow_request_pending": True,
                            "is_private": True,
                            **counts,
                        },
                    }
                )

            Follow.objects.create(
                follower=request.user,
                following=target_user,
                status=Follow.Status.PENDING,
            )
            counts = _profile_counts(target_user)
            _log_follow_request_notification(request.user, target_user)
            return JsonResponse(
                {
                    "message": "Follow request sent.",
                    "created": True,
                    "follow": {
                        "sql_user_id": target_user.id,
                        "is_following": False,
                        "follows_you": follows_you,
                        "follow_request_pending": True,
                        "is_private": True,
                        **counts,
                    },
                }
            )

        if existing_link and existing_link.status == Follow.Status.PENDING:
            existing_link.status = Follow.Status.ACCEPTED
            existing_link.save(update_fields=["status"])
            created = True
        else:
            _, created = Follow.objects.get_or_create(
                follower=request.user,
                following=target_user,
                defaults={"status": Follow.Status.ACCEPTED},
            )
        counts = _profile_counts(target_user)
    except (OperationalError, ProgrammingError):
        return _error("Follow system is not ready yet. Please run migrations and try again.", status=503)

    if created:
        _log_follow_notification(request.user, target_user)
    return JsonResponse(
        {
            "message": "Followed successfully." if created else "Already following this user.",
            "created": created,
            "follow": {
                "sql_user_id": target_user.id,
                "is_following": True,
                "follows_you": follows_you,
                "follow_request_pending": False,
                "is_private": is_private,
                **counts,
            },
        }
    )


@require_GET
def profile_follow_graph_api(request, graph_type):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    graph_type = str(graph_type or '').strip().lower()
    if graph_type not in {"followers", "following"}:
        return _error("graph type must be followers or following.")

    try:
        if graph_type == "followers":
            links = Follow.objects.filter(following=request.user, status=Follow.Status.ACCEPTED).select_related("follower")
            users = [_basic_user_payload(link.follower) for link in links]
        else:
            links = Follow.objects.filter(follower=request.user, status=Follow.Status.ACCEPTED).select_related("following")
            users = [_basic_user_payload(link.following) for link in links]
    except (OperationalError, ProgrammingError):
        return JsonResponse({"graph": graph_type, "count": 0, "users": []})

    users = _attach_follow_state(request.user, users)
    return JsonResponse({"graph": graph_type, "count": len(users), "users": users})


@require_GET
def public_profile_api(request, user_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    User = get_user_model()
    target_user = User.objects.filter(id=user_id).select_related("profile").first()
    if target_user is None:
        return _error("User not found.", status=404)

    if target_user.id == request.user.id:
        return JsonResponse({"profile": _serialize_public_profile(request.user, target_user), "is_self": True})

    return JsonResponse({"profile": _serialize_public_profile(request.user, target_user), "is_self": False})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def profile_privacy_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    try:
        profile = UserProfile.objects.get(user=request.user)
    except UserProfile.DoesNotExist:
        return _error("Profile not found.", status=404)

    if request.method == "GET":
        return JsonResponse({"isPrivate": bool(profile.is_private)})

    payload = _json_body(request)
    profile.is_private = bool(payload.get("isPrivate", False))
    profile.save(update_fields=["is_private"])
    mongo_store.sync_user_profile(request.user.id)
    return JsonResponse({"message": "Privacy updated.", "isPrivate": bool(profile.is_private)})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def follow_requests_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    if request.method == "GET":
        try:
            requests_qs = Follow.objects.filter(
                following=request.user,
                status=Follow.Status.PENDING,
            ).select_related("follower")
        except (OperationalError, ProgrammingError):
            return JsonResponse({"count": 0, "requests": []})

        payload = []
        for link in requests_qs:
            item = _basic_user_payload(link.follower)
            item["requested_at"] = link.created_at.isoformat() if link.created_at else None
            payload.append(item)
        payload = _attach_follow_state(request.user, payload)
        return JsonResponse({"count": len(payload), "requests": payload})

    payload = _json_body(request)
    action = str(payload.get("action", "")).strip().lower()
    try:
        requester_user_id = int(payload.get("requesterUserId"))
    except (TypeError, ValueError):
        return _error("A valid requesterUserId is required.")

    if action not in {"approve", "deny"}:
        return _error("action must be approve or deny.")

    try:
        follow_link = Follow.objects.select_related("follower").filter(
            follower_id=requester_user_id,
            following=request.user,
            status=Follow.Status.PENDING,
        ).first()
    except (OperationalError, ProgrammingError):
        return _error("Follow requests are not ready yet. Please run migrations and try again.", status=503)

    if follow_link is None:
        return _error("Follow request not found.", status=404)

    requester_user = follow_link.follower
    if action == "approve":
        follow_link.status = Follow.Status.ACCEPTED
        follow_link.save(update_fields=["status"])
        _log_follow_request_accepted_notification(request.user, requester_user)
        message = "Follow request approved."
    else:
        follow_link.delete()
        message = "Follow request declined."

    return JsonResponse({
        "message": message,
        "requesterUserId": requester_user.id,
        "pendingCount": _pending_follow_requests_count(request.user),
        "followersCount": _profile_counts(request.user)["followers_count"],
    })


@csrf_exempt
@require_http_methods(["GET", "POST"])
def notifications_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    if request.method == "POST":
        mongo_store.mark_notifications_read(request.user.id)
        return JsonResponse({"message": "Notifications marked as read.", "unreadCount": 0})

    try:
        limit = int(request.GET.get("limit", "50"))
    except ValueError:
        return _error("limit must be an integer.")

    notifications = mongo_store.notifications_for_user(request.user.id, limit=limit)
    unread_count = mongo_store.unread_notification_count(request.user.id)
    return JsonResponse({"count": len(notifications), "unreadCount": unread_count, "notifications": notifications})


@csrf_exempt
@require_POST
def log_activity_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    activity_type = str(payload.get("activityType", "")).strip().lower()
    try:
        recipient_user_id = int(payload.get("recipientUserId"))
    except (TypeError, ValueError):
        return _error("A valid recipientUserId is required.")

    if recipient_user_id == request.user.id:
        return JsonResponse({"message": "Skipped self notification."})

    if activity_type == "ticket_purchase":
        title = "New ticket booked"
        body = f"{(request.user.first_name or request.user.username).strip()} booked a ticket for {str(payload.get('eventTitle', 'your event')).strip() or 'your event'}."
    elif activity_type == "like":
        title = "New like"
        body = f"{(request.user.first_name or request.user.username).strip()} liked your post."
    else:
        title = str(payload.get("title", "New activity")).strip() or "New activity"
        body = str(payload.get("body", "")).strip()

    mongo_store.log_notification(
        recipient_user_id=recipient_user_id,
        activity_type=activity_type or "activity",
        actor_user=request.user,
        title=title,
        body=body,
        payload={
            "event_id": payload.get("eventId"),
            "event_title": payload.get("eventTitle"),
            "post_id": payload.get("postId"),
        },
    )
    return JsonResponse({"message": "Activity logged."})


@require_GET
def tickets_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    cleanup_cutoff = timezone.now() - timedelta(days=10)
    EventTicket.objects.filter(
        attendee=request.user,
        status=EventTicket.Status.CANCELLED,
        cancelled_at__lte=cleanup_cutoff,
    ).delete()

    queryset = (
        EventTicket.objects.filter(attendee=request.user, archived_at__isnull=True)
        .select_related("attendee", "event", "event__host")
        .prefetch_related("event__media_items")
        .order_by("-booked_at", "-id")
    )
    tickets = [_serialize_ticket(ticket) for ticket in queryset]
    return JsonResponse({"count": len(tickets), "tickets": tickets})


@csrf_exempt
@require_POST
def book_ticket_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    try:
        event_id = int(payload.get("eventId"))
    except (TypeError, ValueError):
        return _error("A valid eventId is required.")

    event = (
        Event.objects.filter(id=event_id, is_active=True, status=Event.EventStatus.PUBLISHED)
        .select_related("host")
        .prefetch_related("media_items")
        .first()
    )
    if event is None:
        return _error("Event not found.", status=404)
    _start_at, end_at = _event_live_window(event)
    if end_at and end_at <= timezone.localtime():
        return _error("This event has already ended, so booking is closed.", status=400)

    ticket, created = EventTicket.objects.get_or_create(
        attendee=request.user,
        event=event,
        defaults={"status": EventTicket.Status.ACTIVE, "quantity": 1, "cancelled_at": None, "archived_at": None},
    )
    if not created and ticket.status == EventTicket.Status.ACTIVE:
        return _error("You already joined this party. Cancel the existing ticket to join again.", status=409)

    if not created:
        ticket.status = EventTicket.Status.ACTIVE
        ticket.cancelled_at = None
        ticket.archived_at = None
        ticket.quantity = 1
        ticket.save(update_fields=["status", "cancelled_at", "archived_at", "quantity", "updated_at"])
    Event.objects.filter(id=event.id).update(tickets_sold=F("tickets_sold") + 1)
    event.refresh_from_db(fields=["tickets_sold"])
    ticket.refresh_from_db()
    return JsonResponse({"message": "Ticket booked successfully.", "ticket": _serialize_ticket(ticket)})


@csrf_exempt
@require_POST
def archive_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    ticket = (
        EventTicket.objects.filter(id=ticket_id, attendee=request.user)
        .select_related("attendee", "event", "event__host")
        .prefetch_related("event__media_items")
        .first()
    )
    if ticket is None:
        return _error("Ticket not found.", status=404)
    if not _ticket_is_expired(ticket):
        return _error("Only expired tickets can be archived.", status=400)

    ticket.archived_at = timezone.now()
    ticket.save(update_fields=["archived_at", "updated_at"])
    return JsonResponse({"message": "Ticket archived successfully.", "ticket": _serialize_ticket(ticket)})


@csrf_exempt
@require_http_methods(["DELETE", "POST"])
def delete_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    ticket = EventTicket.objects.filter(id=ticket_id, attendee=request.user).select_related("event").first()
    if ticket is None:
        return _error("Ticket not found.", status=404)

    expired = False
    if ticket.event_id:
        ticket = EventTicket.objects.filter(id=ticket_id, attendee=request.user).select_related("attendee", "event", "event__host").prefetch_related("event__media_items").first()
        expired = _ticket_is_expired(ticket)
    can_delete = ticket.status == EventTicket.Status.CANCELLED or expired
    if not can_delete:
        return _error("Only cancelled or expired tickets can be deleted.", status=400)

    ticket.delete()
    return JsonResponse({"message": "Ticket deleted successfully.", "ticketId": ticket_id})


@csrf_exempt
@require_POST
def cancel_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    ticket = (
        EventTicket.objects.filter(id=ticket_id, attendee=request.user)
        .select_related("attendee", "event", "event__host")
        .prefetch_related("event__media_items")
        .first()
    )
    if ticket is None:
        return _error("Ticket not found.", status=404)
    if ticket.status == EventTicket.Status.CANCELLED:
        return JsonResponse({"message": "Ticket already cancelled.", "ticket": _serialize_ticket(ticket)})

    ticket.status = EventTicket.Status.CANCELLED
    ticket.cancelled_at = timezone.now()
    ticket.save(update_fields=["status", "cancelled_at", "updated_at"])
    Event.objects.filter(id=ticket.event_id, tickets_sold__gt=0).update(tickets_sold=F("tickets_sold") - 1)
    ticket.event.refresh_from_db(fields=["tickets_sold"])
    return JsonResponse({"message": "Ticket cancelled successfully.", "ticket": _serialize_ticket(ticket)})


@require_GET
def current_profile_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    mongo_profile = mongo_store.profile_for_user(request.user.id) or {}
    profile = getattr(request.user, "profile", None)
    payload = {
        "sql_user_id": request.user.id,
        "username": request.user.username,
        "email": (request.user.email or "").lower(),
        "full_name": (mongo_profile.get("full_name") or request.user.first_name or "").strip(),
        "mobile": mongo_profile.get("mobile") or (getattr(profile, "mobile", "") if profile else ""),
        "sex": mongo_profile.get("sex") or (getattr(profile, "sex", "") if profile else ""),
        "date_of_birth": mongo_profile.get("date_of_birth") or (
            profile.date_of_birth.isoformat()
            if profile and getattr(profile, "date_of_birth", None)
            else None
        ),
        "bio": mongo_profile.get("bio") or (getattr(profile, "bio", "") if profile else ""),
        "profile_picture_url": mongo_profile.get("profile_picture_url") or (getattr(profile, "profile_picture_url", "") if profile else ""),
        "gov_id_verified": bool(mongo_profile.get("gov_id_verified", getattr(profile, "gov_id_verified", False))),
        "is_private": bool(mongo_profile.get("is_private", getattr(profile, "is_private", False))),
        "pending_follow_requests_count": _pending_follow_requests_count(request.user),
        "unread_notifications_count": mongo_store.unread_notification_count(request.user.id),
        **_profile_counts(request.user),
    }
    source = "mongo" if mongo_profile else "sql-fallback"
    return JsonResponse({"source": source, "profile": payload})
