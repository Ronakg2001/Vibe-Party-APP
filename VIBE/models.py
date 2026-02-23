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
