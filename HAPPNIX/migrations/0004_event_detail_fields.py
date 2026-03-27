import uuid

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("HAPPNIX", "0003_event"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="currency",
            field=models.CharField(default="INR", max_length=3),
        ),
        migrations.AddField(
            model_name="event",
            name="end_label",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="event",
            name="event_category",
            field=models.CharField(default="party", max_length=60),
        ),
        migrations.AddField(
            model_name="event",
            name="event_uid",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
        migrations.AddField(
            model_name="event",
            name="max_attendees",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="event",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("published", "Published"), ("cancelled", "Cancelled")],
                default="published",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="event",
            name="tickets_sold",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="event",
            name="updated_at",
            field=models.DateTimeField(auto_now=True),
        ),
    ]
