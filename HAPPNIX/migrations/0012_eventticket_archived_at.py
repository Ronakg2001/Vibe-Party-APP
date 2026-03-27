from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('HAPPNIX', '0011_eventticket'),
    ]

    operations = [
        migrations.AddField(
            model_name='eventticket',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
