from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from VIBE import mongo_store
from VIBE.models import Event


class Command(BaseCommand):
    help = "Backfill/sync SQL users and events into MongoDB."

    def handle(self, *args, **options):
        if not mongo_store.is_enabled():
            self.stdout.write(
                self.style.WARNING(
                    "MongoDB not enabled. Set MONGO_URI (and optional MONGO_DB_NAME) first."
                )
            )
            return

        User = get_user_model()
        users_synced = 0
        for user_id in User.objects.values_list("id", flat=True):
            if mongo_store.sync_user_profile(user_id):
                users_synced += 1

        events_synced = 0
        for event_id in Event.objects.values_list("id", flat=True):
            if mongo_store.sync_event(event_id):
                events_synced += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Mongo sync complete. user_profiles={users_synced}, events={events_synced}"
            )
        )
