
import json
import os
import uuid
from urllib.parse import urlparse

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.http import JsonResponse
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from . import mongo_store
from .models import (
    GroupConversation,
    GroupConversationMember,
    GroupMessage,
    GroupMessageAttachment,
    GroupMessageDeletion,
    GroupMessageStatus,
)
from .utils import _error, _json_body

User = get_user_model()
GROUP_CONVERSATION_ID_OFFSET = 1_000_000_000
MAX_ATTACHMENTS_PER_MESSAGE = 5
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024


def synthetic_group_conversation_id(group_id):
    return GROUP_CONVERSATION_ID_OFFSET + int(group_id)


def _basic_message_user_payload(user):
    mongo_profile = mongo_store.profile_for_user(user.id) or {}
    profile = getattr(user, "profile", None)
    last_active = getattr(profile, "last_active", None)
    is_online = False
    if last_active:
        is_online = (timezone.now() - last_active).total_seconds() < 30
    return {
        "sql_user_id": user.id,
        "username": user.username,
        "full_name": (mongo_profile.get("full_name") or user.first_name or user.username).strip(),
        "profile_picture_url": mongo_profile.get("profile_picture_url") or (getattr(profile, "profile_picture_url", "") if profile else ""),
        "gov_id_verified": bool(mongo_profile.get("gov_id_verified", getattr(profile, "gov_id_verified", False))),
        "is_private": bool(mongo_profile.get("is_private", getattr(profile, "is_private", False))),
        "lastActive": last_active.isoformat() if last_active else None,
        "isOnline": is_online,
    }


def _group_pseudo_user_payload(group, member_count):
    return {
        "sql_user_id": None,
        "username": f"{member_count} members",
        "full_name": group.name,
        "profile_picture_url": group.avatar_url or "",
        "gov_id_verified": False,
        "is_private": False,
        "lastActive": None,
        "isOnline": False,
    }


def _attachment_type_for_upload(upload):
    content_type = str(getattr(upload, "content_type", "") or "").lower()
    if content_type.startswith("image/"):
        return GroupMessageAttachment.AttachmentType.IMAGE
    if content_type.startswith("video/"):
        return GroupMessageAttachment.AttachmentType.VIDEO
    if content_type.startswith("audio/"):
        return GroupMessageAttachment.AttachmentType.AUDIO
    return GroupMessageAttachment.AttachmentType.FILE


def _coerce_duration(value):
    try:
        duration = int(value)
    except (TypeError, ValueError):
        return None
    return duration if duration > 0 else None


def _parse_attachment_meta(raw_value):
    if not raw_value:
        return []
    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError):
        return []
    return parsed if isinstance(parsed, list) else []


def _serialize_attachment(attachment):
    return {
        "id": attachment.id,
        "type": attachment.attachment_type,
        "url": attachment.file_url,
        "name": attachment.original_name,
        "mimeType": attachment.mime_type,
        "size": int(attachment.file_size or 0),
        "durationSeconds": attachment.duration_seconds,
        "createdAt": attachment.created_at.isoformat() if attachment.created_at else None,
    }


def _message_preview_text(message):
    if message is None:
        return ""
    if message.unsent_at:
        return "This message was unsent."
    body = str(message.body or "").strip()
    if body:
        return body
    attachments = list(getattr(message, "attachments", []).all()) if hasattr(getattr(message, "attachments", None), "all") else []
    if not attachments:
        return "No messages yet"
    if len(attachments) == 1:
        attachment = attachments[0]
        if attachment.attachment_type == GroupMessageAttachment.AttachmentType.AUDIO:
            return "Voice note"
        if attachment.attachment_type == GroupMessageAttachment.AttachmentType.IMAGE:
            return "Photo"
        if attachment.attachment_type == GroupMessageAttachment.AttachmentType.VIDEO:
            return "Video"
        return attachment.original_name or "File"
    return f"{len(attachments)} attachments"


def _active_group_memberships(group):
    return group.memberships.filter(removed_at__isnull=True).select_related("user", "user__profile").order_by("role", "joined_at", "id")


def _group_member_record(group, user):
    return group.memberships.filter(user=user, removed_at__isnull=True).select_related("user", "user__profile").first()


def _serialize_group_member(member, viewer=None):
    payload = _basic_message_user_payload(member.user)
    payload.update({
        "role": member.role,
        "isAdmin": member.role == GroupConversationMember.Role.ADMIN,
        "isSelf": bool(viewer and member.user_id == viewer.id),
        "joinedAt": member.joined_at.isoformat() if member.joined_at else None,
    })
    return payload


def _serialize_group_status_user(status):
    payload = _basic_message_user_payload(status.recipient)
    payload.update({
        "deliveredAt": status.delivered_at.isoformat() if status.delivered_at else None,
        "readAt": status.read_at.isoformat() if status.read_at else None,
    })
    return payload


def _message_status_rows(message):
    return list(message.statuses.all()) if hasattr(getattr(message, "statuses", None), "all") else list(GroupMessageStatus.objects.filter(message=message).select_related("recipient", "recipient__profile"))


def _create_group_message_statuses(group, message):
    from .consumers import is_user_connected

    now = timezone.now()
    rows = []
    for membership in _active_group_memberships(group):
        if membership.user_id == message.sender_id:
            continue
        delivered_at = now if is_user_connected(membership.user_id) else None
        rows.append(
            GroupMessageStatus(
                message=message,
                recipient=membership.user,
                delivered_at=delivered_at,
            )
        )
    if rows:
        GroupMessageStatus.objects.bulk_create(rows)


def _mark_group_message_statuses_delivered_for_user(user_id):
    now = timezone.now()
    statuses = list(
        GroupMessageStatus.objects.filter(recipient_id=user_id, delivered_at__isnull=True)
        .select_related("message", "message__group", "message__sender")
        .prefetch_related("message__attachments", "message__group__memberships__user__profile", "message__statuses__recipient__profile")
    )
    if not statuses:
        return 0
    GroupMessageStatus.objects.filter(id__in=[status.id for status in statuses]).update(delivered_at=now)
    changed_messages = {}
    for status in statuses:
        status.delivered_at = now
        _broadcast_group_message_receipt_event("group.messages.delivered.receipt", status.message, user_id, now)
        changed_messages[status.message_id] = status.message
    for message in changed_messages.values():
        _broadcast_group_message_updated(message.group, message)
    return len(changed_messages)


def _broadcast_group_message_receipt_event(event_type, message, recipient_user_id, timestamp):
    _broadcast_to_users([message.sender_id], {
        "type": event_type,
        "conversationId": synthetic_group_conversation_id(message.group_id),
        "conversationKind": "group",
        "groupId": message.group_id,
        "messageIds": [message.id],
        "recipientUserId": int(recipient_user_id),
        "at": timestamp.isoformat(),
    })


def _mark_group_message_statuses_read_for_user(group, viewer):
    now = timezone.now()
    statuses = list(
        GroupMessageStatus.objects.filter(
            message__group=group,
            recipient=viewer,
            read_at__isnull=True,
            message__unsent_at__isnull=True,
        )
        .select_related("message", "message__group", "message__sender")
        .prefetch_related("message__attachments", "message__group__memberships__user__profile", "message__statuses__recipient__profile")
    )
    changed = []
    for status in statuses:
        if status.delivered_at is None:
            status.delivered_at = now
        status.read_at = now
        changed.append(status)
    if changed:
        GroupMessageStatus.objects.bulk_update(changed, ["delivered_at", "read_at"])
    changed_messages = {}
    for status in changed:
        changed_messages[status.message_id] = status.message
        _broadcast_group_message_receipt_event("group.messages.read.receipt", status.message, viewer.id, now)
    for message in changed_messages.values():
        _broadcast_group_message_updated(message.group, message)
    return len(changed_messages)


def _serialize_group_message(message, viewer):
    is_own = message.sender_id == viewer.id
    is_unsent = bool(message.unsent_at)
    attachments = [] if is_unsent else [_serialize_attachment(item) for item in message.attachments.all()]
    body = "This message was unsent." if is_unsent else str(message.body or "")
    replied_to_data = None
    if not is_unsent and getattr(message, "replied_to", None):
        replied_to_data = {
            "id": message.replied_to.id,
            "body": str(message.replied_to.body or ""),
            "senderUsername": message.replied_to.sender.username,
        }
    sender_payload = _basic_message_user_payload(message.sender)
    status_rows = _message_status_rows(message)
    delivered_to = [_serialize_group_status_user(status) for status in status_rows if status.delivered_at]
    read_by = [_serialize_group_status_user(status) for status in status_rows if status.read_at]
    return {
        "id": message.id,
        "conversationId": synthetic_group_conversation_id(message.group_id),
        "conversationKind": "group",
        "groupId": message.group_id,
        "body": body,
        "senderId": message.sender_id,
        "senderUsername": message.sender.username,
        "senderFullName": sender_payload.get("full_name") or message.sender.username,
        "senderProfilePictureUrl": sender_payload.get("profile_picture_url") or "",
        "isOwn": is_own,
        "isEdited": bool(message.edited_at),
        "isUnsent": is_unsent,
        "isForwarded": False,
        "forwardedFrom": None,
        "repliedTo": replied_to_data,
        "hasAttachments": bool(attachments),
        "attachments": attachments,
        "createdAt": message.created_at.isoformat() if message.created_at else None,
        "updatedAt": message.updated_at.isoformat() if message.updated_at else None,
        "readAt": None,
        "deliveredCount": len(delivered_to),
        "readCount": len(read_by),
        "deliveredTo": delivered_to,
        "readBy": read_by,
        "editedAt": message.edited_at.isoformat() if message.edited_at else None,
        "unsentAt": message.unsent_at.isoformat() if message.unsent_at else None,
        "canEdit": bool(is_own and not is_unsent),
        "canDelete": True,
        "canUnsend": bool(is_own and not is_unsent),
        "canForward": False,
        "canReply": not is_unsent,
    }

def _visible_group_messages_qs(group, viewer):
    return (
        group.messages.exclude(deletions__user=viewer)
        .select_related("sender", "replied_to", "replied_to__sender")
        .prefetch_related("attachments", "statuses__recipient__profile")
        .order_by("created_at", "id")
    )


def _serialize_group_conversation(group, viewer):
    membership = _group_member_record(group, viewer)
    if membership is None:
        return None
    visible_messages = _visible_group_messages_qs(group, viewer)
    last_message = visible_messages.order_by("-created_at", "-id").first()
    baseline = membership.last_read_at or membership.joined_at
    unread_qs = visible_messages.exclude(sender=viewer)
    if baseline:
        unread_qs = unread_qs.filter(created_at__gt=baseline)
    unread_count = unread_qs.count()
    members = list(_active_group_memberships(group))
    member_payloads = [_serialize_group_member(member, viewer) for member in members]
    admin_user_ids = [member.user_id for member in members if member.role == GroupConversationMember.Role.ADMIN]
    admin_count = len(admin_user_ids)
    member_count = len(member_payloads)
    return {
        "id": synthetic_group_conversation_id(group.id),
        "kind": "group",
        "groupId": group.id,
        "title": group.name,
        "description": group.description,
        "avatarUrl": group.avatar_url,
        "createdByUserId": group.created_by_id,
        "createdAt": group.created_at.isoformat() if group.created_at else None,
        "updatedAt": group.updated_at.isoformat() if group.updated_at else None,
        "otherUser": _group_pseudo_user_payload(group, member_count),
        "lastMessage": _serialize_group_message(last_message, viewer) if last_message else None,
        "previewText": _message_preview_text(last_message),
        "unreadCount": unread_count,
        "memberCount": member_count,
        "adminCount": admin_count,
        "members": member_payloads,
        "adminUserIds": admin_user_ids,
        "permissions": {
            "canManageMembers": membership.role == GroupConversationMember.Role.ADMIN,
            "canPromoteAdmins": membership.role == GroupConversationMember.Role.ADMIN,
            "canRenameGroup": membership.role == GroupConversationMember.Role.ADMIN,
            "canDeleteGroup": group.created_by_id == viewer.id,
            "canLeaveGroup": True,
        },
    }


def list_group_conversations_payload(user):
    groups = list(
        GroupConversation.objects.filter(memberships__user=user, memberships__removed_at__isnull=True)
        .select_related("created_by")
        .prefetch_related("memberships__user__profile")
        .distinct()
        .order_by("-updated_at", "-id")
    )
    return [_serialize_group_conversation(group, user) for group in groups]


def _group_for_user(user, group_id):
    return (
        GroupConversation.objects.filter(id=group_id, memberships__user=user, memberships__removed_at__isnull=True)
        .select_related("created_by")
        .prefetch_related("memberships__user__profile")
        .distinct()
        .first()
    )


def _broadcast_to_users(user_ids, payload):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    for user_id in {int(item) for item in user_ids if item}:
        async_to_sync(channel_layer.group_send)(
            f"dm_user_{user_id}",
            {"type": "message.event", "payload": payload},
        )


def _group_member_user_ids(group):
    return list(group.memberships.filter(removed_at__isnull=True).values_list("user_id", flat=True))


def _broadcast_group_snapshot(group, user_ids=None, event_type="conversation.updated"):
    target_user_ids = set(int(item) for item in (user_ids or _group_member_user_ids(group)))
    for user_id in target_user_ids:
        user = User.objects.filter(id=user_id).select_related("profile").first()
        if not user:
            continue
        conversation = _serialize_group_conversation(group, user)
        if conversation is None:
            continue
        _broadcast_to_users([user.id], {"type": event_type, "conversation": conversation})


def _broadcast_group_deleted(user_ids, conversation_id):
    _broadcast_to_users(user_ids, {"type": "conversation.deleted", "conversationId": conversation_id})


def _broadcast_group_message_created(group, message):
    for membership in _active_group_memberships(group):
        user = membership.user
        _broadcast_to_users([user.id], {
            "type": "message.created",
            "conversation": _serialize_group_conversation(group, user),
            "message": _serialize_group_message(message, user),
        })


def _broadcast_group_message_updated(group, message):
    for membership in _active_group_memberships(group):
        user = membership.user
        _broadcast_to_users([user.id], {
            "type": "message.updated",
            "conversation": _serialize_group_conversation(group, user),
            "message": _serialize_group_message(message, user),
        })


def _broadcast_group_message_deleted_for_user(group, viewer, message_id):
    _broadcast_to_users([viewer.id], {
        "type": "message.deleted_for_me",
        "conversationId": synthetic_group_conversation_id(group.id),
        "messageId": message_id,
        "conversation": _serialize_group_conversation(group, viewer),
    })


def _mark_group_read(group, viewer):
    membership = _group_member_record(group, viewer)
    if membership is None:
        return 0
    now = timezone.now()
    unread_qs = _visible_group_messages_qs(group, viewer).exclude(sender=viewer).filter(unsent_at__isnull=True)
    baseline = membership.last_read_at or membership.joined_at
    if baseline:
        unread_qs = unread_qs.filter(created_at__gt=baseline)
    updated_count = unread_qs.count()
    _mark_group_message_statuses_read_for_user(group, viewer)
    membership.last_read_at = now
    membership.save(update_fields=["last_read_at"])
    _broadcast_group_snapshot(group, [viewer.id], "conversation.updated")
    return updated_count


def mark_group_read_for_socket(user_id, group_id):
    user = User.objects.filter(id=user_id).first()
    if user is None:
        return 0
    group = _group_for_user(user, group_id)
    if group is None:
        return 0
    return _mark_group_read(group, user)


def mark_group_delivered_for_socket(user_id):
    return _mark_group_message_statuses_delivered_for_user(user_id)

def _save_group_message_attachments(message, uploads, attachment_meta):
    files = list(uploads or [])
    if len(files) > MAX_ATTACHMENTS_PER_MESSAGE:
        raise ValueError(f"Only {MAX_ATTACHMENTS_PER_MESSAGE} attachments are allowed per message.")
    created = []
    for index, upload in enumerate(files):
        content_type = str(getattr(upload, "content_type", "") or "application/octet-stream").lower()
        file_size = int(getattr(upload, "size", 0) or 0)
        if file_size > MAX_ATTACHMENT_SIZE_BYTES:
            raise ValueError("Each attachment must be 25 MB or smaller.")
        attachment_type = _attachment_type_for_upload(upload)
        raw_name = os.path.basename(upload.name or f"attachment-{index + 1}")
        stem, ext = os.path.splitext(raw_name)
        safe_stem = slugify(stem) or f"attachment-{index + 1}"
        safe_ext = ext[:12] if ext else ""
        filename = f"group_message_{message.id}_{uuid.uuid4().hex}_{safe_stem}{safe_ext}"
        storage_path = f"group_messages/{message.sender_id}/{filename}"
        saved_path = default_storage.save(storage_path, upload)
        file_url = default_storage.url(saved_path)
        meta = attachment_meta[index] if index < len(attachment_meta) and isinstance(attachment_meta[index], dict) else {}
        created.append(
            GroupMessageAttachment(
                message=message,
                attachment_type=attachment_type,
                file_url=file_url,
                original_name=raw_name[:255],
                mime_type=content_type[:120],
                file_size=file_size,
                duration_seconds=_coerce_duration(meta.get("durationSeconds")),
            )
        )
    if created:
        GroupMessageAttachment.objects.bulk_create(created)


def _delete_storage_url(file_url):
    if not file_url:
        return
    try:
        parsed = urlparse(file_url)
        media_path = parsed.path or ""
        if media_path.startswith(settings.MEDIA_URL):
            rel_path = media_path[len(settings.MEDIA_URL):].lstrip("/")
            if rel_path:
                default_storage.delete(rel_path)
    except Exception:
        pass


def _ensure_admin_after_membership_change(group):
    active_members = list(group.memberships.filter(removed_at__isnull=True).order_by("joined_at", "id"))
    if not active_members:
        return
    if any(member.role == GroupConversationMember.Role.ADMIN for member in active_members):
        return
    first_member = active_members[0]
    first_member.role = GroupConversationMember.Role.ADMIN
    first_member.save(update_fields=["role"])


def _can_manage_group(group, user):
    membership = _group_member_record(group, user)
    return bool(membership and membership.role == GroupConversationMember.Role.ADMIN)


@csrf_exempt
@require_POST
def create_group_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    payload = _json_body(request)
    name = str(payload.get("name", "")).strip()
    description = str(payload.get("description", "")).strip()
    member_ids = payload.get("memberUserIds") or []
    if not name:
        return _error("Group name is required.")
    try:
        normalized_ids = sorted({int(user_id) for user_id in member_ids if int(user_id) != request.user.id})
    except (TypeError, ValueError):
        return _error("memberUserIds must contain valid user ids.")
    if not normalized_ids:
        return _error("Add at least one other member to create a group.")
    users = list(User.objects.filter(id__in=normalized_ids).select_related("profile"))
    if len(users) != len(normalized_ids):
        return _error("One or more selected users were not found.", status=404)
    group = GroupConversation.objects.create(created_by=request.user, name=name[:120], description=description[:1000])
    GroupConversationMember.objects.create(group=group, user=request.user, role=GroupConversationMember.Role.ADMIN, added_by=request.user, last_read_at=timezone.now())
    for user in users:
        GroupConversationMember.objects.create(group=group, user=user, role=GroupConversationMember.Role.MEMBER, added_by=request.user)
    group.refresh_from_db()
    _broadcast_group_snapshot(group)
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})


@require_GET
def group_details_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def group_messages_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if request.method == "GET":
        messages = [_serialize_group_message(message, request.user) for message in _visible_group_messages_qs(group, request.user)]
        updated_count = _mark_group_read(group, request.user)
        group.refresh_from_db()
        return JsonResponse({"conversation": _serialize_group_conversation(group, request.user), "messages": messages, "readCount": updated_count})
    is_multipart = (request.content_type or "").startswith("multipart/form-data")
    payload = request.POST if is_multipart else _json_body(request)
    uploads = request.FILES.getlist("attachments") if is_multipart else []
    body = str(payload.get("body", "")).strip()
    attachment_meta = _parse_attachment_meta(payload.get("attachmentMeta")) if is_multipart else []
    replied_to_id = request.POST.get("repliedToId") or payload.get("repliedToId")
    replied_to_msg = None
    if replied_to_id:
        try:
            replied_to_msg = GroupMessage.objects.get(id=int(replied_to_id), group=group)
        except (TypeError, ValueError, GroupMessage.DoesNotExist):
            replied_to_msg = None
    if not body and not uploads:
        return _error("Message body or attachment is required.")
    if len(body) > 2000:
        return _error("Message body must be 2000 characters or fewer.")
    message = GroupMessage.objects.create(group=group, sender=request.user, body=body, replied_to=replied_to_msg)
    try:
        _save_group_message_attachments(message, uploads, attachment_meta)
    except ValueError as exc:
        message.delete()
        return _error(str(exc))
    message.refresh_from_db()
    _create_group_message_statuses(group, message)
    message.refresh_from_db()
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_message_created(group, message)
    return JsonResponse({"message": _serialize_group_message(message, request.user), "conversation": _serialize_group_conversation(group, request.user)})

@csrf_exempt
@require_POST
def add_group_members_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if not _can_manage_group(group, request.user):
        return _error("Only admins can add members.", status=403)
    payload = _json_body(request)
    member_ids = payload.get("memberUserIds") or []
    try:
        normalized_ids = sorted({int(user_id) for user_id in member_ids if int(user_id) != request.user.id})
    except (TypeError, ValueError):
        return _error("memberUserIds must contain valid user ids.")
    if not normalized_ids:
        return _error("Select at least one user to add.")
    users = list(User.objects.filter(id__in=normalized_ids).select_related("profile"))
    if len(users) != len(normalized_ids):
        return _error("One or more selected users were not found.", status=404)
    now = timezone.now()
    added_user_ids = []
    for user in users:
        membership, created = GroupConversationMember.objects.get_or_create(group=group, user=user, defaults={"role": GroupConversationMember.Role.MEMBER, "added_by": request.user})
        if created:
            added_user_ids.append(user.id)
            continue
        if membership.removed_at is not None:
            membership.removed_at = None
            membership.role = GroupConversationMember.Role.MEMBER
            membership.added_by = request.user
            membership.joined_at = now
            membership.last_read_at = None
            membership.save(update_fields=["removed_at", "role", "added_by", "joined_at", "last_read_at"])
            added_user_ids.append(user.id)
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_snapshot(group)
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user), "addedUserIds": added_user_ids})


@csrf_exempt
@require_POST
def update_group_member_role_api(request, group_id, member_user_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if not _can_manage_group(group, request.user):
        return _error("Only admins can manage roles.", status=403)
    membership = group.memberships.filter(user_id=member_user_id, removed_at__isnull=True).first()
    if membership is None:
        return _error("Group member not found.", status=404)
    payload = _json_body(request)
    next_role = str(payload.get("role", "")).strip().lower()
    if next_role not in {GroupConversationMember.Role.ADMIN, GroupConversationMember.Role.MEMBER}:
        return _error("A valid role is required.")
    if membership.role == next_role:
        return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})
    if membership.role == GroupConversationMember.Role.ADMIN and next_role == GroupConversationMember.Role.MEMBER:
        active_admins = group.memberships.filter(removed_at__isnull=True, role=GroupConversationMember.Role.ADMIN).count()
        if active_admins <= 1:
            return _error("A group must always have at least one admin.")
    membership.role = next_role
    membership.save(update_fields=["role"])
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_snapshot(group)
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_POST
def remove_group_member_api(request, group_id, member_user_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if not _can_manage_group(group, request.user):
        return _error("Only admins can remove members.", status=403)
    membership = group.memberships.filter(user_id=member_user_id, removed_at__isnull=True).select_related("user").first()
    if membership is None:
        return _error("Group member not found.", status=404)
    if membership.user_id == request.user.id:
        return _error("Use leave group to remove yourself.")
    membership.removed_at = timezone.now()
    membership.save(update_fields=["removed_at"])
    _ensure_admin_after_membership_change(group)
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_snapshot(group)
    _broadcast_group_deleted([member_user_id], synthetic_group_conversation_id(group.id))
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_POST
def rename_group_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if not _can_manage_group(group, request.user):
        return _error("Only admins can update group details.", status=403)
    payload = _json_body(request)
    name = str(payload.get("name", group.name)).strip()
    description = str(payload.get("description", group.description)).strip()
    avatar_url = str(payload.get("avatarUrl", group.avatar_url)).strip()
    if not name:
        return _error("Group name is required.")
    group.name = name[:120]
    group.description = description[:1000]
    group.avatar_url = avatar_url[:500]
    group.save(update_fields=["name", "description", "avatar_url", "updated_at"])
    group.refresh_from_db()
    _broadcast_group_snapshot(group)
    return JsonResponse({"conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_POST
def leave_group_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    membership = _group_member_record(group, request.user)
    if membership is None:
        return _error("You are no longer a member of this group.", status=404)
    membership.removed_at = timezone.now()
    membership.save(update_fields=["removed_at"])
    active_count = group.memberships.filter(removed_at__isnull=True).count()
    conversation_id = synthetic_group_conversation_id(group.id)
    if active_count == 0:
        group.delete()
    else:
        _ensure_admin_after_membership_change(group)
        group.updated_at = timezone.now()
        group.save(update_fields=["updated_at"])
        group.refresh_from_db()
        _broadcast_group_snapshot(group)
    _broadcast_group_deleted([request.user.id], conversation_id)
    return JsonResponse({"conversationId": conversation_id, "message": "You left the group."})


@csrf_exempt
@require_POST
def clear_group_conversation_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    visible_messages = _visible_group_messages_qs(group, request.user)
    deletions = [GroupMessageDeletion(message=msg, user=request.user) for msg in visible_messages]
    if deletions:
        GroupMessageDeletion.objects.bulk_create(deletions, ignore_conflicts=True)
    group.refresh_from_db()
    _broadcast_group_snapshot(group, [request.user.id], "conversation.updated")
    return JsonResponse({"message": "Group chat cleared successfully.", "conversationId": synthetic_group_conversation_id(group.id), "conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_POST
def delete_group_api(request, group_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    group = _group_for_user(request.user, group_id)
    if group is None:
        return _error("Group not found.", status=404)
    if group.created_by_id != request.user.id:
        return _error("Only the group creator can delete the group.", status=403)
    member_ids = _group_member_user_ids(group)
    conversation_id = synthetic_group_conversation_id(group.id)
    group.delete()
    _broadcast_group_deleted(member_ids, conversation_id)
    return JsonResponse({"message": "Group deleted.", "conversationId": conversation_id})

@csrf_exempt
@require_POST
def edit_group_message_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    message = (
        GroupMessage.objects.filter(id=message_id, group__memberships__user=request.user, group__memberships__removed_at__isnull=True)
        .select_related("group", "sender")
        .prefetch_related("attachments", "group__memberships__user__profile")
        .first()
    )
    if message is None:
        return _error("Message not found.", status=404)
    if message.sender_id != request.user.id:
        return _error("Only the sender can edit this message.", status=403)
    if message.unsent_at:
        return _error("Unsent messages cannot be edited.")
    payload = _json_body(request)
    body = str(payload.get("body", "")).strip()
    if not body and not message.attachments.exists():
        return _error("Edited message cannot be empty unless it has attachments.")
    if len(body) > 2000:
        return _error("Message body must be 2000 characters or fewer.")
    message.body = body
    message.edited_at = timezone.now()
    message.save(update_fields=["body", "edited_at", "updated_at"])
    group = message.group
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_message_updated(group, message)
    return JsonResponse({"message": _serialize_group_message(message, request.user), "conversation": _serialize_group_conversation(group, request.user)})


@csrf_exempt
@require_POST
def delete_group_message_for_me_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    message = (
        GroupMessage.objects.filter(id=message_id, group__memberships__user=request.user, group__memberships__removed_at__isnull=True)
        .select_related("group", "sender")
        .prefetch_related("group__memberships__user__profile")
        .first()
    )
    if message is None:
        return _error("Message not found.", status=404)
    deletion, _created = GroupMessageDeletion.objects.get_or_create(message=message, user=request.user)
    group = message.group
    _broadcast_group_message_deleted_for_user(group, request.user, message.id)
    return JsonResponse({"message": "Message deleted for you.", "messageId": message.id, "conversation": _serialize_group_conversation(group, request.user), "deletedAt": deletion.deleted_at.isoformat() if deletion.deleted_at else None})


@csrf_exempt
@require_POST
def unsend_group_message_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    message = (
        GroupMessage.objects.filter(id=message_id, group__memberships__user=request.user, group__memberships__removed_at__isnull=True)
        .select_related("group", "sender")
        .prefetch_related("attachments", "group__memberships__user__profile")
        .first()
    )
    if message is None:
        return _error("Message not found.", status=404)
    if message.sender_id != request.user.id:
        return _error("Only the sender can unsend this message.", status=403)
    if message.unsent_at:
        return JsonResponse({"message": _serialize_group_message(message, request.user), "conversation": _serialize_group_conversation(message.group, request.user)})
    for attachment in message.attachments.all():
        _delete_storage_url(attachment.file_url)
        attachment.file_url = ""
        attachment.original_name = ""
        attachment.file_size = 0
        attachment.save(update_fields=["file_url", "original_name", "file_size"])
    message.body = ""
    message.edited_at = None
    message.unsent_at = timezone.now()
    message.save(update_fields=["body", "edited_at", "unsent_at", "updated_at"])
    group = message.group
    group.updated_at = timezone.now()
    group.save(update_fields=["updated_at"])
    group.refresh_from_db()
    _broadcast_group_message_updated(group, message)
    return JsonResponse({"message": _serialize_group_message(message, request.user), "conversation": _serialize_group_conversation(group, request.user)})
