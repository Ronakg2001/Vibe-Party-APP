from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("VIBE", "0007_backfill_event_schedule"),
    ]

    operations = [
        migrations.CreateModel(
            name="Follow",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("follower", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="following_links", to=settings.AUTH_USER_MODEL)),
                ("following", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="follower_links", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="follow",
            constraint=models.UniqueConstraint(fields=("follower", "following"), name="unique_follow_link"),
        ),
        migrations.AddConstraint(
            model_name="follow",
            constraint=models.CheckConstraint(condition=~models.Q(follower=models.F("following")), name="prevent_self_follow"),
        ),
    ]
