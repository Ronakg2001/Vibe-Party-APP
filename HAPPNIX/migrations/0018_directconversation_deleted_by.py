from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("HAPPNIX", "0017_userprofile_last_active"),
    ]

    operations = [
        migrations.AddField(
            model_name="directconversation",
            name="deleted_by",
            field=models.ManyToManyField(blank=True, related_name="deleted_conversations", to=settings.AUTH_USER_MODEL),
        ),
    ]
