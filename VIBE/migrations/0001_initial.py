from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="UserProfile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("sex", models.CharField(choices=[("mr.", "Mr."), ("miss.", "Miss."), ("mrs.", "Mrs."), ("other", "Other")], max_length=10)),
                ("date_of_birth", models.DateField()),
                ("mobile", models.CharField(max_length=10, unique=True)),
                ("bio", models.TextField(blank=True)),
                ("profile_picture_url", models.URLField(blank=True)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
