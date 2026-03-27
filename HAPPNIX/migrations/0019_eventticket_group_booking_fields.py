from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("HAPPNIX", "0018_directconversation_deleted_by"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="eventticket",
            name="booked_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="tickets_booked_for", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="group_code",
            field=models.CharField(blank=True, db_index=True, max_length=36),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="paid_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="tickets_paid_for", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="service_fee",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="ticket_price",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="tier_name",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AlterField(
            model_name="eventticket",
            name="status",
            field=models.CharField(choices=[("active", "Active"), ("pending", "Pending"), ("cancelled", "Cancelled")], default="active", max_length=20),
        ),
    ]
