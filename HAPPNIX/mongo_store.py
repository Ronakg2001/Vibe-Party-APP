import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

from django.contrib.auth import get_user_model

from .models import ActivityNotification, Event, Follow, UserProfile

logger = logging.getLogger(__name__)

try:
    from pymongo import ASCENDING, GEOSPHERE, MongoClient
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - dependency may be absent in some envs
    ASCENDING = 1
    GEOSPHERE = "2dsphere"
    MongoClient = None
    PyMongoError = Exception


def _utc_now():
    return datetime.now(timezone.utc)


def _to_float(value):
    if isinstance(value, Decimal):
        return float(value)
    return value


def mongo_config():
    uri = os.environ.get("MONGO_URI", "").strip()
    db_name = os.environ.get("MONGO_DB_NAME", "party_connect_hub").strip()
    enabled = bool(uri) and MongoClient is not None
    return {
        "enabled": enabled,
        "uri": uri,
        "db_name": db_name,
    }


_mongo_client = None
_index_initialized = False


def _get_db():
    global _mongo_client, _index_initialized
    cfg = mongo_config()
    if not cfg["enabled"]:
        return None

    if _mongo_client is None:
        _mongo_client = MongoClient(cfg["uri"], serverSelectionTimeoutMS=2000)

    db = _mongo_client[cfg["db_name"]]
    if not _index_initialized:
        try:
            db.user_profiles.create_index([("sql_user_id", ASCENDING)], unique=True)
            db.user_profiles.create_index([("username", ASCENDING)])
            db.user_profiles.create_index([("email", ASCENDING)])
            db.user_profiles.create_index([("search_text", ASCENDING)])
            db.events.create_index([("sql_event_id", ASCENDING)], unique=True)
            db.events.create_index([("event_id", ASCENDING)], unique=True)
            db.events.create_index([("host_sql_user_id", ASCENDING), ("created_at", ASCENDING)])
            db.events.create_index([("status", ASCENDING), ("event_category", ASCENDING)])
            db.events.create_index([("location", GEOSPHERE)])
            db.notifications.create_index([("recipient_sql_user_id", ASCENDING), ("created_at", ASCENDING)])
            db.notifications.create_index([("recipient_sql_user_id", ASCENDING), ("is_read", ASCENDING), ("created_at", ASCENDING)])
            _index_initialized = True
        except PyMongoError:
            logger.exception("Failed to initialize MongoDB indexes.")
            return None

    return db


def is_enabled():
    return _get_db() is not None


def _build_profile_doc(user, profile):
    full_name = (user.first_name or "").strip()
    hosted_events_count = Event.objects.filter(host_id=user.id).count()
    pending_follow_requests_count = Follow.objects.filter(following=user, status=Follow.Status.PENDING).count()
    return {
        "sql_user_id": user.id,
        "username": user.username,
        "email": (user.email or "").lower(),
        "full_name": full_name,
        "mobile": profile.mobile,
        "sex": profile.sex,
        "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
        "bio": profile.bio or "",
        "profile_picture_url": profile.profile_picture_url or "",
        "gov_id_verified": bool(profile.gov_id_verified),
        "is_private": bool(profile.is_private),
        "hosted_events_count": hosted_events_count,
        "pending_follow_requests_count": pending_follow_requests_count,
        "search_text": " ".join(
            part for part in [user.username, user.email, full_name, profile.mobile] if part
        ).lower(),
        "updated_at": _utc_now(),
    }


def sync_user_profile(user_id):
    db = _get_db()
    if db is None:
        return False

    User = get_user_model()
    try:
        user = User.objects.get(id=user_id)
        profile = UserProfile.objects.get(user=user)
    except (User.DoesNotExist, UserProfile.DoesNotExist):
        db.user_profiles.delete_one({"sql_user_id": user_id})
        return True

    doc = _build_profile_doc(user, profile)
    db.user_profiles.update_one(
        {"sql_user_id": user.id},
        {"$set": doc, "$setOnInsert": {"created_at": _utc_now()}},
        upsert=True,
    )
    return True


def profile_for_user(user_id):
    db = _get_db()
    if db is None:
        return None
    return db.user_profiles.find_one({"sql_user_id": user_id}, {"_id": 0})


def search_profiles(query, limit=20):
    db = _get_db()
    if db is None:
        return []

    search = (query or "").strip().lower()
    if not search:
        return []

    limit = max(1, min(int(limit or 20), 100))
    docs = db.user_profiles.find(
        {"search_text": {"$regex": search}},
        {"_id": 0, "sql_user_id": 1, "username": 1, "full_name": 1, "profile_picture_url": 1, "is_private": 1},
    ).limit(limit)
    return list(docs)


def _resolved_ticketing(event):
    raw_ticket_type = str(getattr(event, "ticket_type", "") or "").strip()
    raw_ticket_tiers = getattr(event, "ticket_tiers", []) or []
    has_paid_tiers = isinstance(raw_ticket_tiers, list) and any(float((tier or {}).get("price") or 0) > 0 for tier in raw_ticket_tiers if isinstance(tier, dict))
    price_value = _to_float(getattr(event, "price", 0) or 0) or 0
    if raw_ticket_type == "Paid" or has_paid_tiers or float(price_value) > 0:
        return "Paid", raw_ticket_tiers if isinstance(raw_ticket_tiers, list) else []
    if raw_ticket_type == "Guestlist":
        return "Guestlist", []
    return "Free", []


def _serialize_event_doc(event):
    lat = float(event.latitude)
    lon = float(event.longitude)
    ticket_type, ticket_tiers = _resolved_ticketing(event)
    media_assets = [
        {
            "media_type": item.media_type,
            "file_url": item.file_url,
            "sort_order": item.sort_order,
        }
        for item in event.media_items.all()
    ]
    image_assets = [item["file_url"] for item in media_assets if item["media_type"] == "image"]
    cover_image = image_assets[0] if image_assets else (media_assets[0]["file_url"] if media_assets else event.image_url or "")
    return {
        "sql_event_id": event.id,
        "event_id": str(event.event_uid),
        "user_id": event.host_id,
        "host_sql_user_id": event.host_id,
        "host_username": event.host.username,
        "title": event.title,
        "description": event.description or "",
        "start_label": event.start_label or "",
        "end_label": event.end_label or "",
        "start_at": event.start_at or None,
        "end_at": event.end_at or None,
        "event_category": event.event_category or "party",
        "location_name": event.location_name,
        "location": {"type": "Point", "coordinates": [lon, lat]},
        "latitude": lat,
        "longitude": lon,
        "price": _to_float(event.price),
        "currency": event.currency or "INR",
        "ticket_type": ticket_type,
        "ticket_tiers": ticket_tiers,
        "max_attendees": int(event.max_attendees or 0),
        "tickets_sold": int(event.tickets_sold or 0),
        "status": event.status or "published",
        "image_url": cover_image,
        "media_assets": media_assets,
        "is_active": bool(event.is_active),
        "created_at": event.created_at or _utc_now(),
        "updated_at": event.updated_at or _utc_now(),
    }


def sync_event(event_id):
    db = _get_db()
    if db is None:
        return False

    try:
        event = Event.objects.select_related("host").prefetch_related("media_items").get(id=event_id)
    except Event.DoesNotExist:
        db.events.delete_one({"sql_event_id": event_id})
        return True

    doc = _serialize_event_doc(event)
    db.events.update_one(
        {"sql_event_id": event.id},
        {"$set": doc},
        upsert=True,
    )
    return True


def log_notification(recipient_user_id, activity_type, actor_user=None, title="", body="", payload=None):
    db = _get_db()

    actor_profile = profile_for_user(actor_user.id) if actor_user is not None else None
    actor_username = getattr(actor_user, "username", "") if actor_user is not None else ""
    actor_full_name = ((actor_profile or {}).get("full_name") or getattr(actor_user, "first_name", "") or actor_username).strip()
    actor_avatar = ((actor_profile or {}).get("profile_picture_url") or "") if actor_user is not None else ""
    safe_payload = payload or {}
    safe_activity_type = str(activity_type or "activity").strip().lower() or "activity"
    safe_title = str(title or "Activity").strip() or "Activity"
    safe_body = str(body or "").strip()

    if db is None:
        ActivityNotification.objects.create(
            recipient_id=int(recipient_user_id),
            actor_id=getattr(actor_user, "id", None),
            activity_type=safe_activity_type,
            title=safe_title,
            body=safe_body,
            payload={
                **safe_payload,
                "actor_username": actor_username,
                "actor_full_name": actor_full_name,
                "actor_profile_picture_url": actor_avatar,
            },
        )
        return True

    doc = {
        "recipient_sql_user_id": int(recipient_user_id),
        "activity_type": safe_activity_type,
        "title": safe_title,
        "body": safe_body,
        "actor_sql_user_id": getattr(actor_user, "id", None),
        "actor_username": actor_username,
        "actor_full_name": actor_full_name,
        "actor_profile_picture_url": actor_avatar,
        "payload": safe_payload,
        "is_read": False,
        "created_at": _utc_now(),
    }
    db.notifications.insert_one(doc)
    return True


def notifications_for_user(user_id, limit=50):
    db = _get_db()
    safe_limit = max(1, min(int(limit or 50), 100))
    if db is None:
        rows = ActivityNotification.objects.filter(recipient_id=int(user_id)).select_related("actor")[:safe_limit]
        docs = []
        for row in rows:
            payload = row.payload or {}
            docs.append({
                "recipient_sql_user_id": int(user_id),
                "activity_type": row.activity_type,
                "title": row.title,
                "body": row.body,
                "actor_sql_user_id": row.actor_id,
                "actor_username": payload.get("actor_username") or getattr(row.actor, "username", ""),
                "actor_full_name": payload.get("actor_full_name") or getattr(row.actor, "first_name", "") or getattr(row.actor, "username", ""),
                "actor_profile_picture_url": payload.get("actor_profile_picture_url", ""),
                "payload": {k: v for k, v in payload.items() if k not in {"actor_username", "actor_full_name", "actor_profile_picture_url"}},
                "is_read": bool(row.is_read),
                "created_at": row.created_at.isoformat() if row.created_at else None,
            })
        return docs

    docs = db.notifications.find(
        {"recipient_sql_user_id": int(user_id)},
        {"_id": 0},
    ).sort("created_at", -1).limit(safe_limit)
    return list(docs)


def unread_notification_count(user_id):
    db = _get_db()
    if db is None:
        return int(ActivityNotification.objects.filter(recipient_id=int(user_id), is_read=False).count())
    return int(db.notifications.count_documents({"recipient_sql_user_id": int(user_id), "is_read": False}))


def mark_notifications_read(user_id):
    db = _get_db()
    if db is None:
        ActivityNotification.objects.filter(recipient_id=int(user_id), is_read=False).update(is_read=True, read_at=_utc_now())
        return True
    db.notifications.update_many(
        {"recipient_sql_user_id": int(user_id), "is_read": False},
        {"$set": {"is_read": True, "read_at": _utc_now()}},
    )
    return True
