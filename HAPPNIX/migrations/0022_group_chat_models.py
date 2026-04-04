from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("HAPPNIX", "0021_eventticket_group_status_fields"),
    ]

    operations = [
        migrations.CreateModel(
            name="GroupConversation",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120)),
                ("description", models.TextField(blank=True)),
                ("avatar_url", models.URLField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("created_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="groups_created", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "-id"]},
        ),
        migrations.CreateModel(
            name="GroupConversationMember",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("admin", "Admin"), ("member", "Member")], default="member", max_length=20)),
                ("joined_at", models.DateTimeField(auto_now_add=True)),
                ("last_read_at", models.DateTimeField(blank=True, null=True)),
                ("removed_at", models.DateTimeField(blank=True, null=True)),
                ("added_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="group_members_added", to=settings.AUTH_USER_MODEL)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="memberships", to="HAPPNIX.groupconversation")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="group_memberships", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["joined_at", "id"]},
        ),
        migrations.CreateModel(
            name="GroupMessage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("body", models.TextField(blank=True)),
                ("edited_at", models.DateTimeField(blank=True, null=True)),
                ("unsent_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("group", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="messages", to="HAPPNIX.groupconversation")),
                ("replied_to", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="group_replies", to="HAPPNIX.groupmessage")),
                ("sender", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="group_messages_sent", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["created_at", "id"]},
        ),
        migrations.CreateModel(
            name="GroupMessageAttachment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("attachment_type", models.CharField(choices=[("image", "Image"), ("video", "Video"), ("audio", "Audio"), ("file", "File")], max_length=10)),
                ("file_url", models.URLField(blank=True)),
                ("original_name", models.CharField(blank=True, max_length=255)),
                ("mime_type", models.CharField(blank=True, max_length=120)),
                ("file_size", models.PositiveIntegerField(default=0)),
                ("duration_seconds", models.PositiveIntegerField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="attachments", to="HAPPNIX.groupmessage")),
            ],
            options={"ordering": ["id"]},
        ),
        migrations.CreateModel(
            name="GroupMessageDeletion",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("deleted_at", models.DateTimeField(auto_now_add=True)),
                ("message", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deletions", to="HAPPNIX.groupmessage")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="deleted_group_messages", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-deleted_at", "-id"]},
        ),
        migrations.AddConstraint(
            model_name="groupconversationmember",
            constraint=models.UniqueConstraint(fields=("group", "user"), name="unique_group_member"),
        ),
        migrations.AddConstraint(
            model_name="groupmessagedeletion",
            constraint=models.UniqueConstraint(fields=("message", "user"), name="unique_group_message_delete_per_user"),
        ),
    ]
