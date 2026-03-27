from django.contrib import admin

from .models import (
    ActivityNotification,
    DirectConversation,
    DirectMessage,
    DirectMessageAttachment,
    DirectMessageDeletion,
    Event,
    EventMedia,
    EventTicket,
    Follow,
    UserProfile,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "mobile", "gov_id_verified", "is_private")
    search_fields = ("user__username", "mobile")


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "following", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("follower__username", "following__username")


class EventMediaInline(admin.TabularInline):
    model = EventMedia
    extra = 0


@admin.register(Event)
class EventAdmin(admin.ModelAdmin):
    list_display = ("title", "host", "location_name", "status", "is_active", "created_at")
    list_filter = ("status", "is_active", "event_category")
    search_fields = ("title", "host__username", "location_name")
    inlines = [EventMediaInline]


@admin.register(EventTicket)
class EventTicketAdmin(admin.ModelAdmin):
    list_display = ("attendee", "event", "status", "booked_by", "paid_by", "group_code", "booked_at", "archived_at")
    list_filter = ("status",)
    search_fields = ("attendee__username", "booked_by__username", "paid_by__username", "event__title", "group_code")


@admin.register(ActivityNotification)
class ActivityNotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "actor", "activity_type", "is_read", "created_at")
    list_filter = ("activity_type", "is_read")
    search_fields = ("recipient__username", "actor__username", "title", "body")


class DirectMessageAttachmentInline(admin.TabularInline):
    model = DirectMessageAttachment
    extra = 0
    readonly_fields = ("attachment_type", "file_url", "original_name", "mime_type", "file_size", "duration_seconds", "created_at")
    can_delete = False


class DirectMessageDeletionInline(admin.TabularInline):
    model = DirectMessageDeletion
    extra = 0
    readonly_fields = ("user", "deleted_at")
    can_delete = False


class DirectMessageInline(admin.TabularInline):
    model = DirectMessage
    extra = 0
    readonly_fields = ("sender", "body", "edited_at", "unsent_at", "read_at", "created_at", "updated_at")
    can_delete = False


@admin.register(DirectConversation)
class DirectConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "user_one", "user_two", "updated_at", "created_at")
    search_fields = ("user_one__username", "user_two__username")
    inlines = [DirectMessageInline]


@admin.register(DirectMessage)
class DirectMessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "sender", "created_at", "edited_at", "unsent_at", "read_at")
    search_fields = ("sender__username", "body")
    inlines = [DirectMessageAttachmentInline, DirectMessageDeletionInline]


@admin.register(DirectMessageAttachment)
class DirectMessageAttachmentAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "attachment_type", "original_name", "file_size", "created_at")
    list_filter = ("attachment_type",)
    search_fields = ("original_name", "mime_type")


@admin.register(DirectMessageDeletion)
class DirectMessageDeletionAdmin(admin.ModelAdmin):
    list_display = ("id", "message", "user", "deleted_at")
    search_fields = ("user__username",)
