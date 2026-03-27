from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("HAPPNIX", "0019_eventticket_group_booking_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="ticket_tiers",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="event",
            name="ticket_type",
            field=models.CharField(default="Free", max_length=20),
        ),
    ]
