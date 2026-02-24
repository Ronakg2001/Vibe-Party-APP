from django.db import models
from django.contrib.auth import get_user_model

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
    host = models.ForeignKey(User, on_delete=models.CASCADE, related_name="hosted_events")
    title = models.CharField(max_length=140)
    description = models.TextField(blank=True)
    start_label = models.CharField(max_length=120, blank=True)
    location_name = models.CharField(max_length=255)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    price = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    image_url = models.URLField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.title} ({self.location_name})"
