from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('VIBE', '0010_private_account_support'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventTicket',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('active', 'Active'), ('cancelled', 'Cancelled')], default='active', max_length=20)),
                ('quantity', models.PositiveIntegerField(default=1)),
                ('booked_at', models.DateTimeField(auto_now_add=True)),
                ('cancelled_at', models.DateTimeField(blank=True, null=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('attendee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='event_tickets', to=settings.AUTH_USER_MODEL)),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tickets', to='VIBE.event')),
            ],
            options={
                'ordering': ['-booked_at', '-id'],
            },
        ),
        migrations.AddConstraint(
            model_name='eventticket',
            constraint=models.UniqueConstraint(fields=('attendee', 'event'), name='unique_ticket_per_user_event'),
        ),
    ]
