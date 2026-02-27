import logging
import os
from datetime import datetime, timezone
from decimal import Decimal

from django.contrib.auth import get_user_model

from .models import Event, UserProfile

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
            db.events.create_index([("host_sql_user_id", ASCENDING), ("created_at", ASCENDING)])
            db.events.create_index([("location", GEOSPHERE)])
            _index_initialized = True
        except PyMongoError:
            logger.exception("Failed to initialize MongoDB indexes.")
            return None

    return db


def is_enabled():
    return _get_db() is not None


def _build_profile_doc(user, profile):
    full_name = (user.first_name or "").strip()
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
        {"_id": 0, "sql_user_id": 1, "username": 1, "full_name": 1, "profile_picture_url": 1},
    ).limit(limit)
    return list(docs)


def _serialize_event_doc(event):
    lat = float(event.latitude)
    lon = float(event.longitude)
    return {
        "sql_event_id": event.id,
        "host_sql_user_id": event.host_id,
        "host_username": event.host.username,
        "title": event.title,
        "description": event.description or "",
        "start_label": event.start_label or "",
        "location_name": event.location_name,
        "location": {"type": "Point", "coordinates": [lon, lat]},
        "latitude": lat,
        "longitude": lon,
        "price": _to_float(event.price),
        "image_url": event.image_url or "",
        "is_active": bool(event.is_active),
        "created_at": event.created_at or _utc_now(),
        "updated_at": _utc_now(),
    }


def sync_event(event_id):
    db = _get_db()
    if db is None:
        return False

    try:
        event = Event.objects.select_related("host").get(id=event_id)
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
