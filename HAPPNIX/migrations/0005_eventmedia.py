from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("VIBE", "0004_event_detail_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="EventMedia",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("media_type", models.CharField(choices=[("image", "Image"), ("video", "Video")], max_length=10)),
                ("file_url", models.URLField()),
                ("sort_order", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("event", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="media_items", to="VIBE.event")),
            ],
            options={
                "ordering": ["sort_order", "id"],
            },
        ),
    ]
