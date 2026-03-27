from decimal import Decimal
from datetime import timedelta
import json
import asyncio
import shutil
import tempfile

from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from Happnix_party_APP.asgi import application

from .models import ActivityNotification, DirectConversation, DirectMessage, DirectMessageAttachment, DirectMessageDeletion, Event, EventTicket, Follow, UserProfile
class DiscoverSearchAndFollowTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.alice = self.user_model.objects.create_user(
            username="alice",
            password="pass12345",
            first_name="Alice Wonder",
            email="alice@example.com",
        )
        self.bob = self.user_model.objects.create_user(
            username="dj_bob",
            password="pass12345",
            first_name="Bob Rhythm",
            email="bob@example.com",
        )
        self.carol = self.user_model.objects.create_user(
            username="carol_vibes",
            password="pass12345",
            first_name="Carol Beats",
            email="carol@example.com",
        )
        for idx, user in enumerate([self.alice, self.bob, self.carol], start=1):
            UserProfile.objects.create(
                user=user,
                sex="other",
                date_of_birth="2000-01-0%d" % idx,
                mobile=f"99999999{idx:02d}",
            )

    def test_search_users_matches_name_and_username(self):
        self.client.force_login(self.alice)

        by_name = self.client.get('/api/users/search', {'q': 'Bob'})
        self.assertEqual(by_name.status_code, 200)
        name_payload = by_name.json()
        self.assertEqual(name_payload['count'], 1)
        self.assertEqual(name_payload['users'][0]['username'], 'dj_bob')
        self.assertFalse(name_payload['users'][0]['is_following'])
        self.assertFalse(name_payload['users'][0]['follows_you'])
        self.assertFalse(name_payload['users'][0]['follow_request_pending'])

        by_username = self.client.get('/api/users/search', {'q': 'carol_'})
        self.assertEqual(by_username.status_code, 200)
        username_payload = by_username.json()
        self.assertEqual(username_payload['count'], 1)
        self.assertEqual(username_payload['users'][0]['username'], 'carol_vibes')

    def test_public_follow_and_follow_back_are_persisted(self):
        self.client.force_login(self.alice)
        follow_response = self.client.post(
            '/api/users/follow',
            data='{"targetUserId": %d}' % self.bob.id,
            content_type='application/json',
        )
        self.assertEqual(follow_response.status_code, 200)
        self.assertTrue(Follow.objects.filter(follower=self.alice, following=self.bob, status=Follow.Status.ACCEPTED).exists())

        alice_profile = self.client.get('/api/profile/me').json()['profile']
        self.assertEqual(alice_profile['following_count'], 1)
        self.assertEqual(alice_profile['followers_count'], 0)

        self.client.force_login(self.bob)
        search_response = self.client.get('/api/users/search', {'q': 'alice'})
        self.assertEqual(search_response.status_code, 200)
        result = search_response.json()['users'][0]
        self.assertFalse(result['is_following'])
        self.assertTrue(result['follows_you'])
        self.assertFalse(result['follow_request_pending'])

        follow_back_response = self.client.post(
            '/api/users/follow',
            data='{"targetUserId": %d}' % self.alice.id,
            content_type='application/json',
        )
        self.assertEqual(follow_back_response.status_code, 200)
        self.assertTrue(Follow.objects.filter(follower=self.bob, following=self.alice, status=Follow.Status.ACCEPTED).exists())

        bob_search_after = self.client.get('/api/users/search', {'q': 'alice'}).json()['users'][0]
        self.assertTrue(bob_search_after['is_following'])
        self.assertTrue(bob_search_after['follows_you'])

    def test_private_account_requires_follow_request_and_approval(self):
        bob_profile = self.bob.profile
        bob_profile.is_private = True
        bob_profile.save(update_fields=['is_private'])

        self.client.force_login(self.alice)
        follow_response = self.client.post(
            '/api/users/follow',
            data='{"targetUserId": %d}' % self.bob.id,
            content_type='application/json',
        )
        self.assertEqual(follow_response.status_code, 200)
        follow_payload = follow_response.json()['follow']
        self.assertFalse(follow_payload['is_following'])
        self.assertTrue(follow_payload['follow_request_pending'])
        self.assertTrue(Follow.objects.filter(follower=self.alice, following=self.bob, status=Follow.Status.PENDING).exists())

        hidden_profile = self.client.get(f'/api/users/{self.bob.id}/profile').json()['profile']
        self.assertTrue(hidden_profile['is_private'])
        self.assertFalse(hidden_profile['can_view_content'])
        self.assertEqual(hidden_profile['hosted_events'], [])

        self.client.force_login(self.bob)
        follow_requests = self.client.get('/api/profile/follow-requests')
        self.assertEqual(follow_requests.status_code, 200)
        self.assertEqual(follow_requests.json()['count'], 1)
        self.assertEqual(follow_requests.json()['requests'][0]['username'], 'alice')

        approve_response = self.client.post(
            '/api/profile/follow-requests',
            data='{"requesterUserId": %d, "action": "approve"}' % self.alice.id,
            content_type='application/json',
        )
        self.assertEqual(approve_response.status_code, 200)
        self.assertTrue(Follow.objects.filter(follower=self.alice, following=self.bob, status=Follow.Status.ACCEPTED).exists())

        self.client.force_login(self.alice)
        visible_profile = self.client.get(f'/api/users/{self.bob.id}/profile').json()['profile']
        self.assertTrue(visible_profile['can_view_content'])

    def test_privacy_toggle_updates_profile(self):
        self.client.force_login(self.alice)
        response = self.client.post(
            '/api/profile/privacy',
            data='{"isPrivate": true}',
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.alice.profile.refresh_from_db()
        self.assertTrue(self.alice.profile.is_private)
        current_profile = self.client.get('/api/profile/me').json()['profile']
        self.assertTrue(current_profile['is_private'])


class EventCreationApiTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.host = self.user_model.objects.create_user(
            username="ticket_host",
            password="pass12345",
            first_name="Ticket",
            email="ticket_host@example.com",
        )
        UserProfile.objects.create(user=self.host, sex="other", date_of_birth="2000-01-01", mobile="8888888891")

    def test_paid_event_with_legacy_free_type_still_serializes_as_paid(self):
        event = Event.objects.create(
            host=self.host,
            title='Legacy Paid Night',
            description='Legacy paid event',
            start_label='2099-01-02 20:00',
            location_name='Jaipur',
            latitude=26.9124,
            longitude=75.7873,
            price=399,
            currency='INR',
            ticket_type='Free',
            ticket_tiers=[],
            status=Event.EventStatus.PUBLISHED,
            is_active=True,
        )
        self.client.force_login(self.host)
        response = self.client.get('/api/events/mine')
        self.assertEqual(response.status_code, 200)
        event_payload = next(item for item in response.json()['events'] if item['id'] == event.id)
        self.assertEqual(event_payload['ticketType'], 'Paid')
        self.assertEqual(event_payload['price'], 399.0)

    def test_paid_event_creation_persists_ticket_config(self):
        self.client.force_login(self.host)
        response = self.client.post(
            '/api/events/create',
            data={
                'title': 'Paid Night',
                'description': 'VIP night',
                'startLabel': '2099-01-01 20:00',
                'locationName': 'Jaipur',
                'latitude': '26.9124',
                'longitude': '75.7873',
                'currency': 'INR',
                'ticketType': 'Paid',
                'ticketTiers': json.dumps([
                    {'name': 'Regular', 'price': '499', 'qty': '50', 'flex': False, 'services': 'Entry'},
                    {'name': 'VIP', 'price': '999', 'qty': '10', 'flex': False, 'services': 'Table'},
                ]),
                'price': '499',
            },
        )
        self.assertEqual(response.status_code, 200)
        event = Event.objects.get(title='Paid Night')
        self.assertEqual(event.ticket_type, 'Paid')
        self.assertEqual(event.price, 499)
        self.assertEqual(len(event.ticket_tiers), 2)
        self.assertEqual(event.ticket_tiers[0]['name'], 'Regular')

class EventTicketApiTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.host = self.user_model.objects.create_user(
            username="host_user",
            password="pass12345",
            first_name="Host",
            email="host@example.com",
        )
        self.guest = self.user_model.objects.create_user(
            username="guest_user",
            password="pass12345",
            first_name="Guest",
            email="guest@example.com",
        )
        self.friend = self.user_model.objects.create_user(
            username="friend_user",
            password="pass12345",
            first_name="Friend",
            email="friend@example.com",
        )
        UserProfile.objects.create(user=self.host, sex="other", date_of_birth="2000-01-01", mobile="8888888801")
        UserProfile.objects.create(user=self.guest, sex="other", date_of_birth="2000-01-02", mobile="8888888802")
        UserProfile.objects.create(user=self.friend, sex="other", date_of_birth="2000-01-03", mobile="8888888803")
        now = timezone.localtime()
        self.event = Event.objects.create(
            host=self.host,
            title="Live Party",
            description="Join in",
            start_label=now.strftime("%Y-%m-%d %H:%M"),
            end_label=(now + timedelta(hours=2)).strftime("%Y-%m-%d %H:%M"),
            start_at=now,
            end_at=now + timedelta(hours=2),
            location_name="Jaipur",
            latitude=26.9124,
            longitude=75.7873,
            status=Event.EventStatus.PUBLISHED,
            is_active=True,
        )

    def test_user_cannot_book_same_event_twice_without_cancelling(self):
        self.client.force_login(self.guest)
        first = self.client.post('/api/tickets/book', data='{"eventId": %d}' % self.event.id, content_type='application/json')
        self.assertEqual(first.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 1)

        second = self.client.post('/api/tickets/book', data='{"eventId": %d}' % self.event.id, content_type='application/json')
        self.assertEqual(second.status_code, 409)
        self.assertEqual(EventTicket.objects.filter(attendee=self.guest, event=self.event).count(), 1)

    def test_cancelled_ticket_allows_rebooking(self):
        self.client.force_login(self.guest)
        booked = self.client.post('/api/tickets/book', data='{"eventId": %d}' % self.event.id, content_type='application/json')
        self.assertEqual(booked.status_code, 200)
        ticket_id = booked.json()['ticket']['id']

        cancelled = self.client.post(f'/api/tickets/{ticket_id}/cancel', data='{}', content_type='application/json')
        self.assertEqual(cancelled.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 0)

        rebooked = self.client.post('/api/tickets/book', data='{"eventId": %d}' % self.event.id, content_type='application/json')
        self.assertEqual(rebooked.status_code, 200)
        ticket = EventTicket.objects.get(attendee=self.guest, event=self.event)
        self.assertEqual(ticket.status, EventTicket.Status.ACTIVE)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 1)


    def test_free_event_group_booking_joins_all_added_people(self):
        self.client.force_login(self.guest)
        response = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'General',
                'ticketPrice': '0',
                'serviceFee': '0',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        owner_ticket = EventTicket.objects.get(attendee=self.guest, event=self.event)
        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        self.assertEqual(owner_ticket.status, EventTicket.Status.ACTIVE)
        self.assertEqual(friend_ticket.status, EventTicket.Status.ACTIVE)
        self.assertEqual(friend_ticket.booked_by, self.guest)
        self.assertEqual(friend_ticket.paid_by, self.guest)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 2)

    def test_group_booking_creates_pending_ticket_for_unpaid_invitee(self):
        self.client.force_login(self.guest)
        response = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        owner_ticket = EventTicket.objects.get(attendee=self.guest, event=self.event)
        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        self.assertEqual(owner_ticket.status, EventTicket.Status.ACTIVE)
        self.assertEqual(friend_ticket.status, EventTicket.Status.PENDING)
        self.assertEqual(friend_ticket.booked_by, self.guest)
        self.assertEqual(friend_ticket.paid_by, None)
        self.assertEqual(owner_ticket.group_code, friend_ticket.group_code)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 1)

    def test_group_booking_creates_ticket_invite_message_and_notification(self):
        self.client.force_login(self.guest)
        response = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        conversation = DirectConversation.objects.filter(
            user_one_id=min(self.guest.id, self.friend.id),
            user_two_id=max(self.guest.id, self.friend.id),
        ).first()
        self.assertIsNotNone(conversation)
        message = DirectMessage.objects.filter(conversation=conversation, sender=self.guest).order_by('-id').first()
        self.assertIsNotNone(message)
        self.assertIn('[Ticket Invite]', message.body)
        self.assertTrue(ActivityNotification.objects.filter(recipient=self.friend, activity_type='ticket_invite').exists())

    def test_pending_group_invitee_can_pay_later(self):
        self.client.force_login(self.guest)
        booked = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(booked.status_code, 200)

        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        self.client.force_login(self.friend)
        pay_response = self.client.post(f'/api/tickets/{friend_ticket.id}/pay', data='{}', content_type='application/json')
        self.assertEqual(pay_response.status_code, 200)
        friend_ticket.refresh_from_db()
        self.assertEqual(friend_ticket.status, EventTicket.Status.ACTIVE)
        self.assertEqual(friend_ticket.paid_by, self.friend)
        self.event.refresh_from_db()
        self.assertEqual(self.event.tickets_sold, 2)

    def test_free_group_booking_can_create_tentative_invitee(self):
        self.client.force_login(self.guest)
        response = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'inviteeStatuses': {str(self.friend.id): 'tentative'},
                'paidForUserIds': [self.guest.id],
                'tierName': 'General',
                'ticketPrice': '0',
                'serviceFee': '0',
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        self.assertEqual(friend_ticket.status, EventTicket.Status.PENDING)
        self.assertEqual(friend_ticket.invite_status, 'tentative')
        self.assertEqual(friend_ticket.pending_reason, 'tentative')

    def test_group_member_can_pay_for_another_pending_member(self):
        self.client.force_login(self.guest)
        booked = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(booked.status_code, 200)
        owner_ticket = EventTicket.objects.get(attendee=self.guest, event=self.event)
        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        self.client.force_login(self.guest)
        pay_response = self.client.post(
            f'/api/tickets/{owner_ticket.id}/pay',
            data=json.dumps({'payForTicketIds': [friend_ticket.id]}),
            content_type='application/json',
        )
        self.assertEqual(pay_response.status_code, 200)
        friend_ticket.refresh_from_db()
        self.assertEqual(friend_ticket.status, EventTicket.Status.ACTIVE)
        self.assertEqual(friend_ticket.paid_by, self.guest)
        self.assertTrue(friend_ticket.payment_transaction_id)

    def test_pending_payment_can_change_tier_before_joining(self):
        self.client.force_login(self.guest)
        booked = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'inviteeUserIds': [self.friend.id],
                'paidForUserIds': [self.guest.id],
                'tierName': 'Regular',
                'ticketPrice': '199',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(booked.status_code, 200)
        owner_ticket = EventTicket.objects.get(attendee=self.guest, event=self.event)
        friend_ticket = EventTicket.objects.get(attendee=self.friend, event=self.event)
        pay_response = self.client.post(
            f'/api/tickets/{owner_ticket.id}/pay',
            data=json.dumps({
                'payForTicketIds': [friend_ticket.id],
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(pay_response.status_code, 200)
        friend_ticket.refresh_from_db()
        self.assertEqual(friend_ticket.tier_name, 'VIP')
        self.assertEqual(friend_ticket.ticket_price, Decimal('499'))

    def test_cancelling_paid_ticket_generates_refund_transaction_id(self):
        self.client.force_login(self.guest)
        booked = self.client.post(
            '/api/tickets/book',
            data=json.dumps({
                'eventId': self.event.id,
                'tierName': 'VIP',
                'ticketPrice': '499',
                'serviceFee': '4',
            }),
            content_type='application/json',
        )
        self.assertEqual(booked.status_code, 200)
        ticket_id = booked.json()['ticket']['id']
        cancel_response = self.client.post(f'/api/tickets/{ticket_id}/cancel', data='{}', content_type='application/json')
        self.assertEqual(cancel_response.status_code, 200)
        ticket = EventTicket.objects.get(id=ticket_id)
        self.assertEqual(ticket.status, EventTicket.Status.CANCELLED)
        self.assertTrue(ticket.refund_transaction_id)


class DirectMessageApiTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.alice = self.user_model.objects.create_user(
            username='alice_dm',
            password='pass12345',
            first_name='Alice',
            email='alice_dm@example.com',
        )
        self.bob = self.user_model.objects.create_user(
            username='bob_dm',
            password='pass12345',
            first_name='Bob',
            email='bob_dm@example.com',
        )
        self.carol = self.user_model.objects.create_user(
            username='carol_dm',
            password='pass12345',
            first_name='Carol',
            email='carol_dm@example.com',
        )
        UserProfile.objects.create(user=self.alice, sex='other', date_of_birth='2000-01-01', mobile='7777777701')
        UserProfile.objects.create(user=self.bob, sex='other', date_of_birth='2000-01-02', mobile='7777777702')
        UserProfile.objects.create(user=self.carol, sex='other', date_of_birth='2000-01-03', mobile='7777777703')

    def test_start_conversation_is_unique_per_user_pair(self):
        self.client.force_login(self.alice)
        first = self.client.post(
            '/api/messages/conversations/start',
            data='{"targetUserId": %d}' % self.bob.id,
            content_type='application/json',
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            '/api/messages/conversations/start',
            data='{"targetUserId": %d}' % self.bob.id,
            content_type='application/json',
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()['conversation']['id'], second.json()['conversation']['id'])
        self.assertEqual(DirectConversation.objects.count(), 1)

    def test_send_message_and_mark_as_read_when_thread_is_opened(self):
        self.client.force_login(self.alice)
        start = self.client.post(
            '/api/messages/conversations/start',
            data='{"targetUserId": %d}' % self.bob.id,
            content_type='application/json',
        )
        conversation_id = start.json()['conversation']['id']

        send = self.client.post(
            f'/api/messages/conversations/{conversation_id}/messages',
            data='{"body": "Hey Bob, are you joining tonight?"}',
            content_type='application/json',
        )
        self.assertEqual(send.status_code, 200)
        self.assertEqual(DirectMessage.objects.count(), 1)
        self.assertEqual(DirectMessage.objects.get().read_at, None)

        self.client.force_login(self.bob)
        inbox = self.client.get('/api/messages/conversations')
        self.assertEqual(inbox.status_code, 200)
        self.assertEqual(inbox.json()['unreadCount'], 1)
        self.assertEqual(inbox.json()['conversations'][0]['unreadCount'], 1)

        thread = self.client.get(f'/api/messages/conversations/{conversation_id}/messages')
        self.assertEqual(thread.status_code, 200)
        self.assertEqual(len(thread.json()['messages']), 1)

        message = DirectMessage.objects.get()
        self.assertIsNotNone(message.read_at)

        inbox_after = self.client.get('/api/messages/conversations')
        self.assertEqual(inbox_after.status_code, 200)
        self.assertEqual(inbox_after.json()['unreadCount'], 0)

    def test_non_participant_cannot_open_conversation(self):
        conversation = DirectConversation.objects.create(user_one=self.alice, user_two=self.bob)

        self.client.force_login(self.carol)
        response = self.client.get(f'/api/messages/conversations/{conversation.id}/messages')
        self.assertEqual(response.status_code, 404)

    def test_user_cannot_create_self_conversation(self):
        self.client.force_login(self.alice)
        response = self.client.post(
            '/api/messages/conversations/start',
            data='{"targetUserId": %d}' % self.alice.id,
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)


class DirectMessageWebSocketTests(TransactionTestCase):
    def test_authenticated_user_can_connect_to_message_socket(self):
        user_model = get_user_model()
        user = user_model.objects.create_user(
            username='socket_user',
            password='pass12345',
            email='socket@example.com',
        )
        UserProfile.objects.create(user=user, sex='other', date_of_birth='2000-01-04', mobile='7777777704')

        async def run_case():
            communicator = WebsocketCommunicator(application, '/ws/messages/')
            communicator.scope['user'] = user
            connected, _subprotocol = await communicator.connect()
            self.assertTrue(connected)
            payload = await communicator.receive_json_from()
            self.assertEqual(payload['type'], 'socket.connected')
            self.assertEqual(payload['userId'], user.id)
            await communicator.disconnect()

        asyncio.run(run_case())


@override_settings(MEDIA_ROOT=r"E:\\project\\Party_connect_hub_redefine\\media_test")
class DirectMessageAttachmentAndActionsTests(TestCase):
    def setUp(self):
        self.user_model = get_user_model()
        self.alice = self.user_model.objects.create_user(username='alice_media', password='pass12345', email='alice_media@example.com')
        self.bob = self.user_model.objects.create_user(username='bob_media', password='pass12345', email='bob_media@example.com')
        UserProfile.objects.create(user=self.alice, sex='other', date_of_birth='2000-02-01', mobile='7777777711')
        UserProfile.objects.create(user=self.bob, sex='other', date_of_birth='2000-02-02', mobile='7777777712')
        self.client.force_login(self.alice)
        start = self.client.post('/api/messages/conversations/start', data='{"targetUserId": %d}' % self.bob.id, content_type='application/json')
        self.conversation_id = start.json()['conversation']['id']

    def test_can_send_attachment_message(self):
        image = SimpleUploadedFile('party.png', b'fake-image-bytes', content_type='image/png')
        response = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data={'body': 'See this', 'attachmentMeta': '[{"durationSeconds": null}]', 'attachments': image},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()['message']
        self.assertEqual(len(payload['attachments']), 1)
        self.assertEqual(payload['attachments'][0]['type'], 'image')
        self.assertTrue(DirectMessageAttachment.objects.filter(message_id=payload['id']).exists())

    def test_can_send_voice_note_attachment(self):
        audio = SimpleUploadedFile('voice.webm', b'voice-bytes', content_type='audio/webm')
        response = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data={'body': '', 'attachmentMeta': '[{"durationSeconds": 7}]', 'attachments': audio},
        )
        self.assertEqual(response.status_code, 200)
        attachment = DirectMessageAttachment.objects.get(message_id=response.json()['message']['id'])
        self.assertEqual(attachment.attachment_type, DirectMessageAttachment.AttachmentType.AUDIO)
        self.assertEqual(attachment.duration_seconds, 7)

    def test_sender_can_edit_message(self):
        created = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data='{"body": "Old text"}',
            content_type='application/json',
        )
        message_id = created.json()['message']['id']
        edited = self.client.post(
            f'/api/messages/messages/{message_id}/edit',
            data='{"body": "New text"}',
            content_type='application/json',
        )
        self.assertEqual(edited.status_code, 200)
        message = DirectMessage.objects.get(id=message_id)
        self.assertEqual(message.body, 'New text')
        self.assertIsNotNone(message.edited_at)

    def test_user_can_delete_message_for_self_only(self):
        created = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data='{"body": "Delete only for me"}',
            content_type='application/json',
        )
        message_id = created.json()['message']['id']
        deleted = self.client.post(f'/api/messages/messages/{message_id}/delete', data='{}', content_type='application/json')
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(DirectMessageDeletion.objects.filter(message_id=message_id, user=self.alice).exists())
        thread = self.client.get(f'/api/messages/conversations/{self.conversation_id}/messages')
        self.assertEqual(thread.status_code, 200)
        self.assertEqual(thread.json()['messages'], [])
        self.client.force_login(self.bob)
        bob_thread = self.client.get(f'/api/messages/conversations/{self.conversation_id}/messages')
        self.assertEqual(len(bob_thread.json()['messages']), 1)

    def test_sender_can_unsend_message(self):
        created = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data='{"body": "Temporary text"}',
            content_type='application/json',
        )
        message_id = created.json()['message']['id']
        unsent = self.client.post(f'/api/messages/messages/{message_id}/unsend', data='{}', content_type='application/json')
        self.assertEqual(unsent.status_code, 200)
        message = DirectMessage.objects.get(id=message_id)
        self.assertEqual(message.body, '')
        self.assertIsNotNone(message.unsent_at)
        self.client.force_login(self.bob)
        bob_thread = self.client.get(f'/api/messages/conversations/{self.conversation_id}/messages')
        self.assertEqual(bob_thread.status_code, 200)
        self.assertTrue(bob_thread.json()['messages'][0]['isUnsent'])



    def test_user_can_forward_message_with_attachments(self):
        carol = self.user_model.objects.create_user(username='carol_media', password='pass12345', email='carol_media@example.com')
        UserProfile.objects.create(user=carol, sex='other', date_of_birth='2000-02-03', mobile='7777777713')

        original = self.client.post(
            f'/api/messages/conversations/{self.conversation_id}/messages',
            data={
                'body': 'Look at this poster',
                'attachmentMeta': '[{"durationSeconds": null}]',
                'attachments': SimpleUploadedFile('poster.png', b'poster-bytes', content_type='image/png'),
            },
        )
        self.assertEqual(original.status_code, 200)
        original_message_id = original.json()['message']['id']

        second_start = self.client.post(
            '/api/messages/conversations/start',
            data='{"targetUserId": %d}' % carol.id,
            content_type='application/json',
        )
        self.assertEqual(second_start.status_code, 200)
        forward_conversation_id = second_start.json()['conversation']['id']

        forwarded = self.client.post(
            f'/api/messages/messages/{original_message_id}/forward',
            data='{"conversationId": %d}' % forward_conversation_id,
            content_type='application/json',
        )
        self.assertEqual(forwarded.status_code, 200)
        payload = forwarded.json()['message']
        self.assertTrue(payload['isForwarded'])
        self.assertEqual(payload['forwardedFrom']['messageId'], original_message_id)
        self.assertEqual(len(payload['attachments']), 1)

        forwarded_message = DirectMessage.objects.exclude(id=original_message_id).get(id=payload['id'])
        self.assertEqual(forwarded_message.forwarded_from_id, original_message_id)
        self.assertEqual(forwarded_message.body, 'Look at this poster')
        self.assertEqual(forwarded_message.attachments.count(), 1)
