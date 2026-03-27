from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("HAPPNIX", "0020_event_ticketing_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="eventticket",
            name="invite_status",
            field=models.CharField(default="confirmed", max_length=20),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="pending_reason",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="payment_transaction_id",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="eventticket",
            name="refund_transaction_id",
            field=models.CharField(blank=True, max_length=64),
        ),
    ]
