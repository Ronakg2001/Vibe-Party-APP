import json
import os
import uuid
from urllib.parse import urlparse

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.utils.text import slugify
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from . import mongo_store
from .models import DirectConversation, DirectMessage, DirectMessageAttachment, DirectMessageDeletion
from .utils import _error, _json_body

User = get_user_model()
MAX_ATTACHMENTS_PER_MESSAGE = 5
MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024


def _ordered_user_ids(left_user_id, right_user_id):
    left = int(left_user_id)
    right = int(right_user_id)
    return (left, right) if left < right else (right, left)


def _conversation_other_user(conversation, viewer):
    return conversation.user_two if conversation.user_one_id == viewer.id else conversation.user_one


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


def _attachment_type_for_upload(upload):
    content_type = str(getattr(upload, "content_type", "") or "").lower()
    if content_type.startswith("image/"):
        return DirectMessageAttachment.AttachmentType.IMAGE
    if content_type.startswith("video/"):
        return DirectMessageAttachment.AttachmentType.VIDEO
    if content_type.startswith("audio/"):
        return DirectMessageAttachment.AttachmentType.AUDIO
    return DirectMessageAttachment.AttachmentType.FILE


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


def _serialize_forwarded_from(message):
    source = getattr(message, "forwarded_from", None)
    if not source:
        return None
    source_sender = getattr(source, "sender", None)
    if source_sender is None:
        return None
    source_body = str(source.body or "").strip()
    source_attachments = list(source.attachments.all()) if hasattr(getattr(source, "attachments", None), "all") else []
    return {
        "messageId": source.id,
        "sender": _basic_message_user_payload(source_sender),
        "previewText": source_body or _message_preview_text(source),
        "hasAttachments": bool(source_attachments),
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
        if attachment.attachment_type == DirectMessageAttachment.AttachmentType.AUDIO:
            return "Voice note"
        if attachment.attachment_type == DirectMessageAttachment.AttachmentType.IMAGE:
            return "Photo"
        if attachment.attachment_type == DirectMessageAttachment.AttachmentType.VIDEO:
            return "Video"
        return attachment.original_name or "File"
    return f"{len(attachments)} attachments"


def _serialize_message(message, viewer):
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
    return {
        "id": message.id,
        "conversationId": message.conversation_id,
        "body": body,
        "senderId": message.sender_id,
        "senderUsername": message.sender.username,
        "isOwn": is_own,
        "isEdited": bool(message.edited_at),
        "isUnsent": is_unsent,
        "isForwarded": bool(message.forwarded_from_id),
        "forwardedFrom": None if is_unsent else _serialize_forwarded_from(message),
        "repliedTo": replied_to_data,
        "hasAttachments": bool(attachments),
        "attachments": attachments,
        "createdAt": message.created_at.isoformat() if message.created_at else None,
        "updatedAt": message.updated_at.isoformat() if message.updated_at else None,
        "readAt": message.read_at.isoformat() if message.read_at else None,
        "editedAt": message.edited_at.isoformat() if message.edited_at else None,
        "unsentAt": message.unsent_at.isoformat() if message.unsent_at else None,
        "canEdit": bool(is_own and not is_unsent),
        "canDelete": True,
        "canUnsend": bool(is_own and not is_unsent),
        "canForward": not is_unsent,
        "repliedTo": replied_to_data,
        "canReply": not is_unsent,
    }


def _visible_messages_qs(conversation, viewer):
    return (
        conversation.messages.exclude(deletions__user=viewer)
        .select_related("sender", "forwarded_from", "forwarded_from__sender")
        .prefetch_related("attachments", "forwarded_from__attachments")
        .order_by("created_at", "id")
    )


def _serialize_conversation(conversation, viewer):
    other_user = _conversation_other_user(conversation, viewer)
    visible_messages = _visible_messages_qs(conversation, viewer)
    last_message = visible_messages.order_by("-created_at", "-id").first()
    unread_count = visible_messages.filter(read_at__isnull=True).exclude(sender=viewer).count()
    return {
        "id": conversation.id,
        "createdAt": conversation.created_at.isoformat() if conversation.created_at else None,
        "updatedAt": conversation.updated_at.isoformat() if conversation.updated_at else None,
        "otherUser": _basic_message_user_payload(other_user),
        "lastMessage": _serialize_message(last_message, viewer) if last_message else None,
        "previewText": _message_preview_text(last_message),
        "unreadCount": unread_count,
    }


def _conversation_for_user(user, conversation_id):
    return (
        DirectConversation.objects.filter(id=conversation_id)
        .filter(Q(user_one=user) | Q(user_two=user))
        .select_related("user_one", "user_two")
        .first()
    )


def _message_for_user(user, message_id):
    return (
        DirectMessage.objects.filter(id=message_id)
        .filter(Q(conversation__user_one=user) | Q(conversation__user_two=user))
        .select_related(
            "sender",
            "conversation",
            "conversation__user_one",
            "conversation__user_two",
            "forwarded_from",
            "forwarded_from__sender",
        )
        .prefetch_related("attachments", "deletions", "forwarded_from__attachments")
        .first()
    )


def _get_or_create_conversation(request_user, other_user):
    first_id, second_id = _ordered_user_ids(request_user.id, other_user.id)
    conversation, _created = DirectConversation.objects.get_or_create(
        user_one_id=first_id,
        user_two_id=second_id,
    )
    return DirectConversation.objects.select_related("user_one", "user_two").get(id=conversation.id)


def _broadcast_to_users(user_ids, payload):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    for user_id in {int(item) for item in user_ids if item}:
        async_to_sync(channel_layer.group_send)(
            f"dm_user_{user_id}",
            {"type": "message.event", "payload": payload},
        )


def _broadcast_conversation_snapshot(conversation, user_ids, event_type):
    for user in [conversation.user_one, conversation.user_two]:
        if user.id not in user_ids:
            continue
        _broadcast_to_users(
            [user.id],
            {
                "type": event_type,
                "conversation": _serialize_conversation(conversation, user),
            },
        )


def _broadcast_message_created(conversation, message):
    for user in [conversation.user_one, conversation.user_two]:
        _broadcast_to_users(
            [user.id],
            {
                "type": "message.created",
                "conversation": _serialize_conversation(conversation, user),
                "message": _serialize_message(message, user),
            },
        )
    _broadcast_message_delivered_if_online(conversation, message)


def _broadcast_message_delivered_if_online(conversation, message):
    from .consumers import is_user_connected

    recipient = _conversation_other_user(conversation, message.sender)
    if not recipient or not is_user_connected(recipient.id):
        return

    _broadcast_to_users(
        [message.sender_id],
        {
            "type": "messages.delivered.receipt",
            "conversationId": conversation.id,
            "messageIds": [message.id],
            "deliveredAt": timezone.now().isoformat(),
        },
    )


def _broadcast_message_updated(conversation, message, user_ids):
    for user in [conversation.user_one, conversation.user_two]:
        if user.id not in user_ids:
            continue
        _broadcast_to_users(
            [user.id],
            {
                "type": "message.updated",
                "conversation": _serialize_conversation(conversation, user),
                "message": _serialize_message(message, user),
            },
        )


def _broadcast_message_deleted_for_user(conversation, viewer, message_id):
    _broadcast_to_users(
        [viewer.id],
        {
            "type": "message.deleted_for_me",
            "conversationId": conversation.id,
            "messageId": message_id,
            "conversation": _serialize_conversation(conversation, viewer),
        },
    )


def _broadcast_messages_read(conversation, reader, updated_count):
    if updated_count <= 0:
        return
    other_user = _conversation_other_user(conversation, reader)
    _broadcast_to_users(
        [other_user.id, reader.id],
        {
            "type": "conversation.read",
            "conversationId": conversation.id,
            "readerUserId": reader.id,
            "updatedCount": updated_count,
        },
    )
    _broadcast_conversation_snapshot(conversation, [other_user.id, reader.id], "conversation.updated")


def _mark_conversation_read(conversation, viewer):
    now = timezone.now()
    updated_count = conversation.messages.exclude(deletions__user=viewer).filter(read_at__isnull=True).exclude(sender=viewer).update(read_at=now)
    if updated_count:
        conversation.updated_at = timezone.now()
        conversation.save(update_fields=["updated_at"])
        conversation.refresh_from_db()
        _broadcast_messages_read(conversation, viewer, updated_count)
    return updated_count


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


def _save_message_attachments(message, uploads, attachment_meta):
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
        filename = f"message_{message.id}_{uuid.uuid4().hex}_{safe_stem}{safe_ext}"
        storage_path = f"messages/{message.sender_id}/{filename}"
        saved_path = default_storage.save(storage_path, upload)
        file_url = default_storage.url(saved_path)
        meta = attachment_meta[index] if index < len(attachment_meta) and isinstance(attachment_meta[index], dict) else {}
        created.append(
            DirectMessageAttachment(
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
        DirectMessageAttachment.objects.bulk_create(created)


def _clone_forwarded_attachments(source_message, new_message):
    copied = []
    for attachment in source_message.attachments.all():
        copied.append(
            DirectMessageAttachment(
                message=new_message,
                attachment_type=attachment.attachment_type,
                file_url=attachment.file_url,
                original_name=attachment.original_name,
                mime_type=attachment.mime_type,
                file_size=attachment.file_size,
                duration_seconds=attachment.duration_seconds,
            )
        )
    if copied:
        DirectMessageAttachment.objects.bulk_create(copied)


def _log_message_notification(sender, recipient, message):
    return


@require_GET
def conversations_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    conversations = list(
        DirectConversation.objects.filter(Q(user_one=request.user) | Q(user_two=request.user))
        .select_related("user_one", "user_two")
        .order_by("-updated_at", "-id")
        .exclude(deleted_by=request.user)
    )
    payload = [_serialize_conversation(conversation, request.user) for conversation in conversations]
    unread_total = sum(item.get("unreadCount", 0) for item in payload)
    return JsonResponse({"count": len(payload), "unreadCount": unread_total, "conversations": payload})


@csrf_exempt
@require_POST
def start_conversation_api(request):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    payload = _json_body(request)
    try:
        target_user_id = int(payload.get("targetUserId"))
    except (TypeError, ValueError):
        return _error("A valid targetUserId is required.")

    if target_user_id == request.user.id:
        return _error("You cannot create a conversation with yourself.")

    target_user = User.objects.filter(id=target_user_id).select_related("profile").first()
    if target_user is None:
        return _error("User not found.", status=404)

    conversation = _get_or_create_conversation(request.user, target_user)
    _broadcast_conversation_snapshot(conversation, [request.user.id, target_user.id], "conversation.updated")
    return JsonResponse({"conversation": _serialize_conversation(conversation, request.user)})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def conversation_messages_api(request, conversation_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    conversation = _conversation_for_user(request.user, conversation_id)
    if conversation is None:
        return _error("Conversation not found.", status=404)

    if request.method == "GET":
        messages = [
            _serialize_message(message, request.user)
            for message in _visible_messages_qs(conversation, request.user)
        ]
        updated_count = _mark_conversation_read(conversation, request.user)
        conversation.refresh_from_db()
        return JsonResponse({
            "conversation": _serialize_conversation(conversation, request.user),
            "messages": messages,
            "readCount": updated_count,
        })

    is_multipart = (request.content_type or "").startswith("multipart/form-data")
    payload = request.POST if is_multipart else _json_body(request)
    uploads = request.FILES.getlist("attachments") if is_multipart else []
    body = str(payload.get("body", "")).strip()
    attachment_meta = _parse_attachment_meta(payload.get("attachmentMeta")) if is_multipart else []
    replied_to_id = request.POST.get("repliedToId") or payload.get("repliedToId")
    replied_to_msg = None
    if replied_to_id:
        try:
            replied_to_msg = DirectMessage.objects.get(id=int(replied_to_id), conversation=conversation)
        except (ValueError, TypeError, DirectMessage.DoesNotExist):
            pass

    if not body and not uploads:
        return _error("Message body or attachment is required.")
    if len(body) > 2000:
        return _error("Message body must be 2000 characters or fewer.")
    
    if not body and not uploads:
        return _error("Message body or attachment is required.")
    if len(body) > 2000:
        return _error("Message body must be 2000 characters or fewer.")

    message = DirectMessage.objects.create(
        conversation=conversation,
        sender=request.user,
        body=body,
        replied_to=replied_to_msg
    )
    try:
        _save_message_attachments(message, uploads, attachment_meta)
    except ValueError as exc:
        message.delete()
        return _error(str(exc))

    message.refresh_from_db()
    conversation.deleted_by.clear()
    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])
    conversation.refresh_from_db()

    recipient = _conversation_other_user(conversation, request.user)
    _log_message_notification(request.user, recipient, message)
    _broadcast_message_created(conversation, message)

    return JsonResponse({
        "message": _serialize_message(message, request.user),
        "conversation": _serialize_conversation(conversation, request.user),
    })


@csrf_exempt
@require_POST
def edit_message_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    message = _message_for_user(request.user, message_id)
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
    message.refresh_from_db()
    conversation = message.conversation
    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])
    conversation.refresh_from_db()
    _broadcast_message_updated(conversation, message, [conversation.user_one_id, conversation.user_two_id])

    return JsonResponse({
        "message": _serialize_message(message, request.user),
        "conversation": _serialize_conversation(conversation, request.user),
    })


@csrf_exempt
@require_POST
def forward_message_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    source_message = _message_for_user(request.user, message_id)
    if source_message is None:
        return _error("Message not found.", status=404)
    if source_message.unsent_at:
        return _error("Unsent messages cannot be forwarded.")

    payload = _json_body(request)
    conversation = None

    target_conversation_id = payload.get("conversationId")
    if target_conversation_id is not None:
        try:
            conversation = _conversation_for_user(request.user, int(target_conversation_id))
        except (TypeError, ValueError):
            conversation = None
        if conversation is None:
            return _error("Target conversation not found.", status=404)
    else:
        try:
            target_user_id = int(payload.get("targetUserId"))
        except (TypeError, ValueError):
            return _error("A valid conversationId or targetUserId is required.")
        if target_user_id == request.user.id:
            return _error("You cannot forward a message to yourself.")
        target_user = User.objects.filter(id=target_user_id).select_related("profile").first()
        if target_user is None:
            return _error("User not found.", status=404)
        conversation = _get_or_create_conversation(request.user, target_user)

    forwarded = DirectMessage.objects.create(
        conversation=conversation,
        sender=request.user,
        body=source_message.body,
        forwarded_from=source_message,
    )
    _clone_forwarded_attachments(source_message, forwarded)
    forwarded.refresh_from_db()
    conversation.deleted_by.clear()
    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])
    conversation.refresh_from_db()

    recipient = _conversation_other_user(conversation, request.user)
    _log_message_notification(request.user, recipient, forwarded)
    _broadcast_message_created(conversation, forwarded)

    return JsonResponse({
        "message": _serialize_message(forwarded, request.user),
        "conversation": _serialize_conversation(conversation, request.user),
    })


@csrf_exempt
@require_POST
def delete_message_for_me_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    message = _message_for_user(request.user, message_id)
    if message is None:
        return _error("Message not found.", status=404)

    deletion, _created = DirectMessageDeletion.objects.get_or_create(message=message, user=request.user)
    conversation = message.conversation
    conversation.refresh_from_db()
    _broadcast_message_deleted_for_user(conversation, request.user, message.id)

    return JsonResponse({
        "message": "Message deleted for you.",
        "messageId": message.id,
        "conversation": _serialize_conversation(conversation, request.user),
        "deletedAt": deletion.deleted_at.isoformat() if deletion.deleted_at else None,
    })


@csrf_exempt
@require_POST
def unsend_message_api(request, message_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    message = _message_for_user(request.user, message_id)
    if message is None:
        return _error("Message not found.", status=404)
    if message.sender_id != request.user.id:
        return _error("Only the sender can unsend this message.", status=403)
    if message.unsent_at:
        return JsonResponse({
            "message": _serialize_message(message, request.user),
            "conversation": _serialize_conversation(message.conversation, request.user),
        })

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
    message.refresh_from_db()
    conversation = message.conversation
    conversation.updated_at = timezone.now()
    conversation.save(update_fields=["updated_at"])
    conversation.refresh_from_db()
    _broadcast_message_updated(conversation, message, [conversation.user_one_id, conversation.user_two_id])

    return JsonResponse({
        "message": _serialize_message(message, request.user),
        "conversation": _serialize_conversation(conversation, request.user),
    })


@csrf_exempt
@require_POST
def mark_conversation_read_api(request, conversation_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)

    conversation = _conversation_for_user(request.user, conversation_id)
    if conversation is None:
        return _error("Conversation not found.", status=404)

    updated_count = _mark_conversation_read(conversation, request.user)
    conversation.refresh_from_db()
    return JsonResponse({
        "message": "Conversation marked as read.",
        "conversationId": conversation.id,
        "updatedCount": updated_count,
        "conversation": _serialize_conversation(conversation, request.user),
    })

@csrf_exempt
@require_POST
def clear_conversation_api(request, conversation_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    conversation = _conversation_for_user(request.user, conversation_id)
    if conversation is None:
        return _error("Conversation not found.", status=404)
    visible_messages = _visible_messages_qs(conversation, request.user)
    deletions = [
        DirectMessageDeletion(message=msg, user=request.user)
        for msg in visible_messages
    ]
    if deletions:
        DirectMessageDeletion.objects.bulk_create(deletions, ignore_conflicts=True)
    conversation.refresh_from_db()
    _broadcast_conversation_snapshot(conversation, [request.user.id], "conversation.updated")
    return JsonResponse({
        "message": "Chat cleared successfully.",
        "conversationId": conversation.id,
        "conversation": _serialize_conversation(conversation, request.user),
    })


@csrf_exempt
@require_POST
def delete_conversation_api(request, conversation_id):
    if not request.user.is_authenticated:
        return _error("Please sign in first.", status=401)
    conversation = _conversation_for_user(request.user, conversation_id)
    if conversation is None:
        return _error("Conversation not found.", status=404)
    convo_id = conversation.id
    conversation.deleted_by.add(request.user)
    if conversation.deleted_by.count() == 2:
        conversation.delete()
    _broadcast_to_users([request.user.id], {
        "type": "conversation.deleted",
        "conversationId": convo_id
    })
    return JsonResponse({
        "message": "Conversation deleted from your account.",
        "conversationId": convo_id
    })