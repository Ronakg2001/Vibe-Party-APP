from django.db import models
from django.contrib.auth import get_user_model
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

    def __str__(self):
        return f"{self.user.username} profile"


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
