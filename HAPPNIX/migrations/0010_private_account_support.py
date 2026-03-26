from django.db import migrations, models


def mark_existing_follows_as_accepted(apps, schema_editor):
    Follow = apps.get_model("VIBE", "Follow")
    Follow.objects.filter(status="").update(status="accepted")
    Follow.objects.filter(status__isnull=True).update(status="accepted")


class Migration(migrations.Migration):

    dependencies = [
        ("VIBE", "0009_activitynotification"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="is_private",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="follow",
            name="status",
            field=models.CharField(choices=[("pending", "Pending"), ("accepted", "Accepted")], default="accepted", max_length=20),
            preserve_default=False,
        ),
        migrations.RunPython(mark_existing_follows_as_accepted, migrations.RunPython.noop),
    ]
