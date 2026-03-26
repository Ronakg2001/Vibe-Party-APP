from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
from django.db.models import F, Q


class Migration(migrations.Migration):

    dependencies = [
        ('VIBE', '0012_eventticket_archived_at'),
    ]

    operations = [
        migrations.CreateModel(
            name='DirectConversation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user_one', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_conversations_started', to=settings.AUTH_USER_MODEL)),
                ('user_two', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_conversations_received', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-updated_at', '-id'],
            },
        ),
        migrations.CreateModel(
            name='DirectMessage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField()),
                ('read_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('conversation', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='messages', to='VIBE.directconversation')),
                ('sender', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='direct_messages_sent', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['created_at', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='directconversation',
            constraint=models.UniqueConstraint(fields=('user_one', 'user_two'), name='unique_direct_conversation_pair'),
        ),
        migrations.AddConstraint(
            model_name='directconversation',
            constraint=models.CheckConstraint(condition=~Q(user_one=F('user_two')), name='prevent_self_direct_conversation'),
        ),
    ]
