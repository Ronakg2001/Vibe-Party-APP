from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('HAPPNIX', '0014_message_attachments_and_actions'),
    ]

    operations = [
        migrations.AddField(
            model_name='directmessage',
            name='forwarded_from',
            field=models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='forwarded_copies', to='HAPPNIX.directmessage'),
        ),
    ]
