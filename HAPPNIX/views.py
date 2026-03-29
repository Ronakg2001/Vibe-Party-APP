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
from django.db import transaction
from django.shortcuts import redirect, render, get_object_or_404
from django.template import loader
from django.http import Http404, HttpResponse, JsonResponse
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
from .models import DirectConversation, DirectMessage, Event, EventMedia, EventTicket, Follow, UserProfile, EventTicket
from .messaging import _broadcast_message_created
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


def _resolved_ticketing(event):
    raw_ticket_type = str(getattr(event, "ticket_type", "") or "").strip()
    raw_ticket_tiers = getattr(event, "ticket_tiers", []) or []
    has_paid_tiers = isinstance(raw_ticket_tiers, list) and any(float((tier or {}).get("price") or 0) > 0 for tier in raw_ticket_tiers if isinstance(tier, dict))
    price_value = float(getattr(event, "price", 0) or 0)
    if raw_ticket_type == "Paid" or has_paid_tiers or price_value > 0:
        return "Paid", raw_ticket_tiers if isinstance(raw_ticket_tiers, list) else []
    if raw_ticket_type == "Guestlist":
        return "Guestlist", []
    return "Free", []


def _serialize_event(event, distance_km=None):
    lat = float(event.latitude)
    lon = float(event.longitude)
    now = timezone.now()
    is_ended = bool(event.end_at and event.end_at <= now)
    media_items = list(event.media_items.all()) if hasattr(event, "media_items") else []
    media_urls = [item.file_url for item in media_items]
    image_media = [item.file_url for item in media_items if item.media_type == EventMedia.MediaType.IMAGE]
    cover_url = image_media[0] if image_media else (media_urls[0] if media_urls else event.image_url)
    ticket_type, ticket_tiers = _resolved_ticketing(event)
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
        "ticketType": ticket_type,
        "ticketTiers": ticket_tiers,
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


def _ticket_amount(ticket):
    return float((ticket.ticket_price or Decimal("0")) + (ticket.service_fee or Decimal("0")))


def _ticket_transaction_id(prefix):
    return f"{prefix.upper()}-{uuid.uuid4().hex[:12].upper()}"


def _group_tickets_for(ticket):
    group_code = (ticket.group_code or "").strip()
    queryset = EventTicket.objects.filter(event=ticket.event)
    if group_code:
        queryset = queryset.filter(group_code=group_code)
    else:
        queryset = queryset.filter(id=ticket.id)
    return list(
        queryset.select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .order_by("booked_at", "id")
    )


def _serialize_ticket(ticket):
    now = timezone.localtime()
    group_tickets = _group_tickets_for(ticket)
    return {
        "id": ticket.id,
        "groupCode": ticket.group_code or str(ticket.id),
        "status": ticket.status,
        "qty": int(ticket.quantity or 1),
        "userId": ticket.attendee_id,
        "username": ticket.attendee.username,
        "bookedById": ticket.booked_by_id or ticket.attendee_id,
        "bookedByUsername": (ticket.booked_by.username if ticket.booked_by else ticket.attendee.username),
        "paidById": ticket.paid_by_id,
        "paidByUsername": ticket.paid_by.username if ticket.paid_by else "",
        "tierName": ticket.tier_name or "General",
        "inviteStatus": ticket.invite_status or "confirmed",
        "pendingReason": ticket.pending_reason or "",
        "ticketPrice": float(ticket.ticket_price or Decimal("0")),
        "serviceFee": float(ticket.service_fee or Decimal("0")),
        "amountDue": _ticket_amount(ticket),
        "paymentTransactionId": ticket.payment_transaction_id or "",
        "refundTransactionId": ticket.refund_transaction_id or "",
        "createdAt": ticket.booked_at.isoformat() if ticket.booked_at else None,
        "cancelledAt": ticket.cancelled_at.isoformat() if ticket.cancelled_at else None,
        "archivedAt": ticket.archived_at.isoformat() if getattr(ticket, 'archived_at', None) else None,
        "isExpired": _ticket_is_expired(ticket, now),
        "canPay": ticket.status == EventTicket.Status.PENDING,
        "participants": [
            {
                "ticketId": participant.id,
                "userId": participant.attendee_id,
                "username": participant.attendee.username,
                "status": participant.status,
                "bookedById": participant.booked_by_id or participant.attendee_id,
                "bookedByUsername": participant.booked_by.username if participant.booked_by else participant.attendee.username,
                "paidById": participant.paid_by_id,
                "paidByUsername": participant.paid_by.username if participant.paid_by else "",
                "inviteStatus": participant.invite_status or "confirmed",
                "pendingReason": participant.pending_reason or "",
                "ticketPrice": float(participant.ticket_price or Decimal("0")),
                "serviceFee": float(participant.service_fee or Decimal("0")),
                "amountDue": _ticket_amount(participant),
                "paymentTransactionId": participant.payment_transaction_id or "",
                "refundTransactionId": participant.refund_transaction_id or "",
                "isCurrentUser": participant.attendee_id == ticket.attendee_id,
                "isPaid": participant.status == EventTicket.Status.ACTIVE,
            }
            for participant in group_tickets
        ],
        "event": _serialize_event(ticket.event),
    }


def _normalize_ticket_invite_status(value):
    label = str(value or "confirmed").strip().lower()
    return "tentative" if label == "tentative" else "confirmed"


def _invite_status_map(payload, allowed_user_ids):
    raw_map = payload.get("inviteeStatuses") or {}
    if not isinstance(raw_map, dict):
        return {}
    normalized = {}
    for raw_user_id, raw_status in raw_map.items():
        try:
            user_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if user_id in allowed_user_ids:
            normalized[user_id] = _normalize_ticket_invite_status(raw_status)
    return normalized


def _group_ticket_queryset(ticket):
    queryset = EventTicket.objects.filter(event=ticket.event, archived_at__isnull=True)
    if ticket.group_code:
        return queryset.filter(group_code=ticket.group_code)
    return queryset.filter(id=ticket.id)


def _group_member_ticket(ticket, user):
    return (
        _group_ticket_queryset(ticket)
        .exclude(status=EventTicket.Status.CANCELLED)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .filter(attendee=user)
        .first()
    )


def _ticket_payment_fields(ticket_price, service_fee, should_activate, payer, invite_status, pending_reason):
    amount_due = float((ticket_price or Decimal("0")) + (service_fee or Decimal("0")))
    payment_transaction_id = ""
    paid_by = None
    if should_activate:
        paid_by = payer
        if amount_due > 0:
            payment_transaction_id = _ticket_transaction_id("pay")
    return {
        "status": EventTicket.Status.ACTIVE if should_activate else EventTicket.Status.PENDING,
        "paid_by": paid_by,
        "invite_status": invite_status,
        "pending_reason": "" if should_activate else pending_reason,
        "payment_transaction_id": payment_transaction_id,
        "refund_transaction_id": "",
    }


def _resolved_ticket_payload(payload, fallback_tier_name, fallback_ticket_price, fallback_service_fee):
    tier_name = str(payload.get("tierName", fallback_tier_name) or fallback_tier_name).strip() or fallback_tier_name
    try:
        ticket_price = Decimal(str(payload.get("ticketPrice", fallback_ticket_price) or fallback_ticket_price or "0"))
    except (InvalidOperation, TypeError, ValueError):
        ticket_price = Decimal(str(fallback_ticket_price or "0"))
    try:
        service_fee = Decimal(str(payload.get("serviceFee", fallback_service_fee) or fallback_service_fee or "0"))
    except (InvalidOperation, TypeError, ValueError):
        service_fee = Decimal(str(fallback_service_fee or "0"))
    return tier_name, max(ticket_price, Decimal("0")), max(service_fee, Decimal("0"))


def _ticket_conflict_queryset(event, user_ids):
    return EventTicket.objects.filter(
        attendee_id__in=user_ids,
        event=event,
        archived_at__isnull=True,
    ).exclude(status=EventTicket.Status.CANCELLED)


def _ordered_user_ids(left_user_id, right_user_id):
    left = int(left_user_id)
    right = int(right_user_id)
    return (left, right) if left < right else (right, left)


def _get_or_create_ticket_conversation(left_user, right_user):
    first_id, second_id = _ordered_user_ids(left_user.id, right_user.id)
    conversation, _created = DirectConversation.objects.get_or_create(
        user_one_id=first_id,
        user_two_id=second_id,
    )
    return conversation


def _send_group_ticket_invite(organizer, attendee, ticket):
    if organizer.id == attendee.id:
        return
    event_title = str(ticket.event.title or "this event").strip()
    invite_label = str(ticket.invite_status or "confirmed").strip().lower() or "confirmed"
    status_label = "pending" if ticket.status == EventTicket.Status.PENDING else "confirmed"
    amount_value = _ticket_amount(ticket)
    amount_label = "Free" if amount_value <= 0 else f"INR {amount_value:g}"
    inviter_label = (organizer.first_name or organizer.username).strip()
    message_body = "\n".join([
        "[Ticket Invite]",
        f"Event: {event_title}",
        f"Added by: @{organizer.username}",
        f"Display Name: {inviter_label}",
        f"Invite: {invite_label.title()}",
        f"Status: {status_label.title()}",
        f"Tier: {ticket.tier_name or 'General'}",
        f"Amount: {amount_label}",
        f"Ticket ID: {ticket.id}",
        "Open My Events to view your ticket.",
    ])
    conversation = _get_or_create_ticket_conversation(organizer, attendee)
    message = DirectMessage.objects.create(
        conversation=conversation,
        sender=organizer,
        body=message_body,
    )
    conversation.deleted_by.clear()
    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])
    _broadcast_message_created(conversation, message)
    mongo_store.log_notification(
        recipient_user_id=attendee.id,
        activity_type="ticket_invite",
        actor_user=organizer,
        title="Ticket shared with you",
        body=f"{(organizer.first_name or organizer.username).strip()} added you to {event_title} as {invite_label}.",
        payload={
            "event_id": ticket.event_id,
            "event_title": event_title,
            "ticket_id": ticket.id,
            "conversation_id": conversation.id,
            "message_id": message.id,
            "status": ticket.status,
            "invite_status": invite_label,
        },
    )


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

    ticket_type = str(payload.get("ticketType", "Free")).strip() or "Free"
    if ticket_type not in {"Free", "Paid", "Guestlist"}:
        ticket_type = "Free"
    raw_ticket_tiers = payload.get("ticketTiers", [])
    if isinstance(raw_ticket_tiers, str):
        try:
            raw_ticket_tiers = json.loads(raw_ticket_tiers)
        except (TypeError, ValueError):
            raw_ticket_tiers = []
    clean_ticket_tiers = []
    if isinstance(raw_ticket_tiers, list):
        for tier in raw_ticket_tiers:
            if not isinstance(tier, dict):
                continue
            tier_name = str(tier.get("name", "")).strip() or "General"
            try:
                tier_price = Decimal(str(tier.get("price", 0) or 0))
            except (InvalidOperation, TypeError, ValueError):
                tier_price = Decimal("0")
            clean_ticket_tiers.append({
                "name": tier_name,
                "price": float(max(tier_price, Decimal("0"))),
                "qty": str(tier.get("qty", "") or "").strip(),
                "flex": bool(tier.get("flex", False)),
                "services": str(tier.get("services", "") or "").strip(),
            })
    if ticket_type == "Paid":
        if not clean_ticket_tiers:
            return _error("Please add at least one paid ticket tier.")
        price = min(Decimal(str(tier.get("price", 0) or 0)) for tier in clean_ticket_tiers)
    else:
        clean_ticket_tiers = []
        if ticket_type == "Free":
            price = Decimal("0")

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
        ticket_type=ticket_type,
        ticket_tiers=clean_ticket_tiers,
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
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
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

    invitee_ids = []
    for raw_user_id in payload.get("inviteeUserIds") or []:
        try:
            invitee_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if invitee_id > 0 and invitee_id != request.user.id and invitee_id not in invitee_ids:
            invitee_ids.append(invitee_id)

    participant_ids = [request.user.id, *invitee_ids]
    payer_ids = {request.user.id}
    for raw_user_id in payload.get("paidForUserIds") or []:
        try:
            payer_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if payer_id in participant_ids:
            payer_ids.add(payer_id)
    invitee_statuses = _invite_status_map(payload, set(invitee_ids))

    ticket_tier_name = str(payload.get("tierName", "General")).strip() or "General"
    try:
        ticket_price = Decimal(str(payload.get("ticketPrice", "0") or "0"))
    except (InvalidOperation, TypeError, ValueError):
        ticket_price = Decimal("0")
    try:
        service_fee = Decimal(str(payload.get("serviceFee", "0") or "0"))
    except (InvalidOperation, TypeError, ValueError):
        service_fee = Decimal("0")
    ticket_price = max(ticket_price, Decimal("0"))
    service_fee = max(service_fee, Decimal("0"))

    users = list(get_user_model().objects.filter(id__in=participant_ids).order_by("id"))
    if len(users) != len(participant_ids):
        return _error("One or more selected users could not be found.", status=404)

    existing_conflicts = list(
        _ticket_conflict_queryset(event, participant_ids)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
    )
    existing_by_user_id = {ticket.attendee_id: ticket for ticket in existing_conflicts}
    requester_existing_ticket = existing_by_user_id.get(request.user.id)
    invitee_ids = [user_id for user_id in invitee_ids if user_id not in existing_by_user_id]
    participant_ids = [request.user.id, *invitee_ids] if requester_existing_ticket is None else [request.user.id]

    if requester_existing_ticket is not None:
        skipped_usernames = [existing_by_user_id[user_id].attendee.username for user_id in existing_by_user_id if user_id != request.user.id]
        if not skipped_usernames:
            return _error("You already have this event in My Events.", status=409)
        return JsonResponse({
            "message": "You already have this event in My Events.",
            "skippedUsers": skipped_usernames,
            "ticket": _serialize_ticket(requester_existing_ticket),
        })

    users = list(get_user_model().objects.filter(id__in=participant_ids).order_by("id"))
    if len(users) != len(participant_ids):
        return _error("One or more selected users could not be found.", status=404)

    group_code = str(uuid.uuid4()) if len(participant_ids) > 1 else ""
    with transaction.atomic():
        created_tickets = []
        active_count = 0
        for user in users:
            if user.id == request.user.id:
                payment_fields = _ticket_payment_fields(
                    ticket_price,
                    service_fee if ticket_price > 0 else Decimal("0"),
                    True,
                    request.user,
                    "confirmed",
                    "",
                )
            elif ticket_price <= 0:
                invite_status = invitee_statuses.get(user.id, "confirmed")
                payment_fields = _ticket_payment_fields(
                    Decimal("0"),
                    Decimal("0"),
                    invite_status == "confirmed",
                    request.user,
                    invite_status,
                    "tentative",
                )
            else:
                payment_fields = _ticket_payment_fields(
                    ticket_price,
                    service_fee,
                    user.id in payer_ids,
                    request.user,
                    "confirmed",
                    "payment",
                )
            status = payment_fields["status"]
            if status == EventTicket.Status.ACTIVE:
                active_count += 1
            defaults = {
                "booked_by": request.user,
                "group_code": group_code,
                "tier_name": ticket_tier_name,
                "ticket_price": ticket_price,
                "service_fee": service_fee if ticket_price > 0 else Decimal("0"),
                "quantity": 1,
                "cancelled_at": None,
                "archived_at": None,
                **payment_fields,
            }
            existing_ticket = EventTicket.objects.filter(attendee=user, event=event).first()
            if existing_ticket is not None:
                for field_name, field_value in defaults.items():
                    setattr(existing_ticket, field_name, field_value)
                existing_ticket.save(update_fields=[
                    "booked_by", "paid_by", "group_code", "tier_name", "ticket_price", "service_fee",
                    "status", "quantity", "cancelled_at", "archived_at", "invite_status", "pending_reason",
                    "payment_transaction_id", "refund_transaction_id", "updated_at"
                ])
                created_tickets.append(existing_ticket)
            else:
                created_tickets.append(EventTicket.objects.create(attendee=user, event=event, **defaults))
        if active_count:
            Event.objects.filter(id=event.id).update(tickets_sold=F("tickets_sold") + active_count)

    event.refresh_from_db(fields=["tickets_sold"])
    for ticket in created_tickets:
        if ticket.attendee_id != request.user.id:
            _send_group_ticket_invite(request.user, ticket.attendee, ticket)
    current_ticket = next(ticket for ticket in created_tickets if ticket.attendee_id == request.user.id)
    return JsonResponse({"message": "Ticket booked successfully.", "ticket": _serialize_ticket(current_ticket)})


@csrf_exempt
@require_POST
def pay_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    base_ticket = (
        EventTicket.objects.filter(id=ticket_id, archived_at__isnull=True)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .first()
    )
    if base_ticket is None:
        return _error("Ticket not found.", status=404)
    if base_ticket.status == EventTicket.Status.CANCELLED:
        return _error("This ticket has been cancelled.", status=400)
    if _ticket_is_expired(base_ticket):
        return _error("This event has already ended, so payment is closed.", status=400)

    viewer_ticket = _group_member_ticket(base_ticket, request.user)
    if viewer_ticket is None:
        return _error("You are not part of this ticket group.", status=403)

    raw_target_ids = payload.get("payForTicketIds") or [ticket_id]
    target_ids = []
    for raw_ticket_id in raw_target_ids:
        try:
            candidate_id = int(raw_ticket_id)
        except (TypeError, ValueError):
            continue
        if candidate_id > 0 and candidate_id not in target_ids:
            target_ids.append(candidate_id)
    if not target_ids:
        target_ids = [base_ticket.id]

    target_tickets = list(
        _group_ticket_queryset(base_ticket)
        .filter(id__in=target_ids)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
    )
    if not target_tickets:
        return _error("No pending group members were selected.", status=400)

    pending_tickets = [ticket for ticket in target_tickets if ticket.status == EventTicket.Status.PENDING]
    if not pending_tickets:
        refreshed_viewer = _group_member_ticket(base_ticket, request.user) or viewer_ticket
        return JsonResponse({"message": "Selected tickets are already confirmed.", "ticket": _serialize_ticket(refreshed_viewer)})

    selected_tier_name, selected_ticket_price, selected_service_fee = _resolved_ticket_payload(
        payload,
        base_ticket.tier_name or "General",
        base_ticket.ticket_price,
        base_ticket.service_fee,
    )

    with transaction.atomic():
        for ticket in pending_tickets:
            ticket.tier_name = selected_tier_name
            ticket.ticket_price = selected_ticket_price
            ticket.service_fee = selected_service_fee if selected_ticket_price > 0 else Decimal("0")
            amount_due = _ticket_amount(ticket)
            ticket.status = EventTicket.Status.ACTIVE
            ticket.paid_by = request.user
            ticket.cancelled_at = None
            ticket.invite_status = "confirmed"
            ticket.pending_reason = ""
            ticket.payment_transaction_id = _ticket_transaction_id("pay") if amount_due > 0 else ""
            ticket.refund_transaction_id = ""
            ticket.save(update_fields=[
                "tier_name", "ticket_price", "service_fee", "status", "paid_by", "cancelled_at", "invite_status", "pending_reason",
                "payment_transaction_id", "refund_transaction_id", "updated_at"
            ])
        Event.objects.filter(id=base_ticket.event_id).update(tickets_sold=F("tickets_sold") + len(pending_tickets))

    refreshed_viewer = _group_member_ticket(base_ticket, request.user) or viewer_ticket
    if refreshed_viewer and refreshed_viewer.event_id:
        refreshed_viewer.event.refresh_from_db(fields=["tickets_sold"])
    return JsonResponse({"message": "Payment completed successfully.", "ticket": _serialize_ticket(refreshed_viewer)})


@csrf_exempt
@require_POST
def archive_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    ticket = (
        EventTicket.objects.filter(id=ticket_id, attendee=request.user)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .first()
    )
    if ticket is None:
        return _error("Ticket not found.", status=404)
    if not _ticket_is_expired(ticket):
        return _error("Only joined tickets from finished events can be archived.", status=400)

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
        ticket = EventTicket.objects.filter(id=ticket_id, attendee=request.user).select_related("attendee", "event", "event__host", "booked_by", "paid_by").prefetch_related("event__media_items").first()
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
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .first()
    )
    if ticket is None:
        return _error("Ticket not found.", status=404)
    if ticket.status == EventTicket.Status.CANCELLED:
        return JsonResponse({"message": "Ticket already cancelled.", "ticket": _serialize_ticket(ticket)})

    decrements = 1 if ticket.status == EventTicket.Status.ACTIVE else 0
    ticket.status = EventTicket.Status.CANCELLED
    ticket.cancelled_at = timezone.now()
    ticket.pending_reason = ""
    if decrements and _ticket_amount(ticket) > 0:
        ticket.refund_transaction_id = _ticket_transaction_id("refund")
    ticket.save(update_fields=["status", "cancelled_at", "pending_reason", "refund_transaction_id", "updated_at"])
    if decrements:
        Event.objects.filter(id=ticket.event_id, tickets_sold__gt=0).update(tickets_sold=F("tickets_sold") - 1)
        ticket.event.refresh_from_db(fields=["tickets_sold"])
    return JsonResponse({"message": "Ticket cancelled successfully.", "ticket": _serialize_ticket(ticket)})


@csrf_exempt
@require_POST
def update_group_ticket_api(request, ticket_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    base_ticket = (
        EventTicket.objects.filter(id=ticket_id, archived_at__isnull=True)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .first()
    )
    if base_ticket is None:
        return _error("Ticket not found.", status=404)
    if _ticket_is_expired(base_ticket):
        return _error("This event has already ended, so group changes are closed.", status=400)

    viewer_ticket = _group_member_ticket(base_ticket, request.user)
    if viewer_ticket is None:
        return _error("You are not part of this ticket group.", status=403)

    group_queryset = _group_ticket_queryset(base_ticket)
    active_group_tickets = list(
        group_queryset.exclude(status=EventTicket.Status.CANCELLED)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .order_by("booked_at", "id")
    )
    existing_user_ids = {ticket.attendee_id for ticket in active_group_tickets}

    invitee_ids = []
    for raw_user_id in payload.get("inviteeUserIds") or []:
        try:
            invitee_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if invitee_id > 0 and invitee_id not in existing_user_ids and invitee_id not in invitee_ids:
            invitee_ids.append(invitee_id)

    invitee_statuses = _invite_status_map(payload, set(invitee_ids))
    payer_ids = set()
    for raw_user_id in payload.get("paidForUserIds") or []:
        try:
            payer_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if payer_id in invitee_ids:
            payer_ids.add(payer_id)

    remove_user_ids = []
    for raw_user_id in payload.get("removeUserIds") or []:
        try:
            remove_user_id = int(raw_user_id)
        except (TypeError, ValueError):
            continue
        if remove_user_id > 0 and remove_user_id != request.user.id and remove_user_id not in remove_user_ids:
            remove_user_ids.append(remove_user_id)

    users_to_add = list(get_user_model().objects.filter(id__in=invitee_ids).order_by("id"))
    if len(users_to_add) != len(invitee_ids):
        return _error("One or more selected users could not be found.", status=404)

    selected_tier_name, selected_ticket_price, selected_service_fee = _resolved_ticket_payload(
        payload,
        base_ticket.tier_name or "General",
        base_ticket.ticket_price,
        base_ticket.service_fee,
    )

    created_tickets = []
    removed_count = 0
    active_count = 0
    with transaction.atomic():
        for user in users_to_add:
            if base_ticket.ticket_price <= 0 and selected_ticket_price <= 0:
                invite_status = invitee_statuses.get(user.id, "confirmed")
                payment_fields = _ticket_payment_fields(
                    Decimal("0"),
                    Decimal("0"),
                    invite_status == "confirmed",
                    request.user,
                    invite_status,
                    "tentative",
                )
                ticket_price = Decimal("0")
                service_fee = Decimal("0")
            else:
                payment_fields = _ticket_payment_fields(
                    selected_ticket_price,
                    selected_service_fee,
                    user.id in payer_ids,
                    request.user,
                    "confirmed",
                    "payment",
                )
                ticket_price = selected_ticket_price
                service_fee = selected_service_fee
            status = payment_fields["status"]
            if status == EventTicket.Status.ACTIVE:
                active_count += 1
            created_tickets.append(
                EventTicket.objects.create(
                    attendee=user,
                    event=base_ticket.event,
                    booked_by=request.user,
                    paid_by=payment_fields["paid_by"],
                    group_code=base_ticket.group_code or str(base_ticket.id),
                    tier_name=selected_tier_name,
                    invite_status=payment_fields["invite_status"],
                    pending_reason=payment_fields["pending_reason"],
                    ticket_price=ticket_price,
                    service_fee=service_fee,
                    payment_transaction_id=payment_fields["payment_transaction_id"],
                    refund_transaction_id="",
                    status=status,
                    quantity=1,
                    cancelled_at=None,
                    archived_at=None,
                )
            )

        removable_tickets = list(
            group_queryset.filter(attendee_id__in=remove_user_ids, status=EventTicket.Status.PENDING)
            .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
            .prefetch_related("event__media_items")
        )
        for ticket in removable_tickets:
            ticket.status = EventTicket.Status.CANCELLED
            ticket.cancelled_at = timezone.now()
            ticket.pending_reason = "removed"
            ticket.save(update_fields=["status", "cancelled_at", "pending_reason", "updated_at"])
            removed_count += 1

        if active_count:
            Event.objects.filter(id=base_ticket.event_id).update(tickets_sold=F("tickets_sold") + active_count)

    for ticket in created_tickets:
        _send_group_ticket_invite(request.user, ticket.attendee, ticket)

    refreshed_viewer = _group_member_ticket(base_ticket, request.user) or viewer_ticket
    if refreshed_viewer and refreshed_viewer.event_id:
        refreshed_viewer.event.refresh_from_db(fields=["tickets_sold"])
    return JsonResponse({
        "message": "Group ticket updated successfully.",
        "addedCount": len(created_tickets),
        "removedCount": removed_count,
        "ticket": _serialize_ticket(refreshed_viewer),
    })


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

def view_ticket(request, ticket_id):
    ticket = (
        EventTicket.objects.filter(id=ticket_id)
        .select_related("attendee", "event", "event__host", "booked_by", "paid_by")
        .prefetch_related("event__media_items")
        .first()
    )
    if ticket is None:
        raise Http404("Ticket not found.")

    group_tickets = _group_tickets_for(ticket)
    context = {
        "ticket": ticket,
        "group_tickets": group_tickets,
        "ticket_amount": _ticket_amount(ticket),
        "ticket_is_expired": _ticket_is_expired(ticket),
        "ticket_payload": _serialize_ticket(ticket),
    }
    return render(request, "ticket_view.html", context)
