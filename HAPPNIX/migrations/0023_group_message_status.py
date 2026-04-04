from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("HAPPNIX", "0022_group_chat_models"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroupMessageStatus",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("delivered_at", models.DateTimeField(blank=True, null=True)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="statuses", to="HAPPNIX.groupmessage")),
                ("recipient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="group_message_statuses", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.AddConstraint(
            model_name="groupmessagestatus",
            constraint=models.UniqueConstraint(fields=("message", "recipient"), name="unique_group_message_recipient_status"),
        ),
    ]
