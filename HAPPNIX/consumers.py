import json

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer
from django.db.models import Q
from django.utils import timezone

ACTIVE_MESSAGE_CONNECTIONS = {}


def register_message_connection(user_id):
    safe_user_id = int(user_id)
    ACTIVE_MESSAGE_CONNECTIONS[safe_user_id] = ACTIVE_MESSAGE_CONNECTIONS.get(safe_user_id, 0) + 1


def unregister_message_connection(user_id):
    safe_user_id = int(user_id)
    next_count = ACTIVE_MESSAGE_CONNECTIONS.get(safe_user_id, 0) - 1
    if next_count > 0:
        ACTIVE_MESSAGE_CONNECTIONS[safe_user_id] = next_count
    else:
        ACTIVE_MESSAGE_CONNECTIONS.pop(safe_user_id, None)


def is_user_connected(user_id):
    return ACTIVE_MESSAGE_CONNECTIONS.get(int(user_id), 0) > 0


class MessageConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user_group_name = f"dm_user_{user.id}"
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        register_message_connection(user.id)
        await self.accept()
        await self.send_json({"type": "socket.connected", "userId": user.id})
        await self.update_last_active(user)
        await self.broadcast_presence_change(user.id, True)
        await self.send_pending_delivery_receipts(user.id)

    async def disconnect(self, close_code):
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)
            user = self.scope.get("user")
            if user and user.is_authenticated:
                unregister_message_connection(user.id)
                await self.update_last_active(user)
                await self.broadcast_presence_change(user.id, False)

    async def receive(self, text_data=None, bytes_data=None):
        if text_data:
            try:
                payload = json.loads(text_data)
            except json.JSONDecodeError:
                payload = {}
            if payload.get("type") == "ping":
                user = self.scope.get("user")
                if user and user.is_authenticated:
                    await self.update_last_active(user)
                await self.send_json({"type": "pong"})
            elif payload.get("type") == "typing":
                user = self.scope.get("user")
                target_user_id = payload.get("targetUserId")
                conversation_id = payload.get("conversationId")
                is_typing = payload.get("isTyping", False)
                if user and user.is_authenticated and target_user_id and conversation_id:
                    await self.channel_layer.group_send(
                        f"dm_user_{target_user_id}",
                        {
                            "type": "message.event",
                            "payload": {
                                "type": "user.typing",
                                "conversationId": conversation_id,
                                "userId": user.id,
                                "isTyping": is_typing
                            }
                        }
                    )
            elif payload.get("type") == "messages.read":
                user = self.scope.get("user")
                conversation_id = payload.get("conversationId")
                target_user_id = payload.get("targetUserId")

                if user and user.is_authenticated and conversation_id and target_user_id:
                    # 1. Update the database instantly
                    await self.mark_messages_read(user.id, conversation_id)
                    
                    # 2. Notify the sender so their screen updates to "Read"
                    await self.channel_layer.group_send(
                        f"dm_user_{target_user_id}",
                        {
                            "type": "message.event",
                            "payload": {
                                "type": "messages.read.receipt",
                                "conversationId": conversation_id,
                                "readAt": timezone.now().isoformat()
                            }
                        }
                    )

    async def message_event(self, event):
        await self.send_json(event["payload"])

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))

    @database_sync_to_async
    def update_last_active(self, user):
        from .models import UserProfile

        UserProfile.objects.filter(user=user).update(last_active=timezone.now())

    @database_sync_to_async
    def presence_targets(self, user_id):
        from .models import DirectConversation

        rows = DirectConversation.objects.filter(
            Q(user_one_id=user_id) | Q(user_two_id=user_id)
        ).values_list("user_one_id", "user_two_id")
        targets = set()
        for user_one_id, user_two_id in rows:
            if int(user_one_id) == int(user_id):
                targets.add(int(user_two_id))
            else:
                targets.add(int(user_one_id))
        return list(targets)

    async def broadcast_presence_change(self, user_id, is_online):
        target_user_ids = await self.presence_targets(user_id)
        if not target_user_ids:
            return
        payload = {
            "type": "presence.updated",
            "userId": int(user_id),
            "isOnline": bool(is_online),
            "lastActive": timezone.now().isoformat(),
        }
        for target_user_id in target_user_ids:
            await self.channel_layer.group_send(
                f"dm_user_{target_user_id}",
                {
                    "type": "message.event",
                    "payload": payload,
                },
            )

    @database_sync_to_async
    def mark_messages_read(self, user_id, conversation_id):
        from .models import DirectMessage
        from django.utils import timezone
        # Update all messages in this chat sent by the OTHER user that are currently unread
        DirectMessage.objects.filter(
            conversation_id=conversation_id,
            read_at__isnull=True
        ).exclude(sender_id=user_id).update(read_at=timezone.now())

    @database_sync_to_async
    def pending_delivery_receipts(self, user_id):
        from collections import defaultdict
        from .models import DirectMessage

        rows = (
            DirectMessage.objects.filter(read_at__isnull=True)
            .exclude(sender_id=user_id)
            .filter(
                Q(conversation__user_one_id=user_id)
                | Q(conversation__user_two_id=user_id)
            )
            .values_list("sender_id", "conversation_id", "id")
        )
        grouped = defaultdict(lambda: defaultdict(list))
        for sender_id, conversation_id, message_id in rows:
            grouped[int(sender_id)][int(conversation_id)].append(int(message_id))
        payloads = []
        for sender_id, conversations in grouped.items():
            for conversation_id, message_ids in conversations.items():
                payloads.append({
                    "sender_id": sender_id,
                    "conversationId": conversation_id,
                    "messageIds": message_ids,
                })
        return payloads

    async def send_pending_delivery_receipts(self, user_id):
        receipts = await self.pending_delivery_receipts(user_id)
        for receipt in receipts:
            await self.channel_layer.group_send(
                f"dm_user_{receipt['sender_id']}",
                {
                    "type": "message.event",
                    "payload": {
                        "type": "messages.delivered.receipt",
                        "conversationId": receipt["conversationId"],
                        "messageIds": receipt["messageIds"],
                        "deliveredAt": timezone.now().isoformat(),
                    },
                },
            )
