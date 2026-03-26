from datetime import datetime, time, timedelta

from django.db import migrations
from django.utils import timezone


def parse_start(raw):
    value = (raw or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M"):
        try:
            parsed = datetime.strptime(value, fmt)
            return timezone.make_aware(parsed, timezone.get_current_timezone())
        except ValueError:
            continue
    return None


def parse_end(raw, start_at):
    value = (raw or "").strip()
    if not start_at:
        return None
    if value:
        for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M"):
            try:
                parsed = datetime.strptime(value, fmt)
                end_at = timezone.make_aware(parsed, timezone.get_current_timezone())
                if end_at <= start_at:
                    end_at += timedelta(days=1)
                return end_at
            except ValueError:
                continue
    next_day = (start_at + timedelta(days=1)).date()
    return timezone.make_aware(datetime.combine(next_day, time.min), timezone.get_current_timezone())


def backfill_event_schedule(apps, schema_editor):
    Event = apps.get_model("VIBE", "Event")
    for event in Event.objects.all():
        start_at = parse_start(event.start_label)
        if start_at is None:
            continue
        end_at = parse_end(event.end_label, start_at)
        updates = []
        if event.start_at is None:
            event.start_at = start_at
            updates.append("start_at")
        if event.end_at is None:
            event.end_at = end_at
            updates.append("end_at")
        if updates:
            event.save(update_fields=updates)


def noop(apps, schema_editor):
    return


class Migration(migrations.Migration):

    dependencies = [
        ("VIBE", "0006_event_schedule_fields"),
    ]

    operations = [
        migrations.RunPython(backfill_event_schedule, noop),
    ]
