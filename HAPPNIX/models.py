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
    TAG_PERMISSION_CHOICES = [
        ("everyone", "Everyone"),
        ("followers", "Followers only"),
        ("no_one", "No one"),
    ]
    FAMILY_ROLE_CHOICES = [
        ("member", "Member"),
        ("parent", "Parent"),
        ("child", "Child"),
        ("normal_admin", "Normal admin"),
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
    tags_and_mentions_permission = models.CharField(
        max_length=20,
        choices=TAG_PERMISSION_CHOICES,
        default="everyone",
    )
    family_role = models.CharField(
        max_length=20,
        choices=FAMILY_ROLE_CHOICES,
        default="member",
    )
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


class SavedProfile(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_profiles")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="saved_by_profiles")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "target"], name="unique_saved_profile"),
            models.CheckConstraint(condition=~Q(owner=F("target")), name="prevent_self_saved_profile"),
        ]

    def __str__(self):
        return f"{self.owner.username} saved {self.target.username}"


class BlockedAccount(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_accounts")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked_by_accounts")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "target"], name="unique_blocked_account"),
            models.CheckConstraint(condition=~Q(owner=F("target")), name="prevent_self_blocked_account"),
        ]

    def __str__(self):
        return f"{self.owner.username} blocked {self.target.username}"


class RestrictedAccount(models.Model):
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name="restricted_accounts")
    target = models.ForeignKey(User, on_delete=models.CASCADE, related_name="restricted_by_accounts")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["owner", "target"], name="unique_restricted_account"),
            models.CheckConstraint(condition=~Q(owner=F("target")), name="prevent_self_restricted_account"),
        ]

    def __str__(self):
        return f"{self.owner.username} restricted {self.target.username}"


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
    ticket_type = models.CharField(max_length=20, default="Free")
    ticket_tiers = models.JSONField(default=list, blank=True)
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
        PENDING = "pending", "Pending"
        CANCELLED = "cancelled", "Cancelled"

    attendee = models.ForeignKey(User, on_delete=models.CASCADE, related_name="event_tickets")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="tickets")
    booked_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="tickets_booked_for", null=True, blank=True)
    paid_by = models.ForeignKey(User, on_delete=models.SET_NULL, related_name="tickets_paid_for", null=True, blank=True)
    group_code = models.CharField(max_length=36, blank=True, db_index=True)
    tier_name = models.CharField(max_length=120, blank=True)
    invite_status = models.CharField(max_length=20, default="confirmed")
    pending_reason = models.CharField(max_length=20, blank=True)
    ticket_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    service_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_transaction_id = models.CharField(max_length=64, blank=True)
    refund_transaction_id = models.CharField(max_length=64, blank=True)
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


class GroupConversation(models.Model):
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name="groups_created")
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    avatar_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-id"]

    def __str__(self):
        return f"Group {self.name}"


class GroupConversationMember(models.Model):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"

    group = models.ForeignKey(GroupConversation, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="group_memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    added_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="group_members_added")
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)
    removed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["joined_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["group", "user"], name="unique_group_member"),
        ]

    def __str__(self):
        return f"{self.user.username} in {self.group.name} ({self.role})"


class GroupMessage(models.Model):
    group = models.ForeignKey(GroupConversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name="group_messages_sent")
    replied_to = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="group_replies",
    )
    body = models.TextField(blank=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    unsent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.sender.username} -> group {self.group_id}"


class GroupMessageAttachment(models.Model):
    class AttachmentType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        AUDIO = "audio", "Audio"
        FILE = "file", "File"

    message = models.ForeignKey(GroupMessage, on_delete=models.CASCADE, related_name="attachments")
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
        return f"{self.attachment_type} group attachment for message {self.message_id}"


class GroupMessageDeletion(models.Model):
    message = models.ForeignKey(GroupMessage, on_delete=models.CASCADE, related_name="deletions")
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="deleted_group_messages")
    deleted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-deleted_at", "-id"]
        constraints = [
            models.UniqueConstraint(fields=["message", "user"], name="unique_group_message_delete_per_user"),
        ]

    def __str__(self):
        return f"Group message {self.message_id} deleted for {self.user.username}"


class GroupMessageStatus(models.Model):
    message = models.ForeignKey(GroupMessage, on_delete=models.CASCADE, related_name="statuses")
    recipient = models.ForeignKey(User, on_delete=models.CASCADE, related_name="group_message_statuses")
    delivered_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [
            models.UniqueConstraint(fields=["message", "recipient"], name="unique_group_message_recipient_status"),
        ]

    def __str__(self):
        return f"Group message {self.message_id} -> {self.recipient.username}"
