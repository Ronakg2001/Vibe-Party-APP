from django.db import models
from django.contrib.auth import get_user_model
from django.db.models import F, Q
import uuid

User = get_user_model()


class UserProfile(models.Model):
    SEX_CHOICES = [
        ("mr.", "Mr."),
        ("miss.", "Miss."),
        ("mrs.", "Mrs."),
        ("other", "Other"),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    sex = models.CharField(max_length=10, choices=SEX_CHOICES)
    date_of_birth = models.DateField()
    mobile = models.CharField(max_length=10, unique=True)
    bio = models.TextField(blank=True)
    profile_picture_url = models.URLField(blank=True)
    gov_id_number = models.CharField(max_length=64, blank=True)
    gov_id_verified = models.BooleanField(default=False)
    is_private = models.BooleanField(default=False)
    last_active = models.DateTimeField(null=True, blank=True)
    def __str__(self):
        return f"{self.user.username} profile"


class Follow(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"

    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name="following_links")
    following = models.ForeignKey(User, on_delete=models.CASCADE, related_name="follower_links")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACCEPTED)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="unique_follow_link"),
            models.CheckConstraint(
                condition=~Q(follower=F("following")),
                name="prevent_self_follow",
            ),
        ]

    def __str__(self):
        return f"{self.follower.username} -> {self.following.username} ({self.status})"


class Event(models.Model):
    class EventStatus(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        CANCELLED = "cancelled", "Cancelled"

    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name="hosted_events")
    event_uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    start_label = models.CharField(max_length=120, blank=True)
    end_label = models.CharField(max_length=120, blank=True)
    start_at = models.DateTimeField(null=True, blank=True)
    end_at = models.DateTimeField(null=True, blank=True)
    location_name = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="INR")
    event_category = models.CharField(max_length=60, default="party")
    max_attendees = models.PositiveIntegerField(default=0)
    tickets_sold = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=20, choices=EventStatus.choices, default=EventStatus.PUBLISHED)
    image_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.location_name})"


class EventMedia(models.Model):
    class MediaType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"

    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="media_items")
    media_type = models.CharField(max_length=10, choices=MediaType.choices)
    file_url = models.URLField()
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.event_id} {self.media_type} #{self.sort_order}"


class EventTicket(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"

    attendee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="event_tickets")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="tickets")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    quantity = models.PositiveIntegerField(default=1)
    booked_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-booked_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["attendee", "event"], name="unique_ticket_per_user_event"),
        ]

    def __str__(self):
        return f"{self.attendee.username} ticket for {self.event.title} ({self.status})"


class ActivityNotification(models.Model):
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="activity_notifications")
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="triggered_activity_notifications")
    activity_type = models.CharField(max_length=40, default="activity")
    title = models.CharField(max_length=140)
    body = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.recipient.username}: {self.activity_type}"


class DirectConversation(models.Model):
    user_one = models.ForeignKey(User, on_delete=models.CASCADE, related_name="direct_conversations_started")
    user_two = models.ForeignKey(User, on_delete=models.CASCADE, related_name="direct_conversations_received")
    deleted_by = models.ManyToManyField(User, related_name="deleted_conversations", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["user_one", "user_two"], name="unique_direct_conversation_pair"),
            models.CheckConstraint(condition=~Q(user_one=F("user_two")), name="prevent_self_direct_conversation"),
        ]

    def __str__(self):
        return f"DM {self.user_one.username} <-> {self.user_two.username}"


class DirectMessage(models.Model):
    conversation = models.ForeignKey(DirectConversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="direct_messages_sent")
    forwarded_from = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="forwarded_copies",
    )
    replied_to = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="replies",
    )
    body = models.TextField(blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    unsent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.sender.username} -> conversation {self.conversation_id}"


class DirectMessageAttachment(models.Model):
    class AttachmentType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"
        FILE = "file", "File"

    message = models.ForeignKey(DirectMessage, on_delete=models.CASCADE, related_name="attachments")
    attachment_type = models.CharField(max_length=10, choices=AttachmentType.choices)
    file_url = models.URLField(blank=True)
    original_name = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self):
        return f"{self.attachment_type} attachment for message {self.message_id}"


class DirectMessageDeletion(models.Model):
    message = models.ForeignKey(DirectMessage, on_delete=models.CASCADE, related_name="deletions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deleted_direct_messages")
    deleted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-deleted_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["message", "user"], name="unique_direct_message_delete_per_user"),
        ]

    def __str__(self):
        return f"Message {self.message_id} deleted for {self.user.username}"
