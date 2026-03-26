from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('VIBE', '0013_direct_messages'),
    ]

    operations = [
        migrations.AlterField(
            model_name='directmessage',
            name='body',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='directmessage',
            name='edited_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='directmessage',
            name='unsent_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='DirectMessageAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attachment_type', models.CharField(choices=[('image', 'Image'), ('video', 'Video'), ('audio', 'Audio'), ('file', 'File')], max_length=10)),
                ('file_url', models.URLField(blank=True)),
                ('original_name', models.CharField(blank=True, max_length=255)),
                ('mime_type', models.CharField(blank=True, max_length=120)),
                ('file_size', models.PositiveIntegerField(default=0)),
                ('duration_seconds', models.PositiveIntegerField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attachments', to='VIBE.directmessage')),
            ],
            options={
                'ordering': ['id'],
            },
        ),
        migrations.CreateModel(
            name='DirectMessageDeletion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('deleted_at', models.DateTimeField(auto_now_add=True)),
                ('message', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deletions', to='VIBE.directmessage')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='deleted_direct_messages', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-deleted_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='directmessagedeletion',
            constraint=models.UniqueConstraint(fields=('message', 'user'), name='unique_direct_message_delete_per_user'),
        ),
    ]
