from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("VIBE", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="gov_id_number",
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AddField(
            model_name="userprofile",
            name="gov_id_verified",
            field=models.BooleanField(default=False),
        ),
    ]
