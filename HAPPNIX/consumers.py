import json
from datetime import timedelta
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

class MessageConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or not user.is_authenticated:
            await self.close(code=4401)
            return

        self.user_group_name = f"dm_user_{user.id}"
        await self.channel_layer.group_add(self.user_group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "socket.connected", "userId": user.id})
        await self.update_last_active(user)

    async def disconnect(self, close_code):
        if hasattr(self, "user_group_name"):
            await self.channel_layer.group_discard(self.user_group_name, self.channel_name)
            user = self.scope.get("user")
            if user and user.is_authenticated:
                await self.update_last_active(user)

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

    async def message_event(self, event):
        await self.send_json(event["payload"])

    async def send_json(self, payload):
        await self.send(text_data=json.dumps(payload))

    @database_sync_to_async
    def update_last_active(self, user):
        from .models import UserProfile
        UserProfile.objects.filter(user=user).update(last_active=timezone.now() - timedelta(seconds=30))