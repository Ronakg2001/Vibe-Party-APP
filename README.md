# Happnix-Party-APP

## Hybrid Database Design (SQL + MongoDB)

- SQL (current Django DB) remains the source of truth for authentication and core user identity.
- MongoDB stores large/flexible app data (`user_profiles` projection + `events` projection).
- Mongo docs are linked to SQL using `sql_user_id` and `sql_event_id`.

## Setup

1. Install dependency:
   - `pip install pymongo`
2. Set env vars:
   - `MONGO_URI` (required to enable Mongo sync)
   - `MONGO_DB_NAME` (optional, default: `party_connect_hub`)

## Implemented Endpoints/Flows

- Signup details + profile completion now sync a Mongo `user_profiles` document.
- Event creation now syncs a Mongo `events` document.
- New endpoint: `GET /api/users/search?q=<text>&limit=20`
  - Reads Mongo first.
  - Falls back to SQL if Mongo is empty/unavailable.

## Backfill Existing SQL Data to Mongo

- Run:
  - `python manage.py sync_mongo`
