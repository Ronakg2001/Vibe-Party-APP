from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("VIBE", "0005_eventmedia"),
    ]

    operations = [
        migrations.AddField(
            model_name="event",
            name="end_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="event",
            name="start_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
