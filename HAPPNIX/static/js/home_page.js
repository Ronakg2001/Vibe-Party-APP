// --- State Management ---
const defaultAvatar = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop';
const bootConfigEl = document.getElementById('home-page-boot-config');
let bootConfig = {};
if (bootConfigEl) {
    try {
        bootConfig = JSON.parse(bootConfigEl.textContent || '{}');
    } catch (error) {
        bootConfig = {};
    }
}
const currentUsernameTemplate = bootConfig.currentUsername || 'party_alex';
const csrfTokenTemplate = bootConfig.csrfToken || '';
const currentAvatarTemplate = bootConfig.currentAvatarUrl || '';
const manifestDataTemplate = bootConfig.manifestData || {};
const state = {
    activeTab: 'home',
    myEventsTab: 'tickets',
    isEventMode: false,
    pendingEventMedia: [],
    pendingEventMediaPreviewUrls: [],
    pendingMediaIndex: 0,
    pendingSwipeStartX: 0,
    postMediaIndexes: {},
    postSwipeStartX: {},
    hostedMenuEventPostId: null,
    hostedPressTimerId: null,
    hostedSuppressClickPostId: null,
    ticketPressTimerId: null,
    ticketDeleteRevealId: null,
    uploadActivityItems: [],
    uploadActivitySeq: 0,
    currentUser: {
        id: null,
        username: currentUsernameTemplate,
        avatar: currentAvatarTemplate || defaultAvatar,
        fullName: currentUsernameTemplate,
        bio: '',
        isPrivate: false,
        govIdVerified: false,
        pendingFollowRequestsCount: 0
    },
    locationEnabled: true,
    customLocationName: '',
    detectedLocationName: '',
    userLocation: null,
    eventLocationPoint: null,
    nearbyRadiusKm: 30,
    nearbyEventPosts: [],
    liveNowPosts: [],
    hostedEventPosts: [],
    followingEventPosts: [],
    followingUserIds: [],
    posts: [],
    tickets: [],
    discoverQuery: '',
    discoverResults: [],
    discoverLoading: false,
    discoverSearchTimer: null,
    discoverHistory: [],
    followGraph: { type: 'followers', users: [], loading: false },
    notifications: [],
    notificationsLoading: false,
    unreadNotificationsCount: 0,
    activeDiscoverProfile: null,
    publicProfileEventPosts: {},
    settings: {
        followRequests: [],
        loading: false,
        savingPrivacy: false,
        processingRequestId: null
    },
    liveSync: {
        timerId: null,
        inFlight: false,
        intervalMs: 15000
    }
};
const loaderStartTs = Date.now();

function showStartupDebug(message) {
    const text = String(message || 'Unknown startup error.');
    let box = document.getElementById('startup-debug-box');
    if (!box) {
        box = document.createElement('div');
        box.id = 'startup-debug-box';
        box.style.position = 'fixed';
        box.style.top = '12px';
        box.style.left = '12px';
        box.style.right = '12px';
        box.style.zIndex = '10001';
        box.style.padding = '10px 12px';
        box.style.border = '1px solid rgba(248,113,113,0.45)';
        box.style.background = 'rgba(20,20,25,0.92)';
        box.style.color = '#fecaca';
        box.style.fontSize = '12px';
        box.style.lineHeight = '1.4';
        box.style.borderRadius = '12px';
        box.style.whiteSpace = 'pre-wrap';
        document.body.appendChild(box);
    }
    box.textContent = `Startup error: ${text}`;
}

const THEME_STORAGE_KEY = 'happnix-theme';
const DISCOVER_HISTORY_STORAGE_KEY = 'happnix-discover-history';
const SHARED_POSTS_STORAGE_KEY = 'happnix-shared-posts-v1';
const TICKETS_STORAGE_KEY = 'happnix-tickets-v1';

function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (_error) {
        return null;
    }
}

function getStoredDiscoverHistory() {
    try {
        const raw = localStorage.getItem(DISCOVER_HISTORY_STORAGE_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.filter((item) => String(item || '').trim()) : [];
    } catch (_error) {
        return [];
    }
}

function setStoredDiscoverHistory(items) {
    try {
        localStorage.setItem(DISCOVER_HISTORY_STORAGE_KEY, JSON.stringify((items || []).slice(0, 8)));
    } catch (_error) {
        // Ignore storage errors.
    }
}

function syncDiscoverHistory(items) {
    state.discoverHistory = (items || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
    setStoredDiscoverHistory(state.discoverHistory);
}

function addDiscoverHistoryItem(query) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return;
    const deduped = [trimmed, ...state.discoverHistory.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())];
    syncDiscoverHistory(deduped);
}

function removeDiscoverHistoryItem(query) {
    const trimmed = String(query || '').trim().toLowerCase();
    syncDiscoverHistory(state.discoverHistory.filter((item) => item.toLowerCase() !== trimmed));
}

function getStoredSharedPosts() {
    try {
        const raw = localStorage.getItem(SHARED_POSTS_STORAGE_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function setStoredSharedPosts(items) {
    try {
        localStorage.setItem(SHARED_POSTS_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (_error) {
        // Ignore storage errors.
    }
}

function normalizeStoredPost(post) {
    if (!post || post.isEvent) return null;
    const mediaUrls = Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0
        ? post.mediaUrls.filter(Boolean)
        : (post.mediaUrl ? [post.mediaUrl] : []);
    const mediaTypes = Array.isArray(post.mediaTypes) && post.mediaTypes.length === mediaUrls.length
        ? post.mediaTypes
        : mediaUrls.map((url) => (/\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(url || '') ? 'video' : 'image'));
    return {
        id: String(post.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        userId: Number(post.userId) || null,
        username: String(post.username || '').trim(),
        avatar: post.avatar || defaultAvatar,
        image: post.image || mediaUrls[0] || defaultAvatar,
        mediaUrl: post.mediaUrl || mediaUrls[0] || '',
        mediaType: post.mediaType || mediaTypes[0] || 'image',
        mediaUrls,
        mediaTypes,
        caption: String(post.caption || '').trim(),
        likes: Number(post.likes || 0),
        isEvent: false,
        linkedEventId: post.linkedEventId || null,
        linkedEventTitle: post.linkedEventTitle || '',
        createdAt: post.createdAt || new Date().toISOString()
    };
}

function dedupeStoredPosts(items) {
    const seen = new Map();
    (Array.isArray(items) ? items : []).forEach((post) => {
        if (!post) return;
        const key = JSON.stringify({
            userId: Number(post.userId || 0),
            username: String(post.username || '').trim().toLowerCase(),
            caption: String(post.caption || '').trim().toLowerCase(),
            mediaUrls: post.mediaUrls || [],
            linkedEventId: post.linkedEventId || ''
        });
        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, post);
            return;
        }
        const existingTs = new Date(existing.createdAt || 0).getTime();
        const nextTs = new Date(post.createdAt || 0).getTime();
        if (Number.isNaN(existingTs) || nextTs > existingTs) {
            seen.set(key, post);
        }
    });
    return Array.from(seen.values()).sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

function loadSharedPosts() {
    const normalizedPosts = getStoredSharedPosts()
        .map(normalizeStoredPost)
        .filter(Boolean);
    const dedupedPosts = dedupeStoredPosts(normalizedPosts);
    state.posts = dedupedPosts;
    setStoredSharedPosts(dedupedPosts);
}

function persistSharedPost(post) {
    const normalized = normalizeStoredPost(post);
    if (!normalized) return;
    const normalizedCaption = String(normalized.caption || '').trim().toLowerCase();
    const normalizedMedia = JSON.stringify(normalized.mediaUrls || []);
    const recentMatchWindowMs = 15000;
    const nextPosts = [
        normalized,
        ...getStoredSharedPosts()
            .map(normalizeStoredPost)
            .filter((item) => {
                if (!item) return false;
                if (item.id === normalized.id) return false;
                const sameUser = Number(item.userId || 0) === Number(normalized.userId || 0);
                const sameCaption = String(item.caption || '').trim().toLowerCase() == normalizedCaption;
                const sameMedia = JSON.stringify(item.mediaUrls || []) === normalizedMedia;
                const createdGap = Math.abs(new Date(item.createdAt || 0).getTime() - new Date(normalized.createdAt || 0).getTime());
                if (sameUser && sameCaption && sameMedia && createdGap <= recentMatchWindowMs) {
                    return false;
                }
                return true;
            })
    ];
    setStoredSharedPosts(nextPosts);
    loadSharedPosts();
}

function getStoredTickets() {
    try {
        const raw = localStorage.getItem(TICKETS_STORAGE_KEY);
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
        return [];
    }
}

function setStoredTickets(items) {
    try {
        localStorage.setItem(TICKETS_STORAGE_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (_error) {
        // Ignore storage errors.
    }
}

function normalizeStoredTicket(ticket) {
    if (!ticket || !ticket.event) return null;
    const event = ticket.event;
    const eventDetails = event.eventDetails || {};
    const normalizedEvent = event.isEvent ? event : serverEventToPost(event);
    return {
        id: String(ticket.id || `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        userId: Number(ticket.userId || state.currentUser.id || 0) || null,
        username: String(ticket.username || state.currentUser.username || '').trim(),
        qty: Math.max(1, Number(ticket.qty || 1)),
        status: ticket.status === 'cancelled' ? 'cancelled' : 'active',
        createdAt: ticket.createdAt || new Date().toISOString(),
        cancelledAt: ticket.cancelledAt || null,
        event: {
            ...normalizedEvent,
            id: String(normalizedEvent.id || event.id || ''),
            image: normalizedEvent.image || defaultAvatar,
            eventDetails: {
                ...(normalizedEvent.eventDetails || {}),
                ...eventDetails,
                title: String((normalizedEvent.eventDetails || {}).title || eventDetails.title || event.title || 'Untitled event').trim(),
                date: String((normalizedEvent.eventDetails || {}).date || eventDetails.date || eventDetails.startLabel || 'Date TBD').trim(),
                startLabel: String((normalizedEvent.eventDetails || {}).startLabel || eventDetails.startLabel || eventDetails.date || '').trim(),
                endLabel: String((normalizedEvent.eventDetails || {}).endLabel || eventDetails.endLabel || '').trim()
            }
        }
    };
}

function loadStoredTickets() {
    state.tickets = getStoredTickets()
        .map(normalizeStoredTicket)
        .filter(Boolean)
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
    setStoredTickets(state.tickets);
}

async function loadTickets() {
    try {
        const data = await getJson('/api/tickets');
        state.tickets = (data.tickets || [])
            .map(normalizeStoredTicket)
            .filter(Boolean)
            .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
        setStoredTickets(state.tickets);
    } catch (_error) {
        loadStoredTickets();
    }
    renderTicketList();
}

function persistTickets() {
    setStoredTickets(state.tickets);
}

function getActiveTicketForEvent(eventId) {
    const safeEventId = String(eventId || '');
    const currentUserId = Number(state.currentUser.id || 0);
    const currentUsername = String(state.currentUser.username || '').trim().toLowerCase();
    return (state.tickets || []).find((ticket) => {
        if (!ticket || ticket.status === 'cancelled') return false;
        if (String(ticket.event?.id || '') !== safeEventId) return false;
        const ticketUserId = Number(ticket.userId || 0);
        const ticketUsername = String(ticket.username || '').trim().toLowerCase();
        if (currentUserId > 0 && ticketUserId > 0) return ticketUserId === currentUserId;
        return currentUsername && ticketUsername === currentUsername;
    }) || null;
}

function hasActiveTicketForEvent(eventId) {
    return !!getActiveTicketForEvent(eventId);
}

function isTicketExpired(ticket) {
    return !!ticket?.isExpired || (ticket?.status === 'active' && isEventEndedFromDetails(ticket?.event?.eventDetails));
}

function canDeleteTicket(ticket) {
    return !!ticket && (ticket.status === 'cancelled' || isTicketExpired(ticket));
}

function canArchiveTicket(ticket) {
    return !!ticket && ticket.status === 'active' && isTicketExpired(ticket);
}

async function archiveTicket(ticketId) {
    const safeTicketId = String(ticketId || '');
    const ticket = (state.tickets || []).find((entry) => String(entry.id) === safeTicketId);
    if (!ticket) return;
    try {
        await postJson(`/api/tickets/${safeTicketId}/archive`, {});
        state.tickets = state.tickets.filter((entry) => String(entry.id) !== safeTicketId);
        state.ticketDeleteRevealId = null;
        persistTickets();
        renderTicketList();
        setLocationStatus('Ticket archived.');
    } catch (error) {
        setLocationStatus(error.message || 'Failed to archive ticket.', true);
    }
}

async function deleteTicket(ticketId) {
    const safeTicketId = String(ticketId || '');
    const ticket = (state.tickets || []).find((entry) => String(entry.id) === safeTicketId);
    if (!ticket) return;

    const applyLocalDelete = () => {
        state.tickets = state.tickets.filter((entry) => String(entry.id) !== safeTicketId);
        state.ticketDeleteRevealId = null;
        persistTickets();
        renderTicketList();
        setLocationStatus('Ticket deleted.');
    };

    const numericTicketId = Number(safeTicketId);
    if (!Number.isFinite(numericTicketId) || numericTicketId <= 0) {
        applyLocalDelete();
        return;
    }

    try {
        await fetch(`/api/tickets/${numericTicketId}/delete`, {
            method: 'DELETE',
            headers: { 'X-CSRFToken': getCsrfToken() },
            credentials: 'same-origin'
        }).then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || 'Request failed.');
            return data;
        });
        applyLocalDelete();
    } catch (error) {
        const message = String(error?.message || '');
        if (message.toLowerCase().includes('ticket not found')) {
            applyLocalDelete();
            return;
        }
        setLocationStatus(error.message || 'Failed to delete ticket.', true);
    }
}

async function cancelTicket(ticketId) {
    const safeTicketId = String(ticketId || '');
    const ticket = (state.tickets || []).find((entry) => String(entry.id) === safeTicketId);
    if (!ticket || ticket.status === 'cancelled') return;

    const applyLocalCancel = () => {
        state.tickets = state.tickets.map((entry) => {
            if (String(entry.id) !== safeTicketId) return entry;
            return {
                ...entry,
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            };
        });
        persistTickets();
        renderTicketList();
        if (currentBookingEventId && String(ticket.event?.id || '') === String(currentBookingEventId)) {
            openBookingModal(currentBookingEventId);
        }
        setLocationStatus('Ticket cancelled. You can join this party again now.');
    };

    const numericTicketId = Number(safeTicketId);
    if (!Number.isFinite(numericTicketId) || numericTicketId <= 0) {
        applyLocalCancel();
        return;
    }

    try {
        const data = await postJson(`/api/tickets/${numericTicketId}/cancel`, {});
        const nextTicket = normalizeStoredTicket(data.ticket);
        state.tickets = state.tickets.map((entry) => String(entry.id) === safeTicketId ? nextTicket : entry);
        persistTickets();
        renderTicketList();
        if (currentBookingEventId && String(ticket.event?.id || '') === String(currentBookingEventId)) {
            openBookingModal(currentBookingEventId);
        }
        setLocationStatus('Ticket cancelled. You can join this party again now.');
    } catch (error) {
        const message = String(error?.message || '');
        if (message.toLowerCase().includes('ticket not found')) {
            applyLocalCancel();
            return;
        }
        setLocationStatus(error.message || 'Failed to cancel ticket.', true);
    }
}

function getSocialFeedUserIds() {
    const ids = new Set();
    const currentUserId = Number(state.currentUser.id || 0);
    if (currentUserId > 0) ids.add(currentUserId);
    (state.followingUserIds || []).forEach((userId) => {
        const safeUserId = Number(userId || 0);
        if (safeUserId > 0) ids.add(safeUserId);
    });
    return ids;
}

function isSocialFeedPost(post) {
    if (!post) return false;
    const socialIds = getSocialFeedUserIds();
    const postUserId = Number(post.userId || 0);
    if (postUserId > 0 && socialIds.has(postUserId)) return true;
    if (post.username && String(post.username) === String(state.currentUser.username || '')) return true;
    return false;
}

function hydrateProfileFeedPosts(profile, eventPosts) {
    const safeProfile = profile || {};
    const safeUserId = Number(safeProfile.sql_user_id || 0);
    const safeUsername = String(safeProfile.username || '').trim();
    const avatar = safeProfile.profile_picture_url || defaultAvatar;
    const userPosts = (state.posts || [])
        .filter((post) => (safeUserId > 0 && Number(post.userId || 0) === safeUserId) || (safeUsername && post.username === safeUsername))
        .map((post) => ({ ...post, avatar: post.avatar || avatar }));
    return [...(Array.isArray(eventPosts) ? eventPosts : []), ...userPosts]
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

async function refreshFollowingFeed() {
    if (!state.currentUser.id) return;
    loadSharedPosts();
    try {
        const graph = await getJson('/api/profile/following');
        const users = Array.isArray(graph?.users) ? graph.users : [];
        state.followingUserIds = users
            .map((user) => Number(user.sql_user_id || 0))
            .filter((userId) => Number.isFinite(userId) && userId > 0);

        const profileResponses = await Promise.all(
            state.followingUserIds.map(async (userId) => {
                try {
                    const data = await getJson(`/api/users/${userId}/profile`);
                    return data?.profile || null;
                } catch (_error) {
                    return null;
                }
            })
        );

        state.followingEventPosts = profileResponses.flatMap((profile) => {
            if (!profile) return [];
            const avatar = profile.profile_picture_url || defaultAvatar;
            const eventPosts = Array.isArray(profile.hosted_events)
                ? profile.hosted_events.map((event) => serverEventToPost({ ...event, hostAvatarUrl: avatar }))
                : [];
            state.publicProfileEventPosts[profile.sql_user_id] = hydrateProfileFeedPosts(profile, eventPosts);
            return eventPosts;
        });
    } catch (_error) {
        state.followingUserIds = [];
        state.followingEventPosts = [];
    }
    renderFeed();
    renderProfileGrid();
}

function updateDiscoverSearchClearButton() {
    const clearBtn = document.getElementById('discover-search-clear');
    if (!clearBtn) return;
    const hasQuery = !!String(state.discoverQuery || '').trim();
    clearBtn.classList.toggle('hidden', !hasQuery);
    clearBtn.classList.toggle('inline-flex', hasQuery);
}

function setDiscoverSearchValue(value, options = {}) {
    const nextValue = String(value || '');
    state.discoverQuery = nextValue;
    const input = document.getElementById('discover-search-input');
    if (input && input.value !== nextValue) {
        input.value = nextValue;
    }
    updateDiscoverSearchClearButton();
    if (options.render !== false) {
        renderExplore();
    }
}

function clearDiscoverSearch() {
    if (state.discoverSearchTimer) {
        clearTimeout(state.discoverSearchTimer);
    }
    state.discoverLoading = false;
    state.discoverResults = [];
    setDiscoverSearchValue('');
}

function setStoredTheme(value) {
    try {
        localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch (_error) {
        // Ignore storage errors.
    }
}

function getPreferredTheme() {
    const stored = getStoredTheme();
    if (stored === 'light' || stored === 'dark') {
        return stored;
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}

function updateThemeToggleUi(isLight) {
    const buttons = document.querySelectorAll('[data-theme-toggle]');
    const nextLabel = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    const icon = isLight ? 'moon' : 'sun';
    buttons.forEach((button) => {
        button.setAttribute('aria-label', nextLabel);
        button.innerHTML = `<i data-lucide="${icon}" class="w-5 h-5"></i>`;
    });
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function applyTheme(theme, options = {}) {
    const nextTheme = theme === 'light' ? 'light' : 'dark';
    const isLight = nextTheme === 'light';
    document.body.classList.toggle('theme-light', isLight);
    updateThemeToggleUi(isLight);
    if (options.persist) {
        setStoredTheme(nextTheme);
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getCsrfToken() {
    if (csrfTokenTemplate && csrfTokenTemplate !== "NOTPROVIDED") {
        return csrfTokenTemplate;
    }
    const value = `; ${document.cookie}`;
    const parts = value.split(`; csrftoken=`);
    if (parts.length === 2) {
        return parts.pop().split(';').shift();
    }
    return '';
}

async function getJson(url) {
    const response = await fetch(url, { credentials: 'same-origin' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }
    return data;
}

async function postJson(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        credentials: 'same-origin',
        body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }
    return data;
}

function renderCurrentUserProfile() {
    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-display-name');
    const handleEl = document.getElementById('profile-handle');
    const bioEl = document.getElementById('profile-bio');

    if (avatarEl) avatarEl.src = state.currentUser.avatar || defaultAvatar;
    if (nameEl) nameEl.textContent = state.currentUser.fullName || state.currentUser.username;
    if (handleEl) handleEl.textContent = `@${state.currentUser.username || ''}`;
    if (bioEl) bioEl.textContent = state.currentUser.bio || 'No bio added yet.';
}

async function postFormData(url, formData) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCsrfToken()
        },
        credentials: 'same-origin',
        body: formData
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }
    return data;
}

async function deleteJson(url) {
    const response = await fetch(url, {
        method: 'DELETE',
        headers: {
            'X-CSRFToken': getCsrfToken()
        },
        credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.message || 'Request failed.');
    }
    return data;
}

function renderUploadActivity() {
    const container = document.getElementById('upload-activity');
    if (!container) return;
    if (state.uploadActivityItems.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = state.uploadActivityItems.map((item) => `
        <div class="mb-2 rounded-xl border border-white/10 bg-slate-800/70 p-3">
            <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-white">${item.label}</span>
                <span class="text-[11px] ${item.status === 'error' ? 'text-rose-300' : item.status === 'done' ? 'text-emerald-300' : 'text-gray-300'}">${Math.round(item.progress)}%</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div class="h-full ${item.status === 'error' ? 'bg-rose-500' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600'} transition-all duration-300" style="width:${Math.max(2, Math.min(100, item.progress))}%"></div>
            </div>
        </div>
    `).join('');
}

function startUploadActivity(label) {
    const id = `upload-${Date.now()}-${++state.uploadActivitySeq}`;
    const item = { id, label, progress: 5, status: 'uploading', timerId: null };
    item.timerId = setInterval(() => {
        if (item.progress < 92) {
            item.progress = Math.min(92, item.progress + (Math.random() * 9));
            renderUploadActivity();
        }
    }, 260);
    state.uploadActivityItems.unshift(item);
    renderUploadActivity();
    return id;
}

function finishUploadActivity(id, success = true) {
    const item = state.uploadActivityItems.find((entry) => entry.id === id);
    if (!item) return;
    if (item.timerId) {
        clearInterval(item.timerId);
        item.timerId = null;
    }
    item.progress = success ? 100 : Math.min(item.progress, 100);
    item.status = success ? 'done' : 'error';
    renderUploadActivity();
    setTimeout(() => {
        state.uploadActivityItems = state.uploadActivityItems.filter((entry) => entry.id !== id);
        renderUploadActivity();
    }, success ? 1200 : 2200);
}

function getHostedEvents() {
    return state.hostedEventPosts;
}

function parseEventDate(value) {
    if (!value) return null;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed;
    }
    const normalized = String(value).trim().replace(' ', 'T');
    const retry = new Date(normalized);
    return Number.isNaN(retry.getTime()) ? null : retry;
}

function getEventStartDate(eventDetails) {
    return parseEventDate(eventDetails?.startLabel) || parseEventDate(eventDetails?.date) || parseEventDate(eventDetails?.startAt);
}

function getEventEndDate(eventDetails) {
    return parseEventDate(eventDetails?.endLabel) || parseEventDate(eventDetails?.endAt);
}

function isEventEndedFromDetails(eventDetails) {
    if (!eventDetails) return false;
    if (eventDetails.isEnded === true) return true;
    const endDate = getEventEndDate(eventDetails);
    return !!(endDate && endDate.getTime() <= Date.now());
}

function isEventLiveNow(eventDetails) {
    if (!eventDetails || isEventEndedFromDetails(eventDetails)) return false;
    const now = Date.now();
    const startDate = getEventStartDate(eventDetails);
    const endDate = getEventEndDate(eventDetails);
    if (startDate && endDate) {
        return startDate.getTime() <= now && endDate.getTime() > now;
    }
    if (startDate) {
        const today = new Date(now);
        return startDate.toDateString() === today.toDateString() && startDate.getTime() <= now;
    }
    return false;
}

function getLiveNowEvents() {
    const seen = new Set();
    const primary = Array.isArray(state.liveNowPosts) && state.liveNowPosts.length > 0
        ? state.liveNowPosts
        : [
            ...(state.hostedEventPosts || []),
            ...(state.nearbyEventPosts || []),
            ...(state.followingEventPosts || [])
        ];
    return primary.filter((post) => {
        if (!post?.isEvent || !isEventLiveNow(post.eventDetails)) return false;
        const key = String(post.id || '');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((left, right) => {
        const leftStart = getEventStartDate(left?.eventDetails)?.getTime() || 0;
        const rightStart = getEventStartDate(right?.eventDetails)?.getTime() || 0;
        return leftStart - rightStart;
    });
}

function getEventMonthDay(eventDetails) {
    const startDate = getEventStartDate(eventDetails);
    if (!startDate) {
        return { month: 'TBD', day: '--' };
    }
    return {
        month: startDate.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
        day: String(startDate.getDate()).padStart(2, '0')
    };
}

function updateNotificationBadges() {
    const dots = [document.getElementById('mobile-notification-dot'), document.getElementById('desktop-notification-dot')];
    const count = Number(state.unreadNotificationsCount || 0);
    dots.forEach((dot) => {
        if (!dot) return;
        const show = count > 0;
        dot.classList.toggle('hidden', !show);
        dot.classList.toggle('inline-flex', show);
        dot.textContent = count > 9 ? '9+' : String(count || '');
    });
}

function formatNotificationTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return 'Just now';
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.max(0, Math.round(diffMs / 60000));
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString();
}

function renderNotificationsList() {
    const listEl = document.getElementById('notifications-list');
    if (!listEl) return;
    if (state.notificationsLoading) {
        listEl.innerHTML = '<div class="py-12 text-center text-sm text-gray-400">Loading notifications...</div>';
        return;
    }
    const items = Array.isArray(state.notifications) ? state.notifications : [];
    if (items.length === 0) {
        listEl.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">No notifications yet.</div>';
        return;
    }
    listEl.innerHTML = items.map((item) => {
        const actorName = escapeHtml(item.actor_full_name || item.actor_username || 'Someone');
        const actorHandle = escapeHtml(item.actor_username ? `@${item.actor_username}` : '');
        const avatar = escapeHtml(item.actor_profile_picture_url || defaultAvatar);
        const title = escapeHtml(item.title || 'Activity');
        const body = escapeHtml(item.body || '');
        return `
            <article class="rounded-2xl border ${item.is_read ? 'border-white/10 bg-white/[0.03]' : 'border-fuchsia-400/20 bg-fuchsia-500/[0.08]'} px-4 py-4 shadow-lg shadow-black/10 ${item.actor_sql_user_id ? 'cursor-pointer' : ''}" ${item.actor_sql_user_id ? `data-action="open-discover-profile" data-user-id="${item.actor_sql_user_id}"` : ''}>
                <div class="flex items-start gap-3">
                    <img src="${avatar}" alt="${actorName}" class="h-12 w-12 rounded-2xl object-cover bg-slate-800">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <div class="text-sm font-bold text-white">${title}</div>
                                <div class="text-xs text-gray-500">${actorHandle}</div>
                            </div>
                            <div class="text-[11px] text-gray-500">${formatNotificationTime(item.created_at)}</div>
                        </div>
                        <p class="mt-2 text-sm leading-6 text-gray-300">${body}</p>
                    </div>
                </div>
            </article>`;
    }).join('');
}

function renderSettingsPrivacyState() {
    const toggleEl = document.getElementById('settings-privacy-toggle');
    const copyEl = document.getElementById('settings-privacy-copy');
    if (!toggleEl || !copyEl) return;
    const isPrivate = !!state.currentUser.isPrivate;
    toggleEl.textContent = state.settings.savingPrivacy ? 'Saving' : (isPrivate ? 'Private' : 'Public');
    toggleEl.className = `inline-flex min-w-[118px] items-center justify-center rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] transition-colors ${isPrivate ? 'border-amber-400/30 bg-amber-500/15 text-amber-200' : 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200'}`;
    if (state.settings.savingPrivacy) {
        toggleEl.classList.add('opacity-70', 'pointer-events-none');
    }
    copyEl.textContent = isPrivate
        ? 'Only approved followers can view your posts and events. New followers must send a request.'
        : 'Anyone can follow you instantly and view your posts and events.';
}

function renderSettingsFollowRequests() {
    const countEl = document.getElementById('settings-follow-requests-count');
    const listEl = document.getElementById('settings-follow-requests-list');
    if (!countEl || !listEl) return;
    const requests = Array.isArray(state.settings.followRequests) ? state.settings.followRequests : [];
    countEl.textContent = String(requests.length);
    if (!state.currentUser.isPrivate) {
        listEl.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">Turn on Private Account to review follow requests here.</div>';
        return;
    }
    if (state.settings.loading) {
        listEl.innerHTML = '<div class="py-10 text-center text-sm text-gray-400">Loading follow requests...</div>';
        return;
    }
    if (requests.length === 0) {
        listEl.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">No pending follow requests.</div>';
        return;
    }
    listEl.innerHTML = requests.map((user) => {
        const isBusy = Number(state.settings.processingRequestId || 0) === Number(user.sql_user_id || 0);
        return `
            <article class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-lg shadow-black/10">
                <div class="flex items-center gap-3">
                    <img src="${escapeHtml(user.profile_picture_url || defaultAvatar)}" alt="${escapeHtml(user.full_name || user.username || 'User')}" class="h-14 w-14 rounded-2xl object-cover bg-slate-800">
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-bold text-white">${escapeHtml(user.full_name || user.username || 'Unknown user')}</div>
                        <div class="truncate text-sm text-gray-400">${escapeHtml(user.username ? `@${user.username}` : '')}</div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" data-action="handle-follow-request" data-requester-id="${user.sql_user_id}" data-request-action="approve" class="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 ${isBusy ? 'pointer-events-none opacity-60' : ''}">Accept</button>
                        <button type="button" data-action="handle-follow-request" data-requester-id="${user.sql_user_id}" data-request-action="deny" class="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200 ${isBusy ? 'pointer-events-none opacity-60' : ''}">Decline</button>
                    </div>
                </div>
            </article>`;
    }).join('');
}

function renderNotificationFollowRequests() {
    const countEl = document.getElementById('notifications-follow-requests-count');
    const listEl = document.getElementById('notifications-follow-requests-list');
    if (!countEl || !listEl) return;
    const requests = Array.isArray(state.settings.followRequests) ? state.settings.followRequests : [];
    countEl.textContent = String(requests.length);
    if (!state.currentUser.isPrivate) {
        listEl.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">Switch to a private account if you want follow requests to appear here.</div>';
        return;
    }
    if (state.settings.loading) {
        listEl.innerHTML = '<div class="py-10 text-center text-sm text-gray-400">Loading follow requests...</div>';
        return;
    }
    if (requests.length === 0) {
        listEl.innerHTML = '<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">No pending follow requests.</div>';
        return;
    }
    listEl.innerHTML = requests.map((user) => {
        const isBusy = Number(state.settings.processingRequestId || 0) === Number(user.sql_user_id || 0);
        return `
            <article class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-lg shadow-black/10">
                <div class="flex items-center gap-3">
                    <img src="${escapeHtml(user.profile_picture_url || defaultAvatar)}" alt="${escapeHtml(user.full_name || user.username || 'User')}" class="h-14 w-14 rounded-2xl object-cover bg-slate-800">
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-bold text-white">${escapeHtml(user.full_name || user.username || 'Unknown user')}</div>
                        <div class="truncate text-sm text-gray-400">${escapeHtml(user.username ? `@${user.username}` : '')}</div>
                    </div>
                    <div class="flex gap-2">
                        <button type="button" data-action="handle-follow-request" data-requester-id="${user.sql_user_id}" data-request-action="approve" class="rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 ${isBusy ? 'pointer-events-none opacity-60' : ''}">Accept</button>
                        <button type="button" data-action="handle-follow-request" data-requester-id="${user.sql_user_id}" data-request-action="deny" class="rounded-xl border border-rose-400/30 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-200 ${isBusy ? 'pointer-events-none opacity-60' : ''}">Decline</button>
                    </div>
                </div>
            </article>`;
    }).join('');
}

async function loadFollowRequests(options = {}) {
    if (!state.currentUser.isPrivate) {
        state.settings.followRequests = [];
        state.settings.loading = false;
        renderSettingsFollowRequests();
        renderNotificationFollowRequests();
        return;
    }
    if (!options.silent) {
        state.settings.loading = true;
        renderSettingsFollowRequests();
        renderNotificationFollowRequests();
    }
    try {
        const data = await getJson('/api/profile/follow-requests');
        state.settings.followRequests = Array.isArray(data?.requests) ? data.requests : [];
    } catch (_error) {
        state.settings.followRequests = [];
    } finally {
        state.settings.loading = false;
        renderSettingsFollowRequests();
    renderNotificationFollowRequests();
    }
}

async function updatePrivateAccountSetting(nextValue) {
    state.settings.savingPrivacy = true;
    renderSettingsPrivacyState();
    try {
        const data = await postJson('/api/profile/privacy', { isPrivate: !!nextValue });
        state.currentUser.isPrivate = !!data?.isPrivate;
        renderSettingsPrivacyState();
        await loadCurrentUserProfile();
        await loadFollowRequests();
        await refreshFollowingFeed();
    } catch (_error) {
        state.settings.savingPrivacy = false;
        renderSettingsPrivacyState();
        return;
    }
    state.settings.savingPrivacy = false;
    renderSettingsPrivacyState();
}

async function handleFollowRequestAction(requesterUserId, action) {
    const safeUserId = Number(requesterUserId || 0);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) return;
    state.settings.processingRequestId = safeUserId;
    renderSettingsFollowRequests();
    renderNotificationFollowRequests();
    try {
        const response = await postJson('/api/profile/follow-requests', { requesterUserId: safeUserId, action });
        state.settings.followRequests = state.settings.followRequests.filter((user) => Number(user.sql_user_id) !== safeUserId);
        state.currentUser.pendingFollowRequestsCount = Number(response?.pendingCount || 0);
        const followersEl = document.getElementById('profile-followers-count');
        if (followersEl && response?.followersCount !== undefined) followersEl.textContent = String(response.followersCount || 0);
        renderSettingsFollowRequests();
        renderNotificationFollowRequests();
        loadCurrentUserProfile();
    } catch (_error) {
        renderSettingsFollowRequests();
        renderNotificationFollowRequests();
    } finally {
        state.settings.processingRequestId = null;
        renderSettingsFollowRequests();
        renderNotificationFollowRequests();
    }
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const card = document.getElementById('settings-card');
    if (!modal || !card) return;
    renderSettingsPrivacyState();
    renderSettingsFollowRequests();
    renderNotificationFollowRequests();
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });
    loadFollowRequests();
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const card = document.getElementById('settings-card');
    if (!modal || !card) return;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

async function runLiveSyncTick(options = {}) {
    if (state.liveSync.inFlight) return;
    if (document.hidden && options.force !== true) return;
    if (!state.currentUser.id) return;
    state.liveSync.inFlight = true;
    try {
        await Promise.all([
            loadCurrentUserProfile(),
            loadNotifications({ silent: true }),
            loadFollowRequests({ silent: true }),
            refreshFollowingFeed()
        ]);
    } catch (_error) {
        // Ignore background sync failures and keep the current UI state.
    } finally {
        state.liveSync.inFlight = false;
    }
}

function startLiveSync() {
    if (state.liveSync.timerId) return;
    state.liveSync.timerId = window.setInterval(() => {
        runLiveSyncTick();
    }, state.liveSync.intervalMs);
}

function stopLiveSync() {
    if (!state.liveSync.timerId) return;
    clearInterval(state.liveSync.timerId);
    state.liveSync.timerId = null;
}

async function loadNotifications(options = {}) {
    if (!options.silent) {
        state.notificationsLoading = true;
        renderNotificationsList();
    }
    try {
        const data = await getJson('/api/notifications?limit=50');
        state.notifications = Array.isArray(data?.notifications) ? data.notifications : [];
        state.unreadNotificationsCount = Number(data?.unreadCount || 0);
        updateNotificationBadges();
        renderNotificationsList();
        if (options.markAsRead) {
            await postJson('/api/notifications', {});
            state.unreadNotificationsCount = 0;
            state.notifications = state.notifications.map((item) => ({ ...item, is_read: true }));
            updateNotificationBadges();
            renderNotificationsList();
        }
    } catch (_error) {
        state.notifications = [];
        renderNotificationsList();
    } finally {
        state.notificationsLoading = false;
        renderNotificationsList();
    }
}

async function openNotifications() {
    const modal = document.getElementById('notifications-modal');
    const card = document.getElementById('notifications-card');
    if (!modal || !card) return;
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });
    await Promise.all([loadNotifications({ markAsRead: true }), loadFollowRequests()]);
}


function closeNotifications() {
    const modal = document.getElementById('notifications-modal');
    const card = document.getElementById('notifications-card');
    if (!modal || !card) return;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

async function logActivity(payload) {
    try {
        await postJson('/api/notifications/activity', payload);
    } catch (_error) {
        // Ignore notification logging failures in the UI flow.
    }
}

function toggleLike(actionEl) {
    const article = actionEl.closest('[data-post-id]');
    const postId = article?.dataset?.postId;
    if (!postId) return;
    const post = getPostById(postId);
    if (!post) return;
    post.likes = Math.max(0, Number(post.likes || 0) + 1);
    renderFeed();
    if (post.userId && Number(post.userId) !== Number(state.currentUser.id || 0)) {
        logActivity({ activityType: 'like', recipientUserId: post.userId, postId: postId });
    }
}

async function loadCurrentUserProfile() {
    try {
        const data = await getJson('/api/profile/me');
        const profile = data?.profile || {};
        state.currentUser.id = profile.sql_user_id || state.currentUser.id;
        state.currentUser.username = profile.username || state.currentUser.username;
        state.currentUser.fullName = profile.full_name || state.currentUser.username;
        state.currentUser.bio = profile.bio || '';
        state.currentUser.avatar = profile.profile_picture_url || state.currentUser.avatar || defaultAvatar;
        state.currentUser.isPrivate = Boolean(profile.is_private);
        state.currentUser.govIdVerified = Boolean(profile.gov_id_verified);
        state.currentUser.pendingFollowRequestsCount = Number(profile.pending_follow_requests_count || 0);
        state.unreadNotificationsCount = Number(profile.unread_notifications_count || 0);
        updateNotificationBadges();
        const followersEl = document.getElementById('profile-followers-count');
        const followingEl = document.getElementById('profile-following-count');
        const privacyStatusEl = document.getElementById('profile-privacy-status');
        if (followersEl) followersEl.textContent = String(profile.followers_count || 0);
        if (followingEl) followingEl.textContent = String(profile.following_count || 0);
        if (privacyStatusEl) {
            privacyStatusEl.textContent = profile.is_private ? 'Private' : 'Public';
            privacyStatusEl.className = `text-sm font-bold ${profile.is_private ? 'text-amber-200' : 'text-emerald-200'}`;
        }
    } catch (error) {
        // Keep existing template-backed values if API fails.
    }
    renderCurrentUserProfile();
    renderProfileGrid();
    renderHostedEventList();
    renderSettingsPrivacyState();
    renderSettingsFollowRequests();
}

function getAllPosts() {
    const socialFeed = [
        ...(state.hostedEventPosts || []),
        ...(state.followingEventPosts || []),
        ...(state.posts || []).filter((post) => isSocialFeedPost(post))
    ];
    const fallbackFeed = socialFeed.length > 0 ? socialFeed : [...(state.hostedEventPosts || []), ...(state.nearbyEventPosts || [])];
    const seen = new Set();
    return fallbackFeed
        .filter((post) => {
            const key = post?.id || Math.random().toString(36);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

function getPostById(postId) {
    return getAllPosts().find((post) => post.id === postId);
}


function getLinkedEventMeta(post) {
    if (!post || post.isEvent || !post.linkedEventId) return null;
    const linkedEvent = getPostById(post.linkedEventId);
    if (!linkedEvent || !linkedEvent.eventDetails) return null;
    const phase = isEventEndedFromDetails(linkedEvent.eventDetails) ? 'after' : 'before';
    return {
        eventId: linkedEvent.id,
        title: linkedEvent.eventDetails.title || post.linkedEventTitle || 'Untitled Event',
        phase,
        label: phase === 'after' ? 'Post-event highlight' : 'Pre-event highlight'
    };
}

function getEventHighlightPosts(eventPostId) {
    const linkedPosts = state.posts.filter((post) => !post.isEvent && post.linkedEventId === eventPostId);
    return {
        before: linkedPosts.filter((post) => getLinkedEventMeta(post)?.phase === 'before'),
        after: linkedPosts.filter((post) => getLinkedEventMeta(post)?.phase === 'after')
    };
}

function getPostPreviewImage(post) {
    const items = getPostMediaItems(post);
    const firstImage = items.find((item) => item.type !== 'video');
    return firstImage?.url || post.image || defaultAvatar;
}

function renderLinkedPostBadge(post) {
    const meta = getLinkedEventMeta(post);
    if (!meta) return '';
    const palette = meta.phase === 'after'
        ? 'bg-rose-500/15 text-rose-200 border border-rose-400/30'
        : 'bg-cyan-500/15 text-cyan-100 border border-cyan-400/30';
    return `<div class="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] ${palette}">${meta.label} - ${meta.title}</div>`;
}

function renderEventHighlightsSection(title, posts, tone) {
    const isAfter = tone === 'after';
    const toneClass = isAfter
        ? 'border-rose-400/25 bg-rose-500/8 text-rose-100'
        : 'border-cyan-400/25 bg-cyan-500/8 text-cyan-100';
    const eyebrow = isAfter ? 'Unlocked after the event wraps.' : 'Live while the event is still running.';

    return `
        <section class="rounded-3xl border ${toneClass} p-4 space-y-3">
            <div class="flex items-center justify-between gap-3">
                <div>
                    <h4 class="text-sm font-black uppercase tracking-[0.18em]">${title}</h4>
                    <p class="text-[11px] text-gray-300 mt-1">${eyebrow}</p>
                </div>
                <span class="text-xs font-semibold text-white/80">${posts.length}</span>
            </div>
            ${posts.length > 0 ? `
            <div class="space-y-3">
                ${posts.map((post) => `
                <article class="rounded-2xl border border-white/10 bg-black/20 p-3 flex gap-3 items-start">
                    <img src="${getPostPreviewImage(post)}" class="w-16 h-16 rounded-2xl object-cover flex-shrink-0">
                    <div class="min-w-0 flex-1">
                        <div class="text-xs font-semibold text-white mb-1">${post.username}</div>
                        <p class="text-sm text-gray-200 leading-relaxed">${post.caption || 'Highlight added without a caption.'}</p>
                    </div>
                </article>
                `).join('')}
            </div>
            ` : `
            <div class="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-gray-400">
                No highlights here yet.
            </div>
            `}
        </section>
    `;
}

function setLocationStatus(message, isError = false) {
    const statusEl = document.getElementById('location-status');
    if (!statusEl) {
        if (isError && message) {
            alert(message);
        }
        return;
    }
    if (!isError) {
        statusEl.textContent = '';
        statusEl.classList.add('hidden');
        return;
    }
    statusEl.textContent = message;
    statusEl.className = 'text-xs text-rose-300';
    statusEl.classList.remove('hidden');
}

function getLocationLabel() {
    if (state.customLocationName) {
        return state.customLocationName;
    }
    if (state.detectedLocationName) {
        return state.detectedLocationName;
    }
    if (state.userLocation) {
        return `${state.userLocation.latitude.toFixed(2)}, ${state.userLocation.longitude.toFixed(2)}`;
    }
    return '--';
}

async function reverseGeocodeToLocality(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`);
        if (!response.ok) return '';
        const data = await response.json();
        const address = data.address || {};
        const city = address.city || address.town || address.village || '';
        const area = address.road || address.suburb || address.neighbourhood || address.city_district || '';
        const state = address.state || '';
        if (area && city) return `${area}, ${city}`;
        if (city && state) return `${city}, ${state}`;
        return area || city || state || '';
    } catch (error) {
        return '';
    }
}

function computeBoundingBox(lat, lng, radiusKm) {
    const earthRadiusKm = 6371.0;
    const latDelta = (radiusKm / earthRadiusKm) * (180 / Math.PI);
    const lngDelta = (radiusKm / earthRadiusKm) * (180 / Math.PI) / Math.cos((lat * Math.PI) / 180);
    return {
        north: lat + latDelta,
        south: lat - latDelta,
        east: lng + lngDelta,
        west: lng - lngDelta,
    };
}

let locationModalMap = null;
let locationModalMarker = null;
let locationModalSelectedCenter = null;
let locationModalSelectedBounds = null;
let locationModalSearchTimer = null;
let locationModalAbortController = null;
let locationModalContext = 'default';
const LOCATION_HOLD_MS = 550;
const locationHoldState = {
    activeButtonId: null,
    timerId: null,
    suppressTapButtonId: null
};

function getLocalityLabelFromAddress(address) {
    if (!address) return '';
    const city = address.city || address.town || address.village || '';
    const area = address.road || address.suburb || address.neighbourhood || address.city_district || '';
    const stateName = address.state || '';
    if (area && city) return `${area}, ${city}`;
    if (city && stateName) return `${city}, ${stateName}`;
    return area || city || stateName || '';
}

function updateLocationModalFromMap() {
    if (!locationModalMap) return;
    const center = locationModalMap.getCenter();
    const bounds = locationModalMap.getBounds();
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    locationModalSelectedCenter = { lat: center.lat, lng: center.lng };
    locationModalSelectedBounds = {
        north: ne.lat,
        east: ne.lng,
        south: sw.lat,
        west: sw.lng,
    };
}

function hideLocationModalSuggestions() {
    const el = document.getElementById('location-modal-suggestions');
    if (!el) return;
    el.innerHTML = '';
    el.classList.add('hidden');
}

function showLocationModalError(message) {
    const errorEl = document.getElementById('location-modal-error');
    if (!errorEl) return;
    if (!message) {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
        return;
    }
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

async function locationModalReverseGeocode(lat, lng) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`);
        if (!response.ok) return '';
        const data = await response.json();
        return getLocalityLabelFromAddress(data.address || {});
    } catch (error) {
        return '';
    }
}

async function locationModalSearch(text, limit = 5) {
    if (!text) return [];
    try {
        if (locationModalAbortController) {
            locationModalAbortController.abort();
        }
        locationModalAbortController = new AbortController();
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=in&limit=${limit}&q=${encodeURIComponent(text)}`,
            { signal: locationModalAbortController.signal }
        );
        if (!response.ok) return [];
        const data = await response.json();
        if (!Array.isArray(data)) return [];
        return data;
    } catch (error) {
        if (error.name !== 'AbortError') {
            showLocationModalError('Search failed. Try again.');
        }
        return [];
    }
}

function applyLocationModalResult(result) {
    if (!result || !locationModalMap || !locationModalMarker) return;
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const latLng = L.latLng(lat, lon);
    if (result.boundingbox && result.boundingbox.length === 4) {
        const south = Number(result.boundingbox[0]);
        const north = Number(result.boundingbox[1]);
        const west = Number(result.boundingbox[2]);
        const east = Number(result.boundingbox[3]);
        if ([south, north, west, east].every(Number.isFinite)) {
            locationModalMap.fitBounds([[south, west], [north, east]], { padding: [20, 20] });
        } else {
            locationModalMap.setView(latLng, 14);
        }
    } else {
        locationModalMap.setView(latLng, 14);
    }
    locationModalMarker.setLatLng(latLng);
    const label = getLocalityLabelFromAddress(result.address || {});
    if (label) {
        document.getElementById('location-modal-input').value = label;
    }
    updateLocationModalFromMap();
    hideLocationModalSuggestions();
}

function renderLocationModalSuggestions(results) {
    const el = document.getElementById('location-modal-suggestions');
    if (!el) return;
    if (!results || results.length === 0) {
        hideLocationModalSuggestions();
        return;
    }
    el.innerHTML = results.map((item, idx) => {
        const label = getLocalityLabelFromAddress(item.address || {}) || item.display_name;
        return `<button type="button" data-idx="${idx}" class="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"><div class="text-sm text-white">${label}</div><div class="text-[11px] text-gray-400 truncate">${item.display_name || ''}</div></button>`;
    }).join('');
    el.classList.remove('hidden');
    el.querySelectorAll('button[data-idx]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const idx = Number(btn.getAttribute('data-idx'));
            if (Number.isFinite(idx) && results[idx]) {
                applyLocationModalResult(results[idx]);
            }
        });
    });
}

function initLocationModalMap() {
    if (locationModalMap) return;
    const defaultCenter = [20.5937, 78.9629];
    const indiaBounds = [[6.0, 68.0], [37.6, 97.5]];
    locationModalMap = L.map('location-modal-map', {
        center: defaultCenter,
        zoom: 5,
        zoomControl: true,
        maxBounds: indiaBounds,
        maxBoundsViscosity: 1.0,
        minZoom: 5,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(locationModalMap);
    locationModalMarker = L.marker(defaultCenter, { draggable: true }).addTo(locationModalMap);
    locationModalMap.on('moveend', updateLocationModalFromMap);
    locationModalMap.on('click', async (event) => {
        if (!event.latlng) return;
        locationModalMarker.setLatLng(event.latlng);
        locationModalMap.panTo(event.latlng);
        updateLocationModalFromMap();
        const locality = await locationModalReverseGeocode(event.latlng.lat, event.latlng.lng);
        if (locality) {
            document.getElementById('location-modal-input').value = locality;
        }
        hideLocationModalSuggestions();
    });
    locationModalMarker.on('dragend', async () => {
        const p = locationModalMarker.getLatLng();
        if (!p) return;
        locationModalMap.panTo(p);
        updateLocationModalFromMap();
        const locality = await locationModalReverseGeocode(p.lat, p.lng);
        if (locality) {
            document.getElementById('location-modal-input').value = locality;
        }
        hideLocationModalSuggestions();
    });
    updateLocationModalFromMap();
}

function openLocationModal(context = 'default') {
    const modal = document.getElementById('location-modal');
    const card = document.getElementById('location-modal-card');
    if (!modal || !card) return;
    locationModalContext = context;
    initLocationModalMap();
    const input = document.getElementById('location-modal-input');
    if (input) {
        if (context === 'event') {
            const eventLocationInput = document.getElementById('event-location');
            input.value = (eventLocationInput?.value || '').trim() || state.detectedLocationName || '';
        } else {
            input.value = state.customLocationName || state.detectedLocationName || '';
        }
    }
    updateLocationModalMeta();
    showLocationModalError('');
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
        if (locationModalMap) {
            locationModalMap.invalidateSize();
        }
    }, 10);
}

function closeLocationModal() {
    const modal = document.getElementById('location-modal');
    const card = document.getElementById('location-modal-card');
    if (!modal || !card) return;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    hideLocationModalSuggestions();
    setTimeout(() => modal.classList.add('hidden'), 250);
}

function saveLocationModal() {
    const input = document.getElementById('location-modal-input');
    const value = (input?.value || '').trim();
    if (locationModalContext === 'event') {
        const eventLocationInput = document.getElementById('event-location');
        if (eventLocationInput) {
            eventLocationInput.value = value;
        }
        if (locationModalSelectedCenter) {
            state.eventLocationPoint = {
                latitude: Number(locationModalSelectedCenter.lat),
                longitude: Number(locationModalSelectedCenter.lng),
            };
        }
        closeLocationModal();
        return;
    }
    if (value) {
        localStorage.setItem('happnix_custom_location_name', value);
    } else {
        localStorage.removeItem('happnix_custom_location_name');
    }
    state.customLocationName = value;

    if (locationModalSelectedCenter) {
        localStorage.setItem('happnix_custom_location_center', JSON.stringify(locationModalSelectedCenter));
    }
    if (locationModalSelectedBounds) {
        localStorage.setItem('happnix_custom_location_bounds', JSON.stringify(locationModalSelectedBounds));
    }
    renderTopLocationUi();
    closeLocationModal();
}

function clearLocationModal() {
    if (locationModalContext === 'event') {
        const eventLocationInput = document.getElementById('event-location');
        if (eventLocationInput) {
            eventLocationInput.value = '';
        }
        state.eventLocationPoint = null;
        const input = document.getElementById('location-modal-input');
        if (input) input.value = '';
        hideLocationModalSuggestions();
        return;
    }
    localStorage.removeItem('happnix_custom_location_name');
    localStorage.removeItem('happnix_custom_location_center');
    localStorage.removeItem('happnix_custom_location_bounds');
    state.customLocationName = '';
    const input = document.getElementById('location-modal-input');
    if (input) input.value = '';
    hideLocationModalSuggestions();
    renderTopLocationUi();
}

function renderTopLocationUi() {
    const labelText = getLocationLabel();
    const desktopLabel = document.getElementById('desktop-location-display');
    if (desktopLabel) desktopLabel.textContent = labelText;

    ['mobile-location-btn', 'desktop-location-btn'].forEach((id) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.remove('loc-on', 'loc-liquid-off');
        btn.classList.add(state.locationEnabled ? 'loc-on' : 'loc-liquid-off');
    });
    const desktopLocationBtn = document.getElementById('desktop-location-btn');
    if (desktopLocationBtn) {
        desktopLocationBtn.title = state.detectedLocationName
            ? `Location: ${state.detectedLocationName}`
            : `Location: ${state.locationEnabled ? 'On' : 'Off'}`;
    }
    updateLocationModalMeta();
}

function animateLocationToggleButton(buttonId) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.classList.remove('icon-burst');
        void btn.offsetWidth;
        btn.classList.add('icon-burst');
        const icon = btn.querySelector('.location-nav-icon');
        if (icon) {
            icon.classList.remove('icon-fly');
            void icon.offsetWidth;
            icon.classList.add('icon-fly');
        }
    }
}

function setLocationEnabled(enabled) {
    if (state.locationEnabled === enabled) {
        renderTopLocationUi();
        return;
    }
    state.locationEnabled = enabled;
    renderTopLocationUi();

    if (enabled) {
        setLocationStatus('Location is ON. Detecting location...');
        detectUserLocationAndLoad();
    } else {
        state.userLocation = null;
        state.nearbyEventPosts = [];
        state.detectedLocationName = '';
        localStorage.removeItem('happnix_detected_location_name');
        renderFeed();
        setLocationStatus('Location is OFF. Nearby detection stopped.');
        renderTopLocationUi();
    }
}

function updateLocationModalMeta() {
    const detectedLabel = document.getElementById('location-modal-detected-inline');
    if (detectedLabel) {
        detectedLabel.textContent = state.detectedLocationName
            ? `Location: ${state.detectedLocationName}`
            : `Location: ${state.locationEnabled ? 'On' : 'Off'}`;
    }
    const track = document.getElementById('location-modal-enabled-track');
    const knob = document.getElementById('location-modal-enabled-knob');
    const text = document.getElementById('location-modal-enabled-text');
    if (track && knob && text) {
        const on = !!state.locationEnabled;
        track.classList.toggle('bg-[#d946ef]', on);
        track.classList.toggle('bg-[#5f6368]', !on);
        knob.classList.toggle('translate-x-0', !on);
        knob.classList.toggle('translate-x-5', on);
        text.textContent = on ? 'ON' : 'OFF';
        text.classList.toggle('text-pink-400', on);
        text.classList.toggle('text-gray-300', !on);
    }
}

function toggleLocationModalEnabled() {
    setLocationEnabled(!state.locationEnabled);
}

async function useDetectedLocationInModal() {
    if (!state.detectedLocationName) return;
    const input = document.getElementById('location-modal-input');
    if (input) {
        input.value = state.detectedLocationName;
    }
    if (state.userLocation && locationModalMap && locationModalMarker) {
        const latLng = L.latLng(state.userLocation.latitude, state.userLocation.longitude);
        locationModalMap.setView(latLng, 14);
        locationModalMarker.setLatLng(latLng);
        updateLocationModalFromMap();
        return;
    }
    const results = await locationModalSearch(state.detectedLocationName, 1);
    if (results.length > 0) {
        applyLocationModalResult(results[0]);
    }
}

function startLocationButtonHold(buttonId) {
    clearLocationButtonHold();
    locationHoldState.activeButtonId = buttonId;
    locationHoldState.timerId = window.setTimeout(() => {
        locationHoldState.suppressTapButtonId = buttonId;
        openLocationModal();
    }, LOCATION_HOLD_MS);
}

function clearLocationButtonHold() {
    if (locationHoldState.timerId) {
        clearTimeout(locationHoldState.timerId);
    }
    locationHoldState.activeButtonId = null;
    locationHoldState.timerId = null;
}

function handleLocationToggleTap(event, buttonId) {
    if (locationHoldState.suppressTapButtonId === buttonId) {
        event.preventDefault();
        locationHoldState.suppressTapButtonId = null;
        clearLocationButtonHold();
        return;
    }
    clearLocationButtonHold();
    setLocationEnabled(!state.locationEnabled);
    animateLocationToggleButton(buttonId);
}

function bindLocationButtonGestures(buttonId) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener('pointerdown', () => {
        btn.classList.add('is-pressing');
        startLocationButtonHold(buttonId);
    });
    btn.addEventListener('pointerup', () => {
        btn.classList.remove('is-pressing');
        clearLocationButtonHold();
    });
    btn.addEventListener('pointerleave', () => {
        btn.classList.remove('is-pressing');
        clearLocationButtonHold();
    });
    btn.addEventListener('pointercancel', () => {
        btn.classList.remove('is-pressing');
        clearLocationButtonHold();
    });
}

function serverEventToPost(eventData) {
    const mediaUrls = eventData.mediaUrls || [];
    const primaryUrl = mediaUrls[0] || eventData.imageUrl || '';
    const mediaTypeForUrl = (url) => (/\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(url || '') ? 'video' : 'image');
    const primaryIsVideo = mediaTypeForUrl(primaryUrl) === 'video';
    const fallbackPrice = Number(eventData.price) || 0;
    const ticketType = eventData.ticketType || (fallbackPrice > 0 ? 'Paid' : 'Free');
    let ticketTiers = Array.isArray(eventData.ticketTiers) ? eventData.ticketTiers : [];
    if (ticketType === 'Paid' && ticketTiers.length === 0) {
        ticketTiers = [{ name: 'General', price: fallbackPrice }];
    }
    const minTicketPrice = ticketType === 'Paid'
        ? Math.min(...ticketTiers.map((tier) => Number(tier.price) || 0))
        : 0;
    const details = {
        title: eventData.title,
        date: eventData.startLabel || 'Date TBD',
        startLabel: eventData.startLabel || '',
        startAt: eventData.startAt || null,
        endAt: eventData.endAt || null,
        endLabel: eventData.endLabel || '',
        location: eventData.locationName,
        price: minTicketPrice,
        mapUrl: eventData.mapUrl,
        distanceKm: eventData.distanceKm,
        eventType: eventData.eventCategory || 'local event',
        mediaCount: mediaUrls.length,
        ticketType,
        ticketTiers,
        isEnded: Boolean(eventData.isEnded),
        canBook: eventData.canBook !== false
    };
    details.isEnded = isEventEndedFromDetails(details);
    details.canBook = !details.isEnded && details.canBook;
    return {
        id: `event-${eventData.id}`,
        userId: eventData.userId || eventData.hostSqlUserId || null,
        username: eventData.hostUsername || 'host',
        avatar: eventData.hostAvatarUrl || defaultAvatar,
        image: eventData.imageUrl || primaryUrl || `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`,
        mediaType: primaryIsVideo ? 'video' : 'image',
        mediaUrl: primaryUrl || '',
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : (primaryUrl ? [primaryUrl] : []),
        mediaTypes: mediaUrls.length > 0 ? mediaUrls.map(mediaTypeForUrl) : (primaryUrl ? [mediaTypeForUrl(primaryUrl)] : []),
        caption: eventData.description || 'Live event nearby.',
        likes: 0,
        isEvent: true,
        createdAt: eventData.createdAt || eventData.updatedAt || new Date().toISOString(),
        eventDetails: details
    };
}

async function loadLiveNowEvents() {
    try {
        const data = await getJson('/api/events/live');
        state.liveNowPosts = (data.events || []).map(serverEventToPost);
    } catch (_error) {
        state.liveNowPosts = [];
    }
    renderLiveNow();
}


async function loadHostedEvents() {
    try {
        const data = await getJson('/api/events/mine');
        state.hostedEventPosts = (data.events || []).map((event) => serverEventToPost({
            ...event,
            hostAvatarUrl: state.currentUser.avatar || defaultAvatar
        }));
    } catch (error) {
        state.hostedEventPosts = [];
        setLocationStatus(error.message || 'Failed to load your hosted events.', true);
    }
    renderFeed();
    loadLiveNowEvents();
    renderHostedEventList();
    renderProfileGrid();
    if (typeof renderPostEventLinkOptions === 'function') renderPostEventLinkOptions();
    if (typeof updatePostLinkHelper === 'function') updatePostLinkHelper();
}

async function loadNearbyEvents() {
    if (!state.locationEnabled) {
        state.nearbyEventPosts = [];
        renderFeed();
        loadLiveNowEvents();
        setLocationStatus('Location is OFF. Turn it ON to auto-detect nearby events.');
        return;
    }
    if (!state.userLocation) {
        setLocationStatus('Waiting for location detection...');
        return;
    }
    const radiusKm = 30;
    state.nearbyRadiusKm = radiusKm;
    const bbox = computeBoundingBox(state.userLocation.latitude, state.userLocation.longitude, radiusKm);

    try {
        const data = await getJson(`/api/events/nearby?latitude=${state.userLocation.latitude}&longitude=${state.userLocation.longitude}&north=${bbox.north}&south=${bbox.south}&east=${bbox.east}&west=${bbox.west}&radiusKm=${radiusKm}`);
        state.nearbyEventPosts = (data.events || []).map(serverEventToPost);
        setLocationStatus(`Showing ${data.count || 0} nearby event(s) within ${radiusKm} km.`);
        renderFeed();
        loadLiveNowEvents();
        renderTopLocationUi();
    } catch (error) {
        setLocationStatus(error.message || 'Failed to load nearby events.', true);
    }
}

async function detectUserLocationAndLoad() {
    if (!state.locationEnabled) {
        state.nearbyEventPosts = [];
        renderFeed();
        loadLiveNowEvents();
        setLocationStatus('Location is OFF. Turn it ON to auto-detect nearby events.');
        return;
    }
    if (!navigator.geolocation) {
        setLocationStatus('Geolocation is not supported on this device.', true);
        return;
    }
    const isLocalHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (!window.isSecureContext && !isLocalHost) {
        setLocationStatus('Location needs HTTPS or localhost. Open app on http://localhost:8000 (same PC) or use an HTTPS tunnel.', true);
        return;
    }
    setLocationStatus('Detecting your location...');
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            state.userLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            const locality = await reverseGeocodeToLocality(state.userLocation.latitude, state.userLocation.longitude);
            state.detectedLocationName = locality || '';
            if (state.detectedLocationName) {
                localStorage.setItem('happnix_detected_location_name', state.detectedLocationName);
            }
            setLocationStatus('');
            renderTopLocationUi();
            await loadNearbyEvents();
        },
        (error) => {
            setLocationStatus(`Location access failed: ${error.message}`, true);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
}

function goToHomeTabAndRefresh() {
    window.location.href = "/home/?tab=home";
}

function handleLogout() {
    window.location.replace("/logout/");
}

function getInitialTabFromUrl() {
    const tab = new URLSearchParams(window.location.search).get("tab");
    const allowedTabs = ["home", "search", "add", "tickets", "profile"];
    if (tab && allowedTabs.includes(tab)) {
        return tab;
    }
    const dataTab = document.body?.dataset?.initialTab || '';
    if (dataTab && allowedTabs.includes(dataTab)) {
        return dataTab;
    }
    const storedTab = localStorage.getItem('happnix_active_tab');
    if (storedTab && allowedTabs.includes(storedTab)) {
        return storedTab;
    }
    return "home";
}

function hideLoaderWhenReady() {
    const loader = document.getElementById("party-loader");
    if (!loader || loader.classList.contains("is-hidden")) return;

    const minVisibleMs = 1200;
    const elapsed = Date.now() - loaderStartTs;
    const waitMs = Math.max(0, minVisibleMs - elapsed);

    window.setTimeout(function () {
        loader.classList.add("is-hidden");
        window.setTimeout(function () {
            loader.remove();
        }, 420);
    }, waitMs);
}

function refreshActiveTab() {
    const tabId = state.activeTab || getInitialTabFromUrl();
    if (tabId === 'home') {
        loadNearbyEvents();
        renderFeed();
        return;
    }
    if (tabId === 'search') {
        renderExplore();
        return;
    }
    if (tabId === 'tickets') {
        renderTicketList();
        renderHostedEventList();
        switchMyEventsTab(state.myEventsTab);
        return;
    }
    if (tabId === 'profile') {
        loadCurrentUserProfile();
    }
}

function initPullToRefresh() {
    const allowedTabs = ['home', 'search', 'tickets', 'profile'];
    let pullActive = false;
    let pullTriggered = false;
    let startY = 0;

    const isInteractiveTarget = (target) => {
        if (!target) return false;
        if (target.isContentEditable) return true;
        const tag = target.tagName?.toLowerCase();
        return ['input', 'textarea', 'select', 'button'].includes(tag);
    };

    const isAtTop = () => {
        const scroller = document.scrollingElement || document.documentElement;
        return (scroller?.scrollTop || 0) <= 0;
    };

    document.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1) return;
        if (!allowedTabs.includes(state.activeTab)) return;
        if (!isAtTop()) return;
        if (isInteractiveTarget(event.target)) return;
        pullActive = true;
        pullTriggered = false;
        startY = event.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchmove', (event) => {
        if (!pullActive || pullTriggered) return;
        const currentY = event.touches[0].clientY;
        const delta = currentY - startY;
        if (delta < 0) {
            pullActive = false;
            return;
        }
        if (delta > 0) {
            event.preventDefault();
        }
        if (delta > 90) {
            pullTriggered = true;
            refreshActiveTab();
        }
    }, { passive: false });

    document.addEventListener('touchend', () => {
        pullActive = false;
        pullTriggered = false;
        startY = 0;
    });
}

function setEventTypeValue(value) {
    const eventTypeSelect = document.getElementById('event-type');
    const eventTypeLabel = document.getElementById('event-type-label');
    const otherWrap = document.getElementById('event-type-other-wrap');
    const otherInput = document.getElementById('event-type-other');
    if (!eventTypeSelect || !eventTypeLabel) return;
    const safeValue = String(value || '').trim();
    eventTypeSelect.value = safeValue;
    eventTypeLabel.textContent = safeValue;
    const showOther = safeValue === 'Other';
    if (otherWrap) otherWrap.classList.toggle('hidden', !showOther);
    if (!showOther && otherInput) otherInput.value = '';
}

function closeEventTypeMenu() {
    const menuEl = document.getElementById('event-type-menu');
    const triggerEl = document.getElementById('event-type-trigger');
    if (!menuEl || !triggerEl) return;
    menuEl.classList.add('hidden');
    triggerEl.classList.remove('is-open');
}

function toggleEventTypeMenu() {
    const menuEl = document.getElementById('event-type-menu');
    const triggerEl = document.getElementById('event-type-trigger');
    if (!menuEl || !triggerEl || triggerEl.disabled) return;
    const willOpen = menuEl.classList.contains('hidden');
    menuEl.classList.toggle('hidden', !willOpen);
    triggerEl.classList.toggle('is-open', willOpen);
}

function renderEventCategoriesFromManifest() {
    const eventTypeSelect = document.getElementById('event-type');
    const eventTypeMenu = document.getElementById('event-type-menu');
    if (!eventTypeSelect) return;
    const categories = Array.isArray(manifestDataTemplate.event_category)
        ? manifestDataTemplate.event_category
            .map((item) => String(item || '').trim())
            .filter((item) => item.length > 0)
        : [];
    const finalCategoriesBase = categories.length > 0 ? categories : ['Local event'];
    const finalCategories = finalCategoriesBase.includes('Other')
        ? finalCategoriesBase
        : [...finalCategoriesBase, 'Other'];
    const currentValue = (eventTypeSelect.value || '').trim();
    eventTypeSelect.innerHTML = '';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Event type';
    eventTypeSelect.appendChild(placeholderOption);
    finalCategories.forEach((label) => {
        const optionEl = document.createElement('option');
        optionEl.value = label;
        optionEl.textContent = label;
        eventTypeSelect.appendChild(optionEl);
    });
    const selectedValue = (currentValue && finalCategories.includes(currentValue))
        ? currentValue
        : '';
    setEventTypeValue(selectedValue);

    if (eventTypeMenu) {
        eventTypeMenu.innerHTML = '';
        finalCategories.forEach((label) => {
            const itemBtn = document.createElement('button');
            itemBtn.type = 'button';
            itemBtn.className = 'event-type-item';
            itemBtn.textContent = label;
            itemBtn.addEventListener('click', () => {
                setEventTypeValue(label);
                closeEventTypeMenu();
            });
            eventTypeMenu.appendChild(itemBtn);
        });
    }
}

function formatInr(amount) {
    const value = Number(amount);
    const safeValue = Number.isFinite(value) ? value : 0;
    const hasFraction = Math.abs(safeValue % 1) > 0;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: hasFraction ? 2 : 0
    }).format(safeValue);
}

function legacy_formatTime12(hour12, minute, period) {
    const hh = String(hour12).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `${hh}:${mm} ${period}`;
}

function legacy_to24HourTime(hour12, minute, period) {
    let hour24 = hour12 % 12;
    if (period === 'PM') {
        hour24 += 12;
    }
    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function legacy_parse24HourTime(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
    if (!match) return null;
    const hour24 = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isInteger(hour24) || !Number.isInteger(minute) || hour24 < 0 || hour24 > 23 || minute < 0 || minute > 59) {
        return null;
    }
    const period = hour24 >= 12 ? 'PM' : 'AM';
    const hour12 = (hour24 % 12) || 12;
    return { hour12, minute, period };
}

function legacy_isFutureEventDateTime(dateValue, time24Value) {
    if (!dateValue || !time24Value) return false;
    const candidate = new Date(`${dateValue}T${time24Value}:00`);
    if (Number.isNaN(candidate.getTime())) return false;
    const now = new Date();
    now.setSeconds(0, 0);
    return candidate.getTime() >= now.getTime();
}

function legacy_stopAnalogLiveTicker() {
    if (analogLiveTickerId) {
        clearInterval(analogLiveTickerId);
        analogLiveTickerId = null;
    }
}

function legacy_startAnalogLiveTicker() {
    stopAnalogLiveTicker();
    analogLiveTickerId = setInterval(() => {
        if (!analogClockState.liveMode || !isAnalogModalOpen()) return;
        const now = new Date();
        const hour24 = now.getHours();
        analogClockState.period = hour24 >= 12 ? 'PM' : 'AM';
        analogClockState.hour = (hour24 % 12) || 12;
        analogClockState.minute = now.getMinutes();
        analogClockState.second = now.getSeconds();
        renderAnalogClockDial();
    }, 1000);
}

function legacy_isTodayEventDateSelected() {
    const selectedDate = document.getElementById('event-date')?.value || '';
    return selectedDate && selectedDate === getTodayDateKey();
}

function legacy_isAnalogCandidateAllowed(hour12, minute, period) {
    const candidateTime = to24HourTime(hour12, minute, period);
    if (isTodayEventDateSelected() && !isFutureEventDateTime(getTodayDateKey(), candidateTime)) {
        return false;
    }
    // If user is selecting end time, enforce duration window [30 min, 24 hr].
    if (analogClockState.targetInputId === 'event-end-time-display') {
        const startTime = document.getElementById('event-time')?.value || '';
        if (startTime) {
            const duration = calculateDurationMinutesFromTimes(startTime, candidateTime);
            if (duration === null) return false;
            if (duration < 30 || duration > 24 * 60) return false;
        }
    }
    return true;
}

function legacy_markManualAnalogSelection() {
    analogClockState.liveMode = false;
    analogClockState.second = 0;
    stopAnalogLiveTicker();
}

function legacy_getAnalogTargetHiddenInputId() {
    return analogClockState.targetInputId === 'event-end-time-display' ? 'event-end-time' : 'event-time';
}

function legacy_syncEventTimeInputs() {
    const hiddenTime = document.getElementById(getAnalogTargetHiddenInputId());
    const displayTime = document.getElementById(analogClockState.targetInputId || 'event-time-display');
    if (!displayTime) return;
    const time24 = to24HourTime(analogClockState.hour, analogClockState.minute, analogClockState.period);
    if (hiddenTime) hiddenTime.value = time24;
    displayTime.value = formatTime12(analogClockState.hour, analogClockState.minute, analogClockState.period);
    recalculateEventDurationFromTimes();
    syncEventTimeDependencyUi();
}

function legacy_time24ToMinutes(time24) {
    const parsed = parse24HourTime(time24);
    if (!parsed) return null;
    let hour24 = parsed.hour12 % 12;
    if (parsed.period === 'PM') hour24 += 12;
    return (hour24 * 60) + parsed.minute;
}

function legacy_calculateDurationMinutesFromTimes(startTime24, endTime24) {
    const startMin = time24ToMinutes(startTime24);
    const endMin = time24ToMinutes(endTime24);
    if (startMin === null || endMin === null) return null;
    let delta = endMin - startMin;
    if (delta <= 0) delta += 24 * 60;
    return delta;
}

function legacy_formatDurationMinutes(minutes) {
    const safe = Number(minutes);
    if (!Number.isFinite(safe) || safe <= 0) return '';
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
}

function legacy_parseDurationDisplayToMinutes(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return 0;

    if (/^\d+$/.test(raw)) {
        const minutesOnly = Number(raw);
        return Number.isFinite(minutesOnly) && minutesOnly > 0 ? minutesOnly : 0;
    }

    const compact = raw.replace(/\s+/g, '');
    const bothMatch = /^(\d+)h(?:ours?)?(\d+)m(?:in(?:ute)?s?)?$/.exec(compact);
    if (bothMatch) {
        const h = Number(bothMatch[1]);
        const m = Number(bothMatch[2]);
        const total = (h * 60) + m;
        return Number.isFinite(total) && total > 0 ? total : 0;
    }

    const hourMatch = /^(\d+)h(?:ours?)?$/.exec(compact);
    if (hourMatch) {
        const h = Number(hourMatch[1]);
        const total = h * 60;
        return Number.isFinite(total) && total > 0 ? total : 0;
    }

    const minMatch = /^(\d+)m(?:in(?:ute)?s?)?$/.exec(compact);
    if (minMatch) {
        const m = Number(minMatch[1]);
        return Number.isFinite(m) && m > 0 ? m : 0;
    }

    const clockMatch = /^(\d{1,2}):(\d{1,2})$/.exec(raw);
    if (clockMatch) {
        const h = Number(clockMatch[1]);
        const m = Number(clockMatch[2]);
        const total = (h * 60) + m;
        return Number.isFinite(total) && total > 0 ? total : 0;
    }

    return 0;
}

function legacy_syncDurationHiddenFromDisplay() {
    const durationDisplay = document.getElementById('event-duration-display');
    const durationHidden = document.getElementById('event-duration-minutes');
    if (!durationDisplay || !durationHidden) return;
    updateDurationClearButtonVisibility();
    if (durationDisplay.readOnly) return;
    const minutes = parseDurationDisplayToMinutes(durationDisplay.value);
    durationHidden.value = minutes > 0 ? String(minutes) : '';
    syncEventTimeDependencyUi();
}

function legacy_updateDurationClearButtonVisibility() {
    const durationDisplay = document.getElementById('event-duration-display');
    const clearBtn = document.getElementById('event-duration-clear-btn');
    if (!durationDisplay || !clearBtn) return;
    const show = !durationDisplay.disabled && !durationDisplay.readOnly && !!durationDisplay.value.trim();
    clearBtn.classList.toggle('hidden', !show);
}

function legacy_clearDurationSelection() {
    const isConfirmed = window.confirm("Are you sure you want to remove the duration?");
    if (!isConfirmed) {
        return; 
    }
    const durationDisplay = document.getElementById('event-duration-display');
    const durationHidden = document.getElementById('event-duration-minutes');
    if (durationDisplay) {
        durationDisplay.value = '';
        durationDisplay.readOnly = false;
    }
    if (durationHidden) durationHidden.value = '';
    updateDurationClearButtonVisibility();
    syncEventTimeDependencyUi();
}

function legacy_recalculateEventDurationFromTimes() {
    const startTime = document.getElementById('event-time')?.value || '';
    const endTime = document.getElementById('event-end-time')?.value || '';
    const durationHidden = document.getElementById('event-duration-minutes');
    const durationDisplay = document.getElementById('event-duration-display');
    if (!durationHidden || !durationDisplay) return;

    if (!endTime || !startTime) {
        durationDisplay.readOnly = false;
        syncDurationHiddenFromDisplay();
        return;
    }

    const delta = calculateDurationMinutesFromTimes(startTime, endTime);
    if (delta === null) {
        durationDisplay.readOnly = false;
        syncDurationHiddenFromDisplay();
        return;
    }
    durationHidden.value = String(delta);
    durationDisplay.value = formatDurationMinutes(delta);
    durationDisplay.readOnly = true;
}

function legacy_syncEventTimeDependencyUi() {
    const dateHidden = document.getElementById('event-date');
    const startDisplay = document.getElementById('event-time-display');
    const startHidden = document.getElementById('event-time');
    const advancedRow = document.getElementById('event-advanced-time-row');
    const timeChoiceHint = document.getElementById('event-time-choice-hint');
    const endDisplay = document.getElementById('event-end-time-display');
    const endHidden = document.getElementById('event-end-time');
    const durationDisplay = document.getElementById('event-duration-display');
    const durationHidden = document.getElementById('event-duration-minutes');
    if (!dateHidden || !startDisplay || !startHidden || !advancedRow || !endDisplay || !endHidden || !durationDisplay || !durationHidden) return;

    const hasDate = Boolean(dateHidden.value);
    startDisplay.disabled = !hasDate;
    if (!hasDate) {
        startDisplay.value = '';
        startHidden.value = '';
        endDisplay.value = '';
        endHidden.value = '';
        durationDisplay.value = '';
        durationHidden.value = '';
        durationDisplay.readOnly = false;
        advancedRow.classList.add('hidden');
        if (timeChoiceHint) timeChoiceHint.classList.add('hidden');
        return;
    }

    const hasStart = Boolean(startHidden.value);
    advancedRow.classList.toggle('hidden', !hasStart);
    if (timeChoiceHint) timeChoiceHint.classList.toggle('hidden', !hasStart);
    if (!hasStart) {
        endDisplay.value = '';
        endHidden.value = '';
        durationDisplay.value = '';
        durationHidden.value = '';
        durationDisplay.readOnly = false;
        endDisplay.disabled = true;
        durationDisplay.disabled = true;
        return;
    }

    const hasEnd = Boolean(endHidden.value);
    const manualDurationMinutes = parseDurationDisplayToMinutes(durationDisplay.value);
    const hasManualDuration = !hasEnd && manualDurationMinutes > 0;

    if (hasEnd) {
        endDisplay.disabled = false;
        durationDisplay.disabled = true;
        durationDisplay.readOnly = true;
    } else if (hasManualDuration) {
        endDisplay.disabled = true;
        durationDisplay.disabled = false;
        durationDisplay.readOnly = false;
        endHidden.value = '';
        endDisplay.value = '';
    } else {
        endDisplay.disabled = false;
        durationDisplay.disabled = false;
        durationDisplay.readOnly = false;
    }
    updateDurationClearButtonVisibility();
}

function legacy_setAnalogMode(mode) {
    analogClockState.mode = mode === 'minute' ? 'minute' : 'hour';
    analogClockState.focus = analogClockState.mode;
    renderAnalogClockDial();
}

function legacy_setAnalogPeriod(period) {
    if (!isAnalogCandidateAllowed(analogClockState.hour, analogClockState.minute, period === 'AM' ? 'AM' : 'PM')) {
        return;
    }
    markManualAnalogSelection();
    analogClockState.period = period === 'AM' ? 'AM' : 'PM';
    analogClockState.focus = 'period';
    renderAnalogClockDial();
}

function legacy_toggleAnalogPeriod() {
    setAnalogPeriod(analogClockState.period === 'AM' ? 'PM' : 'AM');
}

function legacy_getAnalogDialIndexFromPoint(clientX, clientY) {
    const dial = document.getElementById('analog-clock-dial');
    if (!dial) return 0;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angleDeg = (Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI + 90 + 360) % 360;
    return Math.round(angleDeg / 30) % 12;
}

function legacy_setAnalogValueFromDialIndex(index) {
    if (analogClockState.mode === 'hour') {
        const nextHour = analogHourDialOrder[index];
        if (!isAnalogCandidateAllowed(nextHour, analogClockState.minute, analogClockState.period)) return;
        markManualAnalogSelection();
        analogClockState.hour = nextHour;
    } else {
        const nextMinute = index * 5;
        if (!isAnalogCandidateAllowed(analogClockState.hour, nextMinute, analogClockState.period)) return;
        markManualAnalogSelection();
        analogClockState.minute = nextMinute;
    }
}

function legacy_adjustAnalogSelection(step) {
    if (analogClockState.focus === 'period') {
        const nextPeriod = analogClockState.period === 'AM' ? 'PM' : 'AM';
        if (!isAnalogCandidateAllowed(analogClockState.hour, analogClockState.minute, nextPeriod)) return;
        markManualAnalogSelection();
        analogClockState.period = nextPeriod;
        return;
    }
    if (analogClockState.focus === 'hour') {
        const currentIndex = analogHourDialOrder.indexOf(analogClockState.hour);
        for (let i = 1; i <= 12; i += 1) {
            const nextIndex = (currentIndex + (step * i) + 12 * 10) % 12;
            const nextHour = analogHourDialOrder[nextIndex];
            if (isAnalogCandidateAllowed(nextHour, analogClockState.minute, analogClockState.period)) {
                markManualAnalogSelection();
                analogClockState.hour = nextHour;
                break;
            }
        }
    } else {
        const currentIndex = Math.floor((analogClockState.minute % 60) / 5);
        for (let i = 1; i <= 12; i += 1) {
            const nextIndex = (currentIndex + (step * i) + 12 * 10) % 12;
            const nextMinute = nextIndex * 5;
            if (isAnalogCandidateAllowed(analogClockState.hour, nextMinute, analogClockState.period)) {
                markManualAnalogSelection();
                analogClockState.minute = nextMinute;
                break;
            }
        }
    }
}

function legacy_moveAnalogFocus(step) {
    const order = ['hour', 'minute', 'period'];
    const currentIndex = order.indexOf(analogClockState.focus);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + step + order.length) % order.length;
    analogClockState.focus = order[nextIndex];
    if (analogClockState.focus === 'hour' || analogClockState.focus === 'minute') {
        analogClockState.mode = analogClockState.focus;
    }
}

function legacy_isAnalogModalOpen() {
    const modal = document.getElementById('analog-time-modal');
    return !!modal && !modal.classList.contains('hidden');
}

function legacy_initAnalogClockInteractions() {
    const dial = document.getElementById('analog-clock-dial');
    if (!dial) return;

    dial.addEventListener('pointerdown', (event) => {
        analogDialDragging = true;
        setAnalogValueFromDialIndex(getAnalogDialIndexFromPoint(event.clientX, event.clientY));
        renderAnalogClockDial();
        event.preventDefault();
    });

    window.addEventListener('pointermove', (event) => {
        if (!analogDialDragging || !isAnalogModalOpen()) return;
        setAnalogValueFromDialIndex(getAnalogDialIndexFromPoint(event.clientX, event.clientY));
        renderAnalogClockDial();
    });

    window.addEventListener('pointerup', () => {
        analogDialDragging = false;
    });

    document.addEventListener('keydown', (event) => {
        if (!isAnalogModalOpen()) return;
        const isDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (!isDesktop) return;
        if (event.key === 'ArrowRight') {
            moveAnalogFocus(1);
            renderAnalogClockDial();
            event.preventDefault();
        } else if (event.key === 'ArrowLeft') {
            moveAnalogFocus(-1);
            renderAnalogClockDial();
            event.preventDefault();
        } else if (event.key === 'ArrowUp') {
            adjustAnalogSelection(1);
            renderAnalogClockDial();
            event.preventDefault();
        } else if (event.key === 'ArrowDown') {
            adjustAnalogSelection(-1);
            renderAnalogClockDial();
            event.preventDefault();
        } else if (event.key === 'Enter') {
            saveAnalogTimeSelection();
            event.preventDefault();
        } else if (event.key === 'Escape') {
            closeAnalogTimeModal();
            event.preventDefault();
        }
    });
}

function legacy_renderAnalogClockDial() {
    const dial = document.getElementById('analog-clock-dial');
    const hand = document.getElementById('analog-clock-hand');
    const secondHand = document.getElementById('analog-clock-second-hand');
    const digitalHour = document.getElementById('analog-digital-hour');
    const digitalMinute = document.getElementById('analog-digital-minute');
    const digitalPeriod = document.getElementById('analog-digital-period');
    if (!dial || !hand || !digitalHour || !digitalMinute || !digitalPeriod) return;

    dial.querySelectorAll('.analog-clock-marker').forEach((el) => el.remove());
    const items = analogClockState.mode === 'hour'
        ? analogHourDialOrder.map((value) => ({ value, label: String(value) }))
        : Array.from({ length: 12 }, (_, i) => ({ value: i * 5, label: String(i * 5).padStart(2, '0') }));

    items.forEach((item, index) => {
        const angleDeg = (index * 30) - 90;
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'analog-clock-marker';
        marker.style.left = `${50 + (Math.cos((angleDeg * Math.PI) / 180) * 38)}%`;
        marker.style.top = `${50 + (Math.sin((angleDeg * Math.PI) / 180) * 38)}%`;
        marker.textContent = item.label;
        const isDisabled = analogClockState.mode === 'hour'
            ? !isAnalogCandidateAllowed(item.value, analogClockState.minute, analogClockState.period)
            : !isAnalogCandidateAllowed(analogClockState.hour, item.value, analogClockState.period);
        if (isDisabled) marker.classList.add('is-disabled');
        const isActive = analogClockState.mode === 'hour'
            ? item.value === analogClockState.hour
            : item.value === analogClockState.minute;
        if (isActive) marker.classList.add('is-active');
        marker.addEventListener('click', () => {
            if (isDisabled) return;
            if (analogClockState.mode === 'hour') {
                analogClockState.hour = item.value;
                analogClockState.mode = 'minute';
                analogClockState.focus = 'minute';
            } else {
                analogClockState.minute = item.value;
            }
            markManualAnalogSelection();
            renderAnalogClockDial();
        });
        dial.appendChild(marker);
    });

    const angle = analogClockState.liveMode
        ? ((analogClockState.minute % 60) * 6) + (analogClockState.second * 0.1)
        : (analogClockState.mode === 'hour'
            ? ((analogClockState.hour % 12) * 30)
            : ((analogClockState.minute / 5) * 30));
    hand.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    if (secondHand) {
        secondHand.classList.toggle('is-visible', analogClockState.liveMode && isTodayEventDateSelected());
        secondHand.style.transform = `translateX(-50%) rotate(${(analogClockState.second % 60) * 6}deg)`;
    }
    digitalHour.textContent = String(analogClockState.hour).padStart(2, '0');
    digitalMinute.textContent = String(analogClockState.minute).padStart(2, '0');
    digitalPeriod.textContent = analogClockState.period;
    digitalPeriod.classList.toggle('is-am', analogClockState.period === 'AM');
    digitalPeriod.classList.toggle('is-pm', analogClockState.period === 'PM');
    if (analogLastRenderedPeriod && analogLastRenderedPeriod !== analogClockState.period) {
        digitalPeriod.classList.remove('period-swap');
        void digitalPeriod.offsetWidth;
        digitalPeriod.classList.add('period-swap');
    }
    analogLastRenderedPeriod = analogClockState.period;

    digitalHour.classList.toggle('is-active', analogClockState.focus === 'hour');
    digitalMinute.classList.toggle('is-active', analogClockState.focus === 'minute');
    digitalPeriod.classList.toggle('is-active', analogClockState.focus === 'period');
}

function legacy_openAnalogTimeModal(inputId) {
    analogClockState.targetInputId = inputId || 'event-time-display';
    const dateValue = document.getElementById('event-date')?.value || '';
    const startTimeValue = document.getElementById('event-time')?.value || '';
    const durationDisplay = document.getElementById('event-duration-display');
    if (analogClockState.targetInputId === 'event-time-display' && !dateValue) {
        setLocationStatus('Please select event date first.', true);
        return;
    }
    if (analogClockState.targetInputId === 'event-end-time-display') {
        if (!startTimeValue) {
            setLocationStatus('Please select start time first.', true);
            return;
        }
        const hasManualDuration = parseDurationDisplayToMinutes(durationDisplay?.value || '') > 0 && !durationDisplay?.readOnly;
        if (hasManualDuration) {
            setLocationStatus('Choose either End Time or Duration.', true);
            return;
        }
    }
    const modal = document.getElementById('analog-time-modal');
    const card = document.getElementById('analog-time-modal-card');
    if (!modal || !card) return;

    const hiddenTime = document.getElementById(getAnalogTargetHiddenInputId());
    const parsed = parse24HourTime(hiddenTime?.value || '');
    if (parsed) {
        analogClockState.hour = parsed.hour12;
        analogClockState.minute = parsed.minute;
        analogClockState.period = parsed.period;
        analogClockState.second = 0;
        analogClockState.liveMode = false;
        stopAnalogLiveTicker();
    } else if (isTodayEventDateSelected()) {
        const now = new Date();
        const hour24 = now.getHours();
        analogClockState.period = hour24 >= 12 ? 'PM' : 'AM';
        analogClockState.hour = (hour24 % 12) || 12;
        analogClockState.minute = now.getMinutes();
        analogClockState.second = now.getSeconds();
        analogClockState.liveMode = true;
        startAnalogLiveTicker();
    } else {
        analogClockState.second = 0;
        analogClockState.liveMode = false;
        stopAnalogLiveTicker();
    }
    analogClockState.mode = 'hour';
    analogClockState.focus = 'hour';
    renderAnalogClockDial();

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });
}

function legacy_closeAnalogTimeModal() {
    const modal = document.getElementById('analog-time-modal');
    const card = document.getElementById('analog-time-modal-card');
    if (!modal || !card) return;
    stopAnalogLiveTicker();
    analogClockState.liveMode = false;
    analogClockState.second = 0;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

function legacy_clearAnalogTimeSelection() {
    const targetHiddenId = getAnalogTargetHiddenInputId();
    const hiddenTime = document.getElementById(targetHiddenId);
    const displayTime = document.getElementById(analogClockState.targetInputId || 'event-time-display');
    if (hiddenTime) hiddenTime.value = '';
    if (displayTime) displayTime.value = '';
    if (targetHiddenId === 'event-end-time') {
        const durationDisplay = document.getElementById('event-duration-display');
        const durationHidden = document.getElementById('event-duration-minutes');
        if (durationDisplay) {
            durationDisplay.value = '';
            durationDisplay.readOnly = false;
        }
        if (durationHidden) durationHidden.value = '';
    }
    recalculateEventDurationFromTimes();
    syncEventTimeDependencyUi();
    closeAnalogTimeModal();
}

function legacy_parseDateParts(dateValue) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || '').trim());
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
}

function legacy_formatDateDisplay(dateValue) {
    const parts = parseDateParts(dateValue);
    if (!parts) return '';
    const localDate = new Date(parts.year, parts.month - 1, parts.day);
    return localDate.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function legacy_toDateKey(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function legacy_getTodayDateKey() {
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function legacy_dateKeyToLocalDate(dateKey) {
    const parts = parseDateParts(dateKey);
    if (!parts) return null;
    return new Date(parts.year, parts.month - 1, parts.day);
}

function legacy_localDateToDateKey(localDate) {
    if (!(localDate instanceof Date) || Number.isNaN(localDate.getTime())) return '';
    return toDateKey(localDate.getFullYear(), localDate.getMonth(), localDate.getDate());
}

function legacy_getSafeSelectedOrTodayDateKey() {
    const todayKey = getTodayDateKey();
    if (!eventCalendarState.selectedDate) return todayKey;
    return eventCalendarState.selectedDate < todayKey ? todayKey : eventCalendarState.selectedDate;
}

function legacy_isEventDateModalOpen() {
    const modal = document.getElementById('event-date-modal');
    return !!modal && !modal.classList.contains('hidden');
}

function legacy_isEventMonthYearPickerOpen() {
    const picker = document.getElementById('event-month-year-picker');
    return !!picker && !picker.classList.contains('hidden');
}

function legacy_clampEventCalendarToCurrentMonth() {
    const today = new Date();
    if (
        eventCalendarState.viewYear < today.getFullYear() ||
        (eventCalendarState.viewYear === today.getFullYear() && eventCalendarState.viewMonth < today.getMonth())
    ) {
        eventCalendarState.viewYear = today.getFullYear();
        eventCalendarState.viewMonth = today.getMonth();
    }
}

function legacy_renderEventMonthYearPicker() {
    const yearLabel = document.getElementById('event-calendar-year-label');
    const monthGrid = document.getElementById('event-month-grid');
    if (!yearLabel || !monthGrid) return;
    const today = new Date();
    const monthShortNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    yearLabel.textContent = String(eventCalendarState.viewYear);

    monthGrid.innerHTML = monthShortNames.map((label, idx) => {
        const disabled = eventCalendarState.viewYear === today.getFullYear() && idx < today.getMonth();
        const active = idx === eventCalendarState.viewMonth;
        return `<button type="button" data-month="${idx}" class="event-month-chip${active ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}" ${disabled ? 'disabled' : ''}>${label}</button>`;
    }).join('');

    monthGrid.querySelectorAll('button[data-month]').forEach((buttonEl) => {
        buttonEl.addEventListener('click', () => {
            const monthIdx = Number(buttonEl.getAttribute('data-month'));
            if (!Number.isInteger(monthIdx) || monthIdx < 0 || monthIdx > 11) return;
            eventCalendarState.viewMonth = monthIdx;
            clampEventCalendarToCurrentMonth();
            renderEventCalendar();
        });
    });
}

function legacy_toggleEventMonthYearPicker() {
    const picker = document.getElementById('event-month-year-picker');
    if (!picker) return;
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        renderEventMonthYearPicker();
    }
}

function legacy_closeEventMonthYearPicker() {
    const picker = document.getElementById('event-month-year-picker');
    if (!picker) return;
    picker.classList.add('hidden');
}

function legacy_changeEventCalendarYear(step) {
    const today = new Date();
    const nextYear = eventCalendarState.viewYear + step;
    eventCalendarState.viewYear = Math.max(today.getFullYear(), nextYear);
    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function legacy_setCalendarViewToSelectedDate(dateKey) {
    const parsed = parseDateParts(dateKey);
    if (!parsed) return;
    eventCalendarState.viewYear = parsed.year;
    eventCalendarState.viewMonth = parsed.month - 1;
}

function legacy_moveEventDateSelectionByDays(daysDelta) {
    const todayKey = getTodayDateKey();
    const baseKey = getSafeSelectedOrTodayDateKey();
    const baseDate = dateKeyToLocalDate(baseKey);
    if (!baseDate) return;

    const nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + daysDelta);
    let nextKey = localDateToDateKey(nextDate);
    if (!nextKey) return;
    if (nextKey < todayKey) nextKey = todayKey;

    eventCalendarState.selectedDate = nextKey;
    setCalendarViewToSelectedDate(nextKey);
    renderEventCalendar();
}

function legacy_moveEventCalendarMonthByKeyboard(monthDelta) {
    const nextMonth = eventCalendarState.viewMonth + monthDelta;
    const yearDelta = Math.floor(nextMonth / 12);
    eventCalendarState.viewYear += yearDelta;
    eventCalendarState.viewMonth = ((nextMonth % 12) + 12) % 12;
    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function legacy_handleEventCalendarKeyboard(event) {
    if (!isEventDateModalOpen()) return;

    if (isEventMonthYearPickerOpen()) {
        if (event.key === 'ArrowLeft') {
            moveEventCalendarMonthByKeyboard(-1);
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowRight') {
            moveEventCalendarMonthByKeyboard(1);
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowUp') {
            changeEventCalendarYear(1);
            event.preventDefault();
            return;
        }
        if (event.key === 'ArrowDown') {
            changeEventCalendarYear(-1);
            event.preventDefault();
            return;
        }
        if (event.key === 'Escape') {
            closeEventMonthYearPicker();
            event.preventDefault();
            return;
        }
        if (event.key === 'Enter') {
            closeEventMonthYearPicker();
            event.preventDefault();
            return;
        }
    }

    if (event.key === 'ArrowLeft') {
        moveEventDateSelectionByDays(-1);
        event.preventDefault();
    } else if (event.key === 'ArrowRight') {
        moveEventDateSelectionByDays(1);
        event.preventDefault();
    } else if (event.key === 'ArrowUp') {
        moveEventDateSelectionByDays(-7);
        event.preventDefault();
    } else if (event.key === 'ArrowDown') {
        moveEventDateSelectionByDays(7);
        event.preventDefault();
    } else if (event.key === 'Enter') {
        saveEventDateSelection();
        event.preventDefault();
    } else if (event.key === 'Escape') {
        closeEventDateModal();
        event.preventDefault();
    }
}

function legacy_renderEventCalendar() {
    const monthLabel = document.getElementById('event-calendar-month-label');
    const grid = document.getElementById('event-calendar-grid');
    const preview = document.getElementById('event-date-preview');
    if (!monthLabel || !grid || !preview) return;

    const firstDay = new Date(eventCalendarState.viewYear, eventCalendarState.viewMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(eventCalendarState.viewYear, eventCalendarState.viewMonth + 1, 0).getDate();
    const todayKey = getTodayDateKey();

    monthLabel.textContent = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    preview.textContent = eventCalendarState.selectedDate
        ? formatDateDisplay(eventCalendarState.selectedDate)
        : 'No date selected';

    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) {
        cells.push('<span class="event-calendar-cell is-empty"></span>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const dateKey = toDateKey(eventCalendarState.viewYear, eventCalendarState.viewMonth, day);
        const isPast = dateKey < todayKey;
        const isSelected = dateKey === eventCalendarState.selectedDate;
        cells.push(
            `<button type="button" class="event-calendar-cell${isSelected ? ' is-selected' : ''}${isPast ? ' is-disabled' : ''}" ${isPast ? 'disabled' : ''} data-date="${dateKey}">${day}</button>`
        );
    }

    grid.innerHTML = cells.join('');
    grid.querySelectorAll('button[data-date]').forEach((buttonEl) => {
        buttonEl.addEventListener('click', () => {
            eventCalendarState.selectedDate = buttonEl.getAttribute('data-date') || '';
            renderEventCalendar();
        });
    });
    renderEventMonthYearPicker();
}

function legacy_openEventDateModal(inputId) {
    eventCalendarState.targetInputId = inputId || 'event-date-display';
    const modal = document.getElementById('event-date-modal');
    const card = document.getElementById('event-date-modal-card');
    if (!modal || !card) return;

    const hiddenDate = document.getElementById('event-date');
    const selectedDate = hiddenDate?.value || getTodayDateKey();
    const parsed = parseDateParts(selectedDate);
    if (parsed) {
        eventCalendarState.selectedDate = selectedDate;
        eventCalendarState.viewYear = parsed.year;
        eventCalendarState.viewMonth = parsed.month - 1;
    }
    closeEventMonthYearPicker();
    renderEventCalendar();

    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });
}

function legacy_closeEventDateModal() {
    const modal = document.getElementById('event-date-modal');
    const card = document.getElementById('event-date-modal-card');
    if (!modal || !card) return;
    closeEventMonthYearPicker();
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

function legacy_changeEventCalendarMonth(step) {
    const nextMonth = eventCalendarState.viewMonth + step;
    const yearDelta = Math.floor(nextMonth / 12);
    eventCalendarState.viewYear += yearDelta;
    eventCalendarState.viewMonth = ((nextMonth % 12) + 12) % 12;

    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function legacy_saveEventDateSelection() {
    const dateValue = eventCalendarState.selectedDate || '';
    if (!dateValue) {
        setLocationStatus('Please select a date.', true);
        return;
    }
    if (dateValue < getTodayDateKey()) {
        setLocationStatus('Past dates are not allowed.', true);
        return;
    }
    const hiddenDate = document.getElementById('event-date');
    const displayInput = document.getElementById(eventCalendarState.targetInputId || 'event-date-display');
    if (hiddenDate) hiddenDate.value = dateValue;
    if (displayInput) displayInput.value = formatDateDisplay(dateValue);

    const hiddenTime = document.getElementById('event-time');
    const displayTime = document.getElementById('event-time-display');
    const hiddenEndTime = document.getElementById('event-end-time');
    const displayEndTime = document.getElementById('event-end-time-display');
    if (hiddenTime?.value && !isFutureEventDateTime(dateValue, hiddenTime.value)) {
        hiddenTime.value = '';
        if (displayTime) displayTime.value = '';
        if (hiddenEndTime) hiddenEndTime.value = '';
        if (displayEndTime) displayEndTime.value = '';
        recalculateEventDurationFromTimes();
        setLocationStatus('Selected date changed. Please re-select time.', true);
    } else if (hiddenEndTime?.value && !isFutureEventDateTime(dateValue, hiddenEndTime.value)) {
        hiddenEndTime.value = '';
        if (displayEndTime) displayEndTime.value = '';
        recalculateEventDurationFromTimes();
        setLocationStatus('Selected date changed. End time was cleared.', true);
    } else {
        setLocationStatus('');
    }
    syncEventTimeDependencyUi();
    closeEventDateModal();
}

function legacy_clearEventDateSelection() {
    const hiddenDate = document.getElementById('event-date');
    const displayInput = document.getElementById(eventCalendarState.targetInputId || 'event-date-display');
    if (hiddenDate) hiddenDate.value = '';
    if (displayInput) displayInput.value = '';
    eventCalendarState.selectedDate = '';
    const hiddenTime = document.getElementById('event-time');
    const displayTime = document.getElementById('event-time-display');
    const hiddenEndTime = document.getElementById('event-end-time');
    const displayEndTime = document.getElementById('event-end-time-display');
    const durationInput = document.getElementById('event-duration-minutes');
    const durationDisplay = document.getElementById('event-duration-display');
    if (hiddenTime) hiddenTime.value = '';
    if (displayTime) displayTime.value = '';
    if (hiddenEndTime) hiddenEndTime.value = '';
    if (displayEndTime) displayEndTime.value = '';
    if (durationInput) {
        durationInput.value = '';
    }
    if (durationDisplay) {
        durationDisplay.value = '';
        durationDisplay.readOnly = false;
    }
    syncEventTimeDependencyUi();
    closeEventDateModal();
}

function legacy_saveAnalogTimeSelection() {
    const dateInput = document.getElementById('event-date');
    const dateValue = dateInput?.value || '';
    const time24 = to24HourTime(analogClockState.hour, analogClockState.minute, analogClockState.period);
    if (dateValue && !isFutureEventDateTime(dateValue, time24)) {
        setLocationStatus('Please select a future time for the selected date.', true);
        return;
    }
    syncEventTimeInputs();
    setLocationStatus('');
    syncEventTimeDependencyUi();
    closeAnalogTimeModal();
}

function legacy_initEventDateTimePicker() {
    const dateInput = document.getElementById('event-date');
    const dateDisplayInput = document.getElementById('event-date-display');
    if (!dateInput || !dateDisplayInput) return;

    const selectedDate = dateInput.value || '';
    if (selectedDate) {
        dateDisplayInput.value = formatDateDisplay(selectedDate);
        eventCalendarState.selectedDate = selectedDate;
        const parsed = parseDateParts(selectedDate);
        if (parsed) {
            eventCalendarState.viewYear = parsed.year;
            eventCalendarState.viewMonth = parsed.month - 1;
        }
    } else {
        const today = new Date();
        eventCalendarState.viewYear = today.getFullYear();
        eventCalendarState.viewMonth = today.getMonth();
    }
    syncEventTimeDependencyUi();
}

function legacy_initEventCalendarKeyboardNavigation() {
    document.addEventListener('keydown', handleEventCalendarKeyboard);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        bindHomePageActions();
        syncDiscoverHistory(getStoredDiscoverHistory());
        loadStoredTickets();
        state.customLocationName = localStorage.getItem('happnix_custom_location_name') || '';
    state.detectedLocationName = localStorage.getItem('happnix_detected_location_name') || '';
    const locationInput = document.getElementById('location-modal-input');
    if (locationInput) {
        locationInput.addEventListener('input', () => {
            const text = locationInput.value.trim();
            showLocationModalError('');
            if (!text) {
                hideLocationModalSuggestions();
                return;
            }
            if (locationModalSearchTimer) {
                clearTimeout(locationModalSearchTimer);
            }
            locationModalSearchTimer = setTimeout(async () => {
                const results = await locationModalSearch(text, 5);
                renderLocationModalSuggestions(results);
            }, 220);
        });
        locationInput.addEventListener('change', async () => {
            const results = await locationModalSearch(locationInput.value.trim(), 1);
            if (results.length > 0) {
                applyLocationModalResult(results[0]);
            }
        });
        locationInput.addEventListener('blur', () => {
            setTimeout(hideLocationModalSuggestions, 120);
        });
    }
    const locationModal = document.getElementById('location-modal');
    if (locationModal) {
        locationModal.addEventListener('click', (event) => {
            if (event.target === locationModal) {
                closeLocationModal();
            }
        });
    }
    const discoverProfileModal = document.getElementById('discover-profile-modal');
    if (discoverProfileModal) {
        discoverProfileModal.addEventListener('click', (event) => {
            if (event.target === discoverProfileModal) {
                closeDiscoverProfile();
            }
        });
    }
    const followGraphModal = document.getElementById('follow-graph-modal');
    if (followGraphModal) {
        followGraphModal.addEventListener('click', (event) => {
            if (event.target === followGraphModal) {
                closeFollowGraph();
            }
        });
    }
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (event) => {
            if (event.target === settingsModal) {
                closeSettingsModal();
            }
        });
    }
    const notificationsModal = document.getElementById('notifications-modal');
    if (notificationsModal) {
        notificationsModal.addEventListener('click', (event) => {
            if (event.target === notificationsModal) {
                closeNotifications();
            }
        });
    }
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('#event-type-picker')) {
            return;
        }
        closeEventTypeMenu();
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.hosted-event-menu') && !event.target.closest('[data-action="hosted-event-card"]')) {
            if (state.hostedMenuEventPostId) {
                state.hostedMenuEventPostId = null;
                renderHostedEventList();
            }
        }
    });
    bindLocationButtonGestures('mobile-location-btn');
    bindLocationButtonGestures('desktop-location-btn');
    applyTheme(getPreferredTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
            const isLight = document.body.classList.contains('theme-light');
            applyTheme(isLight ? 'dark' : 'light', { persist: true });
        });
    });
    renderTopLocationUi();
    renderFeed();
    renderUploadActivity();
    renderLiveNow();
    loadLiveNowEvents();
    renderExplore();
    const discoverInput = document.getElementById('discover-search-input');
    if (discoverInput) {
        discoverInput.addEventListener('input', () => {
            const nextValue = discoverInput.value || '';
            setDiscoverSearchValue(nextValue, { render: false });
            if (state.discoverSearchTimer) {
                clearTimeout(state.discoverSearchTimer);
            }
            state.discoverSearchTimer = window.setTimeout(() => {
                runDiscoverSearch(nextValue);
            }, 220);
            if (!nextValue.trim()) {
                state.discoverResults = [];
                state.discoverLoading = false;
                renderExplore();
            }
        });
    }
    renderCurrentUserProfile();
    renderProfileGrid();
    renderTicketList();
    renderHostedEventList();
    loadHostedEvents();
    switchMyEventsTab('tickets');
    const eventMediaInput = document.getElementById('event-media-input');
    if (eventMediaInput && typeof handleEventMediaInputChange === 'function') {
        eventMediaInput.addEventListener('change', handleEventMediaInputChange);
    }
    const createPostForm = document.getElementById('create-post-form');
    if (createPostForm && typeof handlePostSubmit === 'function') {
        createPostForm.addEventListener('submit', handlePostSubmit);
    }
    if (typeof bindCreatePostActions === 'function') {
        bindCreatePostActions();
    }
    if (typeof bindCreatePostInputs === 'function') {
        bindCreatePostInputs();
    }
    renderEventCategoriesFromManifest();
    renderSelectedEventMedia();
    if (typeof initEventBuilder === 'function') {
        initEventBuilder();
    }
    if (typeof initPostSwipePanel === 'function') {
        initPostSwipePanel();
    }
    loadCurrentUserProfile().finally(() => {
        refreshFollowingFeed();
        startLiveSync();
        runLiveSyncTick({ force: true });
    });
    switchTab(getInitialTabFromUrl());
    initPullToRefresh();
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
    if (!state.locationEnabled) {
        setLocationStatus('Location is OFF. Nearby detection stopped.');
    } else if (window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        detectUserLocationAndLoad();
    } else {
        setLocationStatus('Location auto-detect disabled on insecure origin. Use localhost/HTTPS.');
    }
    } catch (error) {
        console.error('Home page initialization failed:', error);
        showStartupDebug(error?.stack || error?.message || error);
    } finally {
        // Fallback so the app does not stay trapped behind the loader if a late asset stalls.
        hideLoaderWhenReady();
    }
});

window.addEventListener("load", hideLoaderWhenReady);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        runLiveSyncTick({ force: true });
    }
});
window.addEventListener('focus', () => {
    runLiveSyncTick({ force: true });
});
window.addEventListener('beforeunload', () => {
    stopLiveSync();
});
window.addEventListener('error', (event) => {
    showStartupDebug(event?.error?.stack || event?.message || 'Window error');
    hideLoaderWhenReady();
});
window.addEventListener('unhandledrejection', (event) => {
    showStartupDebug(event?.reason?.stack || event?.reason?.message || event?.reason || 'Unhandled promise rejection');
    hideLoaderWhenReady();
});
window.setTimeout(hideLoaderWhenReady, 2500);

// --- Render Functions ---

function renderLiveNow() {
    const container = document.getElementById('live-now-container');
    if (!container) return;
    const liveEvents = getLiveNowEvents();
    if (!liveEvents.length) {
        container.innerHTML = `
            <div class="w-full rounded-3xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-gray-400">
                No live events right now. When an event is actively running, it will show here.
            </div>
        `;
        return;
    }
    container.innerHTML = liveEvents.map((post) => {
        const media = getPostPreviewImage(post);
        const dateBits = getEventMonthDay(post.eventDetails);
        const priceLabel = Number(post.eventDetails?.price) > 0 ? formatInr(post.eventDetails.price) : 'Free';
        const distanceLabel = post.eventDetails?.distanceKm !== undefined ? `${post.eventDetails.distanceKm} km away` : 'Live event';
        return `
            <button type="button" class="group relative min-w-[220px] max-w-[220px] overflow-hidden rounded-3xl border border-emerald-400/20 bg-slate-950 text-left shadow-[0_12px_40px_rgba(16,185,129,0.16)]" data-action="open-booking-modal" data-post-id="${post.id}">
                <div class="absolute inset-0 bg-gradient-to-b from-emerald-400/10 via-transparent to-slate-950/90"></div>
                <img src="${media}" class="h-28 w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-105">
                <div class="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300">
                    <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>Live
                </div>
                <div class="absolute right-3 top-3 rounded-2xl border border-white/10 bg-black/50 px-2 py-1 text-center text-white">
                    <div class="text-[9px] tracking-[0.22em] text-gray-400">${dateBits.month}</div>
                    <div class="text-sm font-black leading-none">${dateBits.day}</div>
                </div>
                <div class="relative p-4">
                    <h3 class="line-clamp-1 text-sm font-black text-white">${escapeHtml(post.eventDetails?.title || 'Live Event')}</h3>
                    <p class="mt-1 line-clamp-1 text-xs text-gray-300">${escapeHtml(post.eventDetails?.location || distanceLabel)}</p>
                    <div class="mt-3 flex items-center justify-between gap-2 text-xs">
                        <span class="rounded-full bg-white/10 px-2.5 py-1 font-bold text-emerald-200">${escapeHtml(distanceLabel)}</span>
                        <span class="font-bold text-fuchsia-300">${escapeHtml(priceLabel)}</span>
                    </div>
                </div>
            </button>
        `;
    }).join('');
}

function getPostMediaItems(post) {
    if (Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0) {
        const types = Array.isArray(post.mediaTypes) ? post.mediaTypes : [];
        return post.mediaUrls.map((url, idx) => ({
            url,
            type: types[idx] || (/\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(url || '') ? 'video' : 'image')
        }));
    }
    if (post.mediaUrl) {
        return [{ url: post.mediaUrl, type: post.mediaType || 'image' }];
    }
    if (post.image) {
        return [{ url: post.image, type: post.mediaType || 'image' }];
    }
    return [];
}

function shiftPostMedia(postId, delta) {
    const post = getPostById(postId);
    if (!post) return;
    const items = getPostMediaItems(post);
    if (items.length <= 1) return;
    const current = state.postMediaIndexes[postId] || 0;
    const next = (current + delta + items.length) % items.length;
    state.postMediaIndexes[postId] = next;
    renderFeed();
}

function startPostSwipe(event, postId) {
    state.postSwipeStartX[postId] = event.touches?.[0]?.clientX || 0;
}

function endPostSwipe(event, postId) {
    const startX = state.postSwipeStartX[postId] || 0;
    const endX = event.changedTouches?.[0]?.clientX || startX;
    const diff = endX - startX;
    if (Math.abs(diff) < 35) return;
    shiftPostMedia(postId, diff < 0 ? 1 : -1);
}

function startPendingMediaSwipe(event) {
    state.pendingSwipeStartX = event.touches?.[0]?.clientX || 0;
}

function endPendingMediaSwipe(event) {
    const endX = event.changedTouches?.[0]?.clientX || state.pendingSwipeStartX;
    const diff = endX - state.pendingSwipeStartX;
    if (Math.abs(diff) < 35) return;
    shiftPendingMedia(diff < 0 ? 1 : -1);
}

function shiftPendingMedia(delta) {
    const slideCount = state.pendingEventMedia.length + 1; // extra end slide for add/change
    if (slideCount <= 1) return;
    const next = (state.pendingMediaIndex + delta + slideCount) % slideCount;
    state.pendingMediaIndex = next;
    renderSelectedEventMedia();
}

function renderPostMediaStage(post) {
    const items = getPostMediaItems(post);
    const safeCount = items.length || 1;
    const idxRaw = state.postMediaIndexes[post.id] || 0;
    const idx = Math.max(0, Math.min(idxRaw, safeCount - 1));
    const current = items[idx] || { url: post.image, type: 'image' };
    const mediaTag = current.type === 'video'
        ? `<video src="${current.url}" class="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105" controls playsinline preload="metadata"></video>`
        : `<img src="${current.url}" class="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105">`;
    const controls = safeCount > 1
        ? `<button type="button" data-action="shift-post-media" data-post-id="${post.id}" data-direction="-1" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 border border-white/10 text-white grid place-items-center z-20">&lsaquo;</button>
           <button type="button" data-action="shift-post-media" data-post-id="${post.id}" data-direction="1" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 border border-white/10 text-white grid place-items-center z-20">&rsaquo;</button>
           <div class="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/45 text-xs text-white border border-white/10 z-20">${idx + 1} / ${safeCount}</div>`
        : '';
    return `<div class="absolute inset-0" data-action="post-swipe" data-post-id="${post.id}">${mediaTag}${controls}</div>`;
}

function isDuplicatePendingMedia(file) {
    return state.pendingEventMedia.some((item) =>
        item.name === file.name &&
        item.size === file.size &&
        item.lastModified === file.lastModified
    );
}

function getVideoDurationSeconds(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            const duration = Number(video.duration || 0);
            URL.revokeObjectURL(url);
            resolve(duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read video metadata.'));
        };
        video.src = url;
    });
}

async function validateIncomingMedia(files) {
    const accepted = [];
    const longVideoNames = [];
    const invalidTypeNames = [];

    for (const file of files) {
        const type = (file.type || '').toLowerCase();
        if (type.startsWith('image/')) {
            accepted.push(file);
            continue;
        }
        if (!type.startsWith('video/')) {
            invalidTypeNames.push(file.name || 'unknown');
            continue;
        }
        try {
            const seconds = await getVideoDurationSeconds(file);
            if (seconds > 90) {
                longVideoNames.push(file.name || 'video');
                continue;
            }
            accepted.push(file);
        } catch (_) {
            invalidTypeNames.push(file.name || 'unknown');
        }
    }
    return { accepted, longVideoNames, invalidTypeNames };
}

function renderFeed() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    const feedPosts = getAllPosts();
    if (feedPosts.length === 0) {
        container.innerHTML = `
            <article class="rounded-3xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-10 text-center text-sm text-gray-400">
                Follow people to fill your feed with their posts and events, or publish your first post.
            </article>`;
        return;
    }
    container.innerHTML = feedPosts.map(post => {
        const joined = post.isEvent && hasActiveTicketForEvent(post.id);
        return `
        <article class="relative mb-6 bg-slate-800/20 md:bg-transparent md:rounded-2xl md:overflow-hidden md:border md:border-white/5" data-post-id="${post.id}">
            <div class="px-4 py-3 flex items-center justify-between bg-slate-900/50 md:bg-transparent">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full ring-2 ring-white/10 overflow-hidden cursor-pointer">
                        <img src="${post.avatar}" class="w-full h-full object-cover">
                    </div>
                    <div>
                        <p class="text-sm font-bold text-white cursor-pointer hover:underline">${post.username}</p>
                        ${post.isEvent ? `<div class="flex items-center gap-1 text-xs text-fuchsia-400 font-medium"><i data-lucide="music" class="w-3 h-3"></i> Event Host</div>` : ''}
                    </div>
                </div>
                <button class="text-gray-400 hover:text-white"><i data-lucide="more-horizontal" class="w-5 h-5"></i></button>
            </div>
            <div class="relative w-full aspect-[4/5] bg-gray-900 group overflow-hidden md:rounded-lg">
                ${renderPostMediaStage(post)}
                <div class="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900/90 pointer-events-none"></div>
                
                <div class="absolute right-4 bottom-28 flex flex-col gap-6 items-center z-10 pointer-events-auto">
                    <button type="button" data-action="toggle-like" class="flex flex-col items-center gap-1 group">
                        <div class="p-3 rounded-full bg-black/20 backdrop-blur-md text-white transition-colors group-active:text-rose-500 hover:bg-black/40"><i data-lucide="heart" class="w-7 h-7"></i></div>
                        <span class="text-xs font-bold drop-shadow-md">${post.likes}</span>
                    </button>
                    <button class="flex flex-col items-center gap-1">
                        <div class="p-3 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-black/40"><i data-lucide="message-circle" class="w-7 h-7"></i></div>
                    </button>
                    <button class="flex flex-col items-center gap-1">
                        <div class="p-3 rounded-full bg-black/20 backdrop-blur-md text-white hover:bg-black/40"><i data-lucide="send" class="w-7 h-7"></i></div>
                    </button>
                </div>

                <div class="absolute bottom-0 left-0 right-0 p-5 pr-20 pointer-events-auto">
                    ${!post.isEvent ? `<div class="mb-3">${renderLinkedPostBadge(post)}</div>` : ''}
                    <p class="text-sm text-gray-200 mb-3 line-clamp-2"><span class="font-bold text-white mr-2">${post.username}</span>${post.caption}</p>
                    ${post.isEvent ? `
                    <div class="mt-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center justify-between group/event hover:bg-white/15 transition-colors cursor-pointer" data-action="open-booking-modal" data-post-id="${post.id}">
                        <div class="flex gap-3 items-center">
                            <div class="bg-fuchsia-600/20 w-10 h-10 rounded-lg flex flex-col items-center justify-center text-fuchsia-400 border border-fuchsia-500/30">
                                <span class="text-[10px] font-bold uppercase leading-none">${getEventMonthDay(post.eventDetails).month}</span><span class="text-lg font-bold leading-none">${getEventMonthDay(post.eventDetails).day}</span>
                            </div>
                            <div>
                                <div class="flex items-center gap-2">
                                    <h3 class="font-bold text-sm text-white group-hover/event:text-fuchsia-300 transition-colors">${post.eventDetails.title}</h3>
                                    ${isEventEndedFromDetails(post.eventDetails) ? '<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold uppercase tracking-[0.2em]">Ended</span>' : ''}${joined ? '<span class="px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold uppercase tracking-[0.2em]">Joined</span>' : ''}
                                </div>
                                <p class="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><i data-lucide="map-pin" class="w-3 h-3"></i> ${post.eventDetails.location}${post.eventDetails.distanceKm !== undefined ? ` (${post.eventDetails.distanceKm} km)` : ''}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${post.eventDetails.mapUrl ? `<a href="${post.eventDetails.mapUrl}" target="_blank" rel="noopener" data-action="stop-prop" class="px-3 py-2 bg-cyan-600/20 text-cyan-300 text-xs font-bold rounded-lg border border-cyan-500/30 hover:bg-cyan-600/30">Map</a>` : ''}
                            <button class="px-3 py-2 text-xs font-bold rounded-lg shadow-lg ${(isEventEndedFromDetails(post.eventDetails) || joined) ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 text-white shadow-fuchsia-500/20'}" ${(isEventEndedFromDetails(post.eventDetails) || joined) ? 'disabled' : ''}>${isEventEndedFromDetails(post.eventDetails) ? 'Event Ended' : (joined ? 'Joined' : (Number(post.eventDetails.price) > 0 ? `Book ${formatInr(post.eventDetails.price)}` : 'Join Free'))}</button>
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </article>
    `;
    }).join('');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function getFollowButtonClasses(user) {
    if (user?.is_following) {
        return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25';
    }
    if (user?.follow_request_pending) {
        return 'border-amber-400/30 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25';
    }
    return 'border-fuchsia-400/30 bg-fuchsia-500/15 text-fuchsia-300 hover:bg-fuchsia-500/25';
}

function getUserFollowState(userId) {
    const safeUserId = Number(userId);
    const discoverUser = (state.discoverResults || []).find((user) => Number(user.sql_user_id) === safeUserId);
    if (discoverUser) return discoverUser;
    const graphUser = (state.followGraph.users || []).find((user) => Number(user.sql_user_id) === safeUserId);
    if (graphUser) return graphUser;
    if (state.activeDiscoverProfile && Number(state.activeDiscoverProfile.sql_user_id) === safeUserId) {
        return state.activeDiscoverProfile;
    }
    return null;
}

function isUserCurrentlyFollowing(userId) {
    return !!getUserFollowState(userId)?.is_following;
}

function renderDiscoverProfileEvents(events) {
    if (!Array.isArray(events) || events.length === 0) {
        return `
            <div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">
                No events or public posts yet.
            </div>`;
    }
    return events.map((post) => {
        const joined = post.isEvent && hasActiveTicketForEvent(post.id);
        if (!post.isEvent) {
            return `
                <article class="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-lg shadow-black/10">
                    <div class="aspect-[16/9] bg-slate-800 overflow-hidden">
                        <img src="${escapeHtml(getPostPreviewImage(post) || defaultAvatar)}" alt="${escapeHtml(post.username || 'Post')}" class="h-full w-full object-cover">
                    </div>
                    <div class="p-4 space-y-3">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300">Post</div>
                        <p class="text-sm leading-6 text-gray-300">${escapeHtml(post.caption || 'Shared a new moment.')}</p>
                        <div class="text-xs text-gray-500">${escapeHtml(post.username ? `@${post.username}` : '')}</div>
                    </div>
                </article>`;
        }
        return `
            <article class="rounded-3xl border border-white/10 bg-white/[0.03] overflow-hidden shadow-lg shadow-black/10">
                <div class="aspect-[16/9] bg-slate-800 overflow-hidden">
                    <img src="${escapeHtml(post.image || defaultAvatar)}" alt="${escapeHtml(post.eventDetails?.title || 'Event')}" class="h-full w-full object-cover">
                </div>
                <div class="p-4 space-y-4">
                    <div>
                        <div class="flex items-center gap-2">
                            <h4 class="text-lg font-black text-white">${escapeHtml(post.eventDetails?.title || 'Untitled event')}</h4>
                            ${isEventEndedFromDetails(post.eventDetails) ? '<span class="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold uppercase tracking-[0.2em]">Ended</span>' : ''}
                        </div>
                        <p class="mt-1 text-sm text-fuchsia-300">${escapeHtml(post.eventDetails?.date || 'Date TBD')}</p>
                        <p class="mt-1 text-sm text-gray-400">${escapeHtml(post.eventDetails?.location || '')}</p>
                        <p class="mt-2 text-sm leading-6 text-gray-300">${escapeHtml(post.caption || 'Join the vibe.')}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        ${post.eventDetails?.mapUrl ? `<a href="${post.eventDetails.mapUrl}" target="_blank" rel="noopener" class="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20">Map</a>` : ''}
                        <button type="button" data-action="open-public-profile-booking" data-post-id="${post.id}"
                            class="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${(isEventEndedFromDetails(post.eventDetails) || joined) ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 text-white shadow-lg shadow-fuchsia-500/20'}"
                            ${(isEventEndedFromDetails(post.eventDetails) || joined) ? 'disabled' : ''}>
                            ${isEventEndedFromDetails(post.eventDetails) ? 'Event Ended' : (joined ? 'Joined' : (Number(post.eventDetails?.price) > 0 ? `Book ${formatInr(post.eventDetails.price)}` : 'Join Free'))}
                        </button>
                    </div>
                </div>
            </article>`;
    }).join('');
}

function renderDiscoverProfileMediaGrid(events) {
    if (!Array.isArray(events) || events.length === 0) return '';
    return `
        <div>
            <div class="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-gray-500">Moments</div>
            <div class="grid grid-cols-3 gap-2">${events.slice(0, 6).map((post) => `
                <div class="aspect-square overflow-hidden rounded-2xl bg-slate-800 border border-white/10">
                    <img src="${escapeHtml(post.image || defaultAvatar)}" alt="${escapeHtml(post.eventDetails?.title || 'Event')}" class="h-full w-full object-cover">
                </div>`).join('')}</div>
        </div>`;
}

function renderDiscoverProfileModal(profile) {
    const contentEl = document.getElementById('discover-profile-content');
    if (!contentEl) return;
    if (!profile) {
        contentEl.innerHTML = `
            <div class="py-12 text-center text-sm text-gray-400">Unable to load profile.</div>`;
        return;
    }
    const avatar = escapeHtml(profile.profile_picture_url || defaultAvatar);
    const fullName = escapeHtml(profile.full_name || profile.username || 'Unknown user');
    const handle = escapeHtml(profile.username ? `@${profile.username}` : '');
    const bio = escapeHtml(profile.bio || 'No bio added yet.');
    const buttonLabel = getDiscoverFollowButtonLabel(profile);
    const verifiedBadge = profile.gov_id_verified
        ? '<span class="inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 text-[11px] font-semibold text-cyan-300"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i> Verified</span>'
        : '';
    const privacyBadge = profile.is_private
        ? '<span class="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-200"><i data-lucide="lock" class="w-3.5 h-3.5"></i> Private</span>'
        : '';
    const eventPosts = (state.publicProfileEventPosts && state.publicProfileEventPosts[profile.sql_user_id]) || [];
    const canViewContent = profile.can_view_content !== false;
    contentEl.innerHTML = `
        <div class="space-y-6">
            <div class="flex items-start gap-4 pr-10">
                <img src="${avatar}" alt="${fullName}" class="h-24 w-24 rounded-3xl object-cover bg-slate-800 border border-white/10">
                <div class="min-w-0 flex-1 pt-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <h3 class="text-2xl font-black text-white">${fullName}</h3>
                        ${verifiedBadge}${privacyBadge}
                    </div>
                    <p class="mt-1 text-sm text-gray-400">${handle}</p>
                    <p class="mt-3 text-sm leading-6 text-gray-300">${bio}</p>
                </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
                    <div class="text-lg font-black text-white">${Number(profile.hosted_events_count || 0)}</div>
                    <div class="mt-1 text-[11px] uppercase tracking-[0.24em] text-gray-500">Vibes</div>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
                    <div class="text-lg font-black text-white">${Number(profile.followers_count || 0)}</div>
                    <div class="mt-1 text-[11px] uppercase tracking-[0.24em] text-gray-500">Fans</div>
                </div>
                <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
                    <div class="text-lg font-black text-white">${Number(profile.following_count || 0)}</div>
                    <div class="mt-1 text-[11px] uppercase tracking-[0.24em] text-gray-500">Following</div>
                </div>
            </div>
            <div class="flex gap-3">
                <button type="button" data-action="follow-user" data-user-id="${profile.sql_user_id}"
                    class="flex-1 rounded-2xl border px-4 py-3 text-sm font-bold transition-colors ${getFollowButtonClasses(profile)}">${buttonLabel}</button>
                <button type="button" data-action="close-discover-profile"
                    class="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-gray-300 hover:bg-white/[0.06]">Close</button>
            </div>
            ${canViewContent ? renderDiscoverProfileMediaGrid(eventPosts) : ''}
            <div>
                <div class="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-gray-500">Events And Posts</div>
                <div class="space-y-4">${canViewContent ? renderDiscoverProfileEvents(eventPosts) : `<div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-5 py-6 text-sm text-amber-100">${escapeHtml(profile.private_content_message || 'This account is private. Follow to see posts and events.')}</div>`}</div>
            </div>
        </div>`;
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

async function openDiscoverProfile(userId) {
    const safeUserId = Number(userId);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) return;
    const modal = document.getElementById('discover-profile-modal');
    const card = document.getElementById('discover-profile-card');
    const contentEl = document.getElementById('discover-profile-content');
    if (!modal || !card || !contentEl) return;

    modal.classList.remove('hidden');
    contentEl.innerHTML = '<div class="py-12 text-center text-sm text-gray-400">Loading profile...</div>';
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });

    try {
        const data = await getJson(`/api/users/${safeUserId}/profile`);
        state.activeDiscoverProfile = data?.profile || null;
        const avatar = state.activeDiscoverProfile?.profile_picture_url || defaultAvatar;
        const eventPosts = Array.isArray(state.activeDiscoverProfile?.hosted_events)
            ? state.activeDiscoverProfile.hosted_events.map((event) => serverEventToPost({ ...event, hostAvatarUrl: avatar }))
            : [];
        state.publicProfileEventPosts[safeUserId] = hydrateProfileFeedPosts(state.activeDiscoverProfile, eventPosts);
        renderDiscoverProfileModal(state.activeDiscoverProfile);
    } catch (error) {
        state.activeDiscoverProfile = null;
        contentEl.innerHTML = `<div class="py-12 text-center text-sm text-rose-300">${escapeHtml(error.message || 'Unable to load profile.')}</div>`;
    }
}

function closeDiscoverProfile() {
    const modal = document.getElementById('discover-profile-modal');
    const card = document.getElementById('discover-profile-card');
    if (!modal || !card) return;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

function renderFollowGraphList() {
    const listEl = document.getElementById('follow-graph-list');
    const titleEl = document.getElementById('follow-graph-title');
    if (!listEl || !titleEl) return;

    const graphType = state.followGraph.type === 'following' ? 'following' : 'followers';
    titleEl.textContent = graphType === 'followers' ? 'Fans' : 'Following';

    if (state.followGraph.loading) {
        listEl.innerHTML = '<div class="py-12 text-center text-sm text-gray-400">Loading accounts...</div>';
        return;
    }

    const users = Array.isArray(state.followGraph.users) ? state.followGraph.users : [];
    if (users.length === 0) {
        listEl.innerHTML = `<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">No ${graphType === 'followers' ? 'fans' : 'following accounts'} yet.</div>`;
        return;
    }

    listEl.innerHTML = users.map((user) => {
        const fullName = escapeHtml(user.full_name || user.username || 'Unknown user');
        const handle = escapeHtml(user.username ? `@${user.username}` : '');
        const avatar = escapeHtml(user.profile_picture_url || defaultAvatar);
        const subtitle = escapeHtml(user.is_following ? 'Following' : (user.follow_request_pending ? 'Request pending' : (user.is_private ? 'Private account' : (user.follows_you ? 'Follows you' : 'Suggested account'))));
        const buttonLabel = getDiscoverFollowButtonLabel(user);
        return `
            <article class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-lg shadow-black/10 cursor-pointer" data-action="open-discover-profile" data-user-id="${user.sql_user_id}">
                <div class="flex items-center gap-3">
                    <img src="${avatar}" alt="${fullName}" class="h-14 w-14 rounded-2xl object-cover bg-slate-800">
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-bold text-white">${fullName}</div>
                        <div class="truncate text-sm text-gray-400">${handle}</div>
                        <div class="mt-1 text-xs text-gray-500">${subtitle}</div>
                    </div>
                    <button type="button" data-action="follow-user" data-user-id="${user.sql_user_id}"
                        class="rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${getFollowButtonClasses(user)}">${buttonLabel}</button>
                </div>
            </article>`;
    }).join('');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

async function openFollowGraph(graphType) {
    const safeType = graphType === 'following' ? 'following' : 'followers';
    const modal = document.getElementById('follow-graph-modal');
    const card = document.getElementById('follow-graph-card');
    if (!modal || !card) return;

    state.followGraph.type = safeType;
    state.followGraph.loading = true;
    state.followGraph.users = [];
    renderFollowGraphList();
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        card.classList.remove('scale-95');
    });

    try {
        const data = await getJson(`/api/profile/${safeType}`);
        state.followGraph.users = Array.isArray(data?.users) ? data.users : [];
    } catch (_error) {
        state.followGraph.users = [];
    } finally {
        state.followGraph.loading = false;
        renderFollowGraphList();
    }
}

function closeFollowGraph() {
    const modal = document.getElementById('follow-graph-modal');
    const card = document.getElementById('follow-graph-card');
    if (!modal || !card) return;
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

function updateFollowGraphUser(targetUserId, payload) {
    const safeUserId = Number(targetUserId);
    state.followGraph.users = (state.followGraph.users || []).map((user) => {
        if (Number(user.sql_user_id) !== safeUserId) return user;
        return { ...user, ...payload };
    });
    renderFollowGraphList();
}

function getDiscoverFollowButtonLabel(user) {
    if (user?.is_following) return 'Following';
    if (user?.follow_request_pending) return 'Requested';
    if (user?.follows_you) return 'Follow back';
    return user?.is_private ? 'Request' : 'Follow';
}

function renderExplore() {
    const resultsEl = document.getElementById('discover-search-results');
    const statusEl = document.getElementById('discover-search-status');
    if (!resultsEl || !statusEl) return;

    updateDiscoverSearchClearButton();
    const query = state.discoverQuery.trim();
    if (!query) {
        if (state.discoverHistory.length > 0) {
            statusEl.textContent = 'Recent searches';
            resultsEl.innerHTML = `
                <div class="space-y-2">${state.discoverHistory.map((item) => `
                    <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 shadow-lg shadow-black/10 cursor-pointer flex items-center gap-3" data-action="run-discover-history" data-query="${escapeHtml(item)}">
                        <div class="h-10 w-10 rounded-2xl bg-white/[0.04] text-gray-400 flex items-center justify-center"><i data-lucide="history" class="w-4 h-4"></i></div>
                        <div class="min-w-0 flex-1">
                            <div class="truncate text-sm font-semibold text-white">${escapeHtml(item)}</div>
                            <div class="text-xs text-gray-500">Tap to search again</div>
                        </div>
                        <button type="button" data-action="remove-discover-history" data-query="${escapeHtml(item)}" class="h-9 w-9 rounded-full bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors">
                            <i data-lucide="x" class="w-4 h-4"></i>
                        </button>
                    </div>`).join('')}</div>`;
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
            return;
        }
        statusEl.textContent = 'Find people to follow';
        resultsEl.innerHTML = `
            <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-gray-400">
                Search by full name or username to discover people and follow them back.
            </div>`;
        return;
    }

    if (state.discoverLoading) {
        statusEl.textContent = 'Searching...';
        resultsEl.innerHTML = `
            <div class="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-6 text-sm text-gray-400">
                Looking for matches...
            </div>`;
        return;
    }

    const users = Array.isArray(state.discoverResults) ? state.discoverResults : [];
    statusEl.textContent = users.length > 0 ? `${users.length} result${users.length === 1 ? '' : 's'}` : 'No matches';
    if (users.length === 0) {
        resultsEl.innerHTML = `
            <div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-6 text-sm text-gray-500">
                No users found for "${escapeHtml(query)}".
            </div>`;
        return;
    }

    resultsEl.innerHTML = users.map((user) => {
        const avatar = user.profile_picture_url || defaultAvatar;
        const fullName = escapeHtml(user.full_name || user.username || 'Unknown user');
        const handle = escapeHtml(user.username ? `@${user.username}` : '');
        const subtitle = escapeHtml(user.is_following ? 'You are following this user' : (user.follow_request_pending ? 'Follow request pending' : (user.is_private ? 'Private account' : (user.follows_you ? 'Follows you' : 'Suggested match'))));
        const buttonLabel = getDiscoverFollowButtonLabel(user);
        return `
            <article class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 shadow-lg shadow-black/10 backdrop-blur-sm cursor-pointer" data-action="open-discover-profile" data-user-id="${user.sql_user_id}">
                <div class="flex items-center gap-3">
                    <img src="${avatar}" alt="${fullName}" class="h-14 w-14 rounded-2xl object-cover bg-slate-800">
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-bold text-white">${fullName}</div>
                        <div class="truncate text-sm text-gray-400">${handle}</div>
                        <div class="mt-1 text-xs text-gray-500">${subtitle}</div>
                    </div>
                    <button type="button" data-action="follow-user" data-user-id="${user.sql_user_id}"
                        class="rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${getFollowButtonClasses(user)}">
                        ${buttonLabel}
                    </button>
                </div>
            </article>`;
    }).join('');
}

async function runDiscoverSearch(query) {
    const trimmedQuery = String(query || '').trim();
    state.discoverQuery = trimmedQuery;
    if (!trimmedQuery) {
        state.discoverLoading = false;
        state.discoverResults = [];
        renderExplore();
        return;
    }

    state.discoverLoading = true;
    renderExplore();
    try {
        const data = await getJson(`/api/users/search?q=${encodeURIComponent(trimmedQuery)}&limit=20`);
        state.discoverResults = Array.isArray(data?.users) ? data.users : [];
        addDiscoverHistoryItem(trimmedQuery);
    } catch (error) {
        state.discoverResults = [];
        const statusEl = document.getElementById('discover-search-status');
        if (statusEl) statusEl.textContent = error.message || 'Search failed';
    } finally {
        state.discoverLoading = false;
        renderExplore();
    }
}

async function followDiscoverUser(targetUserId) {
    const safeUserId = Number(targetUserId);
    if (!Number.isFinite(safeUserId) || safeUserId <= 0) return;
    const relation = getUserFollowState(safeUserId);
    const nextAction = relation?.follow_request_pending ? 'cancel_request' : (relation?.is_following ? 'unfollow' : 'follow');
    try {
        const response = await postJson('/api/users/follow', { targetUserId: safeUserId, action: nextAction });
        state.discoverResults = state.discoverResults.map((user) => {
            if (Number(user.sql_user_id) !== safeUserId) return user;
            return { ...user, ...(response?.follow || {}) };
        });
        if (state.activeDiscoverProfile && Number(state.activeDiscoverProfile.sql_user_id) === safeUserId) {
            state.activeDiscoverProfile = { ...state.activeDiscoverProfile, ...(response?.follow || {}) };
            renderDiscoverProfileModal(state.activeDiscoverProfile);
        }
        updateFollowGraphUser(safeUserId, { ...(response?.follow || {}) });
        renderExplore();
        loadCurrentUserProfile();
        refreshFollowingFeed();
    } catch (error) {
        const statusEl = document.getElementById('discover-search-status');
        if (statusEl) statusEl.textContent = error.message || 'Follow update failed';
    }
}

function renderProfileGrid() {
    const grid = document.getElementById('profile-grid');
    const countEl = document.getElementById('profile-posts-count');
    if (!grid || !countEl) return;
    const myPosts = getAllPosts().filter((post) => post.username === state.currentUser.username);
    countEl.innerText = myPosts.length;

    if (!myPosts.length) {
        grid.innerHTML = `
            <div class="col-span-3 rounded-3xl border border-dashed border-white/10 bg-white/5 px-5 py-10 text-center md:col-span-3">
                <div class="text-base font-bold text-white">No posts or events yet</div>
                <p class="mt-2 text-sm text-gray-400">New accounts start clean here. Your uploads and hosted events will appear once you share something.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = myPosts.map((post) => `
        <div class="aspect-square bg-slate-800 relative group overflow-hidden md:rounded-lg cursor-pointer">
            <img src="${getPostPreviewImage(post)}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold">
                <span class="flex items-center gap-1"><i data-lucide="heart" class="w-4 h-4 fill-white"></i> ${post.likes}</span>
            </div>
        </div>
    `).join('');
}

function renderTicketList() {
    const container = document.getElementById('tickets-list');
    const emptyState = document.getElementById('empty-tickets');
    if (!container || !emptyState) return;

    if (state.tickets.length === 0) {
        emptyState.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = state.tickets.map((ticket) => {
        const isEnded = isEventEndedFromDetails(ticket.event.eventDetails);
        const expired = isTicketExpired(ticket);
        const isCancelled = ticket.status === 'cancelled';
        const statusLabel = isCancelled ? 'Cancelled' : (expired ? 'Expired' : 'Confirmed');
        const statusClass = isCancelled ? 'text-amber-200' : (expired ? 'text-rose-300' : 'text-cyan-400');
        const deleteVisible = state.ticketDeleteRevealId === String(ticket.id);
        return `
        <div class="relative group hover:scale-[1.02] transition-transform duration-300 ${isCancelled ? 'opacity-75' : ''}" data-action="ticket-card" data-ticket-id="${ticket.id}">
            <div class="absolute -inset-0.5 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 rounded-2xl opacity-75 blur group-hover:opacity-100 transition-opacity"></div>
            <div class="relative bg-slate-900 rounded-2xl overflow-hidden">
                <div class="h-24 w-full relative">
                    <img src="${ticket.event.image}" class="w-full h-full object-cover opacity-60">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
                    <div class="absolute bottom-2 left-4"><h3 class="font-black text-xl italic tracking-wide text-white">${ticket.event.eventDetails.title}</h3></div>
                </div>
                <div class="p-5 grid grid-cols-3 gap-4">
                    <div class="col-span-2 space-y-3">
                        <div><div class="text-[10px] uppercase text-gray-400 tracking-wider">Date</div><div class="font-bold text-white">${ticket.event.eventDetails.date}</div></div>
                        <div class="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs ${statusClass}"><i data-lucide="check" class="w-3 h-3"></i> ${statusLabel}</div>
                        ${isCancelled ? `<div class="flex flex-wrap items-center gap-2"><div class="text-xs text-gray-500">Cancelled ${formatNotificationTime(ticket.cancelledAt)}</div>${deleteVisible ? `<button type="button" data-action="delete-ticket" data-ticket-id="${ticket.id}" class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-gray-200 hover:bg-white/10 transition-colors">Delete</button>` : `<span class="text-[11px] text-gray-500">Long press card to show delete</span>`}</div>` : (expired ? `<div class="flex flex-wrap items-center gap-2"><button type="button" data-action="archive-ticket" data-ticket-id="${ticket.id}" class="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors">Archive</button><button type="button" data-action="delete-ticket" data-ticket-id="${ticket.id}" class="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-gray-200 hover:bg-white/10 transition-colors">Delete</button></div>` : `<button type="button" data-action="cancel-ticket" data-ticket-id="${ticket.id}" class="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 transition-colors">Cancel Ticket</button>`)}
                    </div>
                    <div class="col-span-1 flex flex-col items-center justify-center border-l border-white/10 pl-4">
                        <i data-lucide="qr-code" class="w-16 h-16 text-white mb-2"></i>
                        <span class="font-mono text-[10px] text-gray-500">#${String(ticket.id).substr(0,4)}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    }).join('');
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

let currentBookingEventId = null;

function openBookingModal(postId) {
    const event = getPostById(postId);
    if (!event || !event.eventDetails) return;
    currentBookingEventId = postId;

    const modal = document.getElementById('booking-modal');
    const content = document.getElementById('modal-content');
    const details = document.getElementById('modal-event-details');
    const fallbackPrice = Number(event.eventDetails.price) || 0;
    const rawTicketType = event.eventDetails.ticketType || '';
    const ticketType = rawTicketType || (fallbackPrice > 0 ? 'Paid' : 'Free');
    let ticketTiers = Array.isArray(event.eventDetails.ticketTiers) ? event.eventDetails.ticketTiers : [];
    if (ticketType === 'Paid' && ticketTiers.length === 0) {
        ticketTiers = [{ name: 'General', price: fallbackPrice }];
    }
    const baseFee = ticketType === 'Paid' ? 4 : 0;
    const isEnded = isEventEndedFromDetails(event.eventDetails);
    const existingTicket = getActiveTicketForEvent(postId);
    const isAlreadyJoined = Boolean(existingTicket);
    const highlights = getEventHighlightPosts(postId);

    details.innerHTML = `
        <div class="flex gap-5 mb-8">
            <img src="${event.image}" class="w-24 h-32 rounded-2xl object-cover shadow-2xl">
            <div class="pt-2">
                <div class="flex items-center gap-2 mb-2 flex-wrap">
                    <h3 class="font-black text-2xl leading-tight text-white">${event.eventDetails.title}</h3>
                    ${isEnded ? '<span class="px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold uppercase tracking-[0.2em]">Ended</span>' : ''}
                    ${isAlreadyJoined ? '<span class="px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold uppercase tracking-[0.2em]">Joined</span>' : ''}
                </div>
                <p class="text-fuchsia-400 font-medium mb-1">${event.eventDetails.date}</p>
                <p class="text-gray-400 text-sm">${event.eventDetails.location}</p>
                ${event.eventDetails.endLabel ? `<p class="text-xs text-gray-500 mt-1">Ends: ${event.eventDetails.endLabel}</p>` : ''}
                ${event.eventDetails.mapUrl ? `<a href="${event.eventDetails.mapUrl}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs text-cyan-300 hover:text-cyan-200">Open in Maps</a>` : ''}
            </div>
        </div>
        <div class="space-y-6">
            ${renderEventHighlightsSection('Pre-event Highlights', highlights.before, 'before')}
            ${renderEventHighlightsSection('Post-event Highlights', highlights.after, 'after')}
            ${isAlreadyJoined ? `
            <div class="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-4 text-sm text-cyan-100">
                You already joined this party. Cancel your ticket from the Tickets tab if you want to join again.
            </div>
            ` : (ticketType === 'Free' ? `
            <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                <span class="font-bold text-gray-300">Free Entry</span>
                <span class="text-sm font-semibold text-emerald-300">No charge</span>
            </div>
            ` : `
            <div class="space-y-3">
                <div class="text-sm font-semibold text-gray-300">Choose Ticket</div>
                <div class="space-y-2">
                    ${ticketTiers.map((tier, index) => `
                    <label class="flex items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/5 ${isEnded ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-fuchsia-500/40'} transition-colors">
                        <div class="flex items-center gap-3">
                            <input type="radio" name="booking-tier" value="${index}" ${index === 0 ? 'checked' : ''} class="accent-fuchsia-500" ${isEnded ? 'disabled' : ''}>
                            <div>
                                <div class="font-semibold text-white">${tier.name || 'General'}</div>
                                ${tier.services ? `<div class="text-xs text-gray-400">${tier.services}</div>` : ''}
                            </div>
                        </div>
                        <div class="text-fuchsia-400 font-bold">${formatInr(Number(tier.price) || 0)}</div>
                    </label>
                    `).join('')}
                </div>
            </div>
            `)}
            <div class="border-t border-white/10 pt-4 flex justify-between items-center">
                <span class="text-xl font-bold text-white">Total</span>
                <span id="booking-total-amount" class="text-2xl font-black ${(isEnded || isAlreadyJoined) ? 'text-rose-300' : 'text-fuchsia-400'}">${isEnded ? 'Closed' : (isAlreadyJoined ? 'Joined' : (ticketType === 'Free' ? 'Free' : formatInr((Number(ticketTiers[0]?.price) || 0) + baseFee)))}</span>
            </div>
            <button id="booking-action-btn" data-action="confirm-booking" class="w-full py-4 rounded-xl font-bold text-lg ${(isEnded || isAlreadyJoined) ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 text-white shadow-lg shadow-fuchsia-500/30'}" ${(isEnded || isAlreadyJoined) ? 'disabled' : ''}>${isEnded ? 'Event Ended' : (isAlreadyJoined ? 'Already Joined' : (ticketType === 'Free' ? 'Join Event' : 'Pay & Join'))}</button>
            <button data-action="close-booking-modal" class="w-full text-center text-sm text-gray-500 p-2 hover:text-white transition-colors">Cancel</button>
        </div>
    `;

    if (!isEnded && !isAlreadyJoined && ticketType === 'Paid') {
        const totalEl = document.getElementById('booking-total-amount');
        details.querySelectorAll('input[name="booking-tier"]').forEach((input) => {
            input.addEventListener('change', () => {
                const idx = Number(input.value);
                const nextPrice = Number(ticketTiers[idx]?.price) || 0;
                if (totalEl) totalEl.textContent = formatInr(nextPrice + baseFee);
            });
        });
    }

    modal.classList.remove('hidden');
    modal.scrollTop = 0;
    if (content) {
        content.scrollTop = 0;
    }
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        if (window.innerWidth >= 768) {
            content.classList.remove('translate-y-10');
        } else {
            content.classList.remove('translate-y-full');
        }
    }, 10);
}

function closeBookingModal() {
    const modal = document.getElementById('booking-modal');
    const content = document.getElementById('modal-content');
    if (!modal || !content) return;

    modal.classList.add('opacity-0');
    if (window.innerWidth >= 768) {
        content.classList.add('translate-y-10');
    } else {
        content.classList.add('translate-y-full');
    }

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

async function confirmBooking() {
    const event = getPostById(currentBookingEventId);
    if (!event || isEventEndedFromDetails(event.eventDetails)) {
        setLocationStatus('This event has already ended, so booking is closed.', true);
        closeBookingModal();
        return;
    }
    if (hasActiveTicketForEvent(event.id)) {
        setLocationStatus('You already joined this party. Cancel the existing ticket to join again.', true);
        closeBookingModal();
        return;
    }
    try {
        const data = await postJson('/api/tickets/book', { eventId: Number(String(event.id || '').replace('event-', '')) });
        const nextTicket = normalizeStoredTicket(data.ticket);
        state.tickets = [nextTicket, ...state.tickets.filter((entry) => String(entry.id) !== String(nextTicket.id))];
        persistTickets();
        renderTicketList();
        if (event.userId && Number(event.userId) !== Number(state.currentUser.id || 0)) {
            logActivity({ activityType: 'ticket_purchase', recipientUserId: event.userId, eventId: event.id, eventTitle: event.eventDetails?.title || 'your event' });
        }
        closeBookingModal();
        setTimeout(() => switchTab('tickets'), 300);
    } catch (error) {
        setLocationStatus(error.message || 'Failed to join this party.', true);
    }
}

function startHostedEventPress(event, postId) {
    if (event?.target?.closest('.hosted-event-menu')) return;
    clearTimeout(state.hostedPressTimerId);
    state.hostedPressTimerId = setTimeout(() => {
        state.hostedMenuEventPostId = postId;
        state.hostedSuppressClickPostId = postId;
        renderHostedEventList();
    }, 550);
}

function cancelHostedEventPress() {
    clearTimeout(state.hostedPressTimerId);
}

function startCancelledTicketDeletePress(event, ticketId) {
    clearTimeout(state.ticketPressTimerId);
    state.ticketPressTimerId = setTimeout(() => {
        state.ticketDeleteRevealId = String(ticketId || '');
        renderTicketList();
    }, 700);
}

function stopCancelledTicketDeletePress() {
    clearTimeout(state.ticketPressTimerId);
}

function handleTicketCardClick(ticketId) {
    const safeTicketId = String(ticketId || '');
    const ticket = (state.tickets || []).find((entry) => String(entry.id) === safeTicketId);
    if (!ticket) return;
    if (ticket.status === 'cancelled') {
        if (state.ticketDeleteRevealId === safeTicketId) {
            state.ticketDeleteRevealId = null;
            renderTicketList();
        }
        return;
    }
    if (ticket.event?.id) {
        openBookingModal(ticket.event.id);
    }
}

function handleHostedEventCardClick(postId) {
    if (state.hostedSuppressClickPostId === postId) {
        state.hostedSuppressClickPostId = null;
        return;
    }
    if (state.hostedMenuEventPostId && state.hostedMenuEventPostId !== postId) {
        state.hostedMenuEventPostId = null;
        renderHostedEventList();
    }
    openBookingModal(postId);
}

function closeHostedEventCard(postId) {
    if (state.hostedMenuEventPostId !== postId) return;
    state.hostedMenuEventPostId = null;
    state.hostedSuppressClickPostId = null;
    renderHostedEventList();
}

async function deleteHostedEvent(postId) {
    const eventId = Number(String(postId || '').replace('event-', ''));
    if (!Number.isFinite(eventId) || eventId <= 0) {
        setLocationStatus('Unable to delete this event.', true);
        return;
    }
    if (!window.confirm('Delete this event? This action cannot be undone.')) {
        return;
    }
    try {
        await deleteJson(`/api/events/${eventId}`);
        state.nearbyEventPosts = state.nearbyEventPosts.filter((item) => item.id !== postId);
        state.hostedEventPosts = state.hostedEventPosts.filter((item) => item.id !== postId);
        state.posts = state.posts
            .filter((item) => item.id !== postId)
            .map((item) => item.linkedEventId === postId ? { ...item, linkedEventId: null, linkedEventTitle: '' } : item);
        state.tickets = state.tickets.filter((ticket) => ticket?.event?.id !== postId);
        persistTickets();
        state.hostedMenuEventPostId = null;
        renderFeed();
        loadLiveNowEvents();
        renderHostedEventList();
        renderTicketList();
        renderProfileGrid();
    } catch (error) {
        setLocationStatus(error.message || 'Failed to delete event.', true);
    }
}

function renderHostedEventList() {
    const container = document.getElementById('hosted-events-list');
    const emptyState = document.getElementById('empty-hosted-events');
    if (!container || !emptyState) return;

    const hostedEvents = getHostedEvents();
    if (hostedEvents.length === 0) {
        emptyState.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }

    emptyState.classList.add('hidden');
    container.innerHTML = hostedEvents.map((eventPost) => {
        const menuVisible = state.hostedMenuEventPostId === eventPost.id;
        return `
        <div class="relative">
            <div class="relative group hover:scale-[1.02] transition-transform duration-300 cursor-pointer"
                data-action="hosted-event-card" data-post-id="${eventPost.id}">
                <div class="absolute -inset-0.5 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 rounded-2xl opacity-75 blur group-hover:opacity-100 transition-opacity"></div>
                <div class="relative bg-slate-900 rounded-2xl overflow-hidden border border-white/10">
                    ${menuVisible ? `
                    <button type="button" data-action="close-hosted-event-card" data-post-id="${eventPost.id}" aria-label="Minimize event card"
                        class="absolute top-3 right-3 z-10 h-9 w-9 rounded-full border border-white/20 bg-slate-950/75 text-white flex items-center justify-center shadow-lg shadow-black/30 backdrop-blur hover:bg-slate-900/90">
                        <i data-lucide="x" class="w-4 h-4 pointer-events-none"></i>
                    </button>` : ''}
                    <div class="h-28 w-full relative">
                        <img src="${eventPost.image}" class="w-full h-full object-cover opacity-60">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
                        <div class="absolute bottom-3 left-4">
                            <h3 class="font-black text-lg tracking-wide text-white">${eventPost.eventDetails.title}</h3>
                            <p class="text-xs text-gray-300 mt-0.5">${eventPost.eventDetails.location}</p>
                        </div>
                    </div>
                    <div class="p-4 flex items-center justify-between gap-3">
                        <div>
                            <div class="text-[10px] uppercase text-gray-400 tracking-wider">Date</div>
                            <div class="font-bold text-white text-sm">${eventPost.eventDetails.date}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-[10px] uppercase text-gray-400 tracking-wider">Status</div>
                            <div class="font-black ${isEventEndedFromDetails(eventPost.eventDetails) ? 'text-rose-300' : 'text-emerald-300'}">${isEventEndedFromDetails(eventPost.eventDetails) ? 'Ended' : 'Live'}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="hosted-event-menu mt-2 ${menuVisible ? '' : 'hidden'}">
                <button type="button" data-action="delete-hosted-event" data-post-id="${eventPost.id}"
                    class="w-full py-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 text-sm font-semibold hover:bg-rose-500/20 transition-colors">
                    Delete Event
                </button>
            </div>
        </div>`;
    }).join('');
}

function switchMyEventsTab(tabId) {
    state.myEventsTab = tabId === 'event' ? 'event' : 'tickets';
    const ticketsBtn = document.getElementById('btn-my-events-tickets');
    const eventBtn = document.getElementById('btn-my-events-event');
    const ticketsPanel = document.getElementById('tickets-panel');
    const eventPanel = document.getElementById('event-panel');

    if (state.myEventsTab === 'tickets') {
        if (ticketsBtn) ticketsBtn.className = 'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-slate-700 text-white shadow-lg';
        if (eventBtn) eventBtn.className = 'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white';
        if (ticketsPanel) ticketsPanel.classList.remove('hidden');
        if (eventPanel) eventPanel.classList.add('hidden');
    } else {
        if (eventBtn) eventBtn.className = 'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/20';
        if (ticketsBtn) ticketsBtn.className = 'flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white';
        if (eventPanel) eventPanel.classList.remove('hidden');
        if (ticketsPanel) ticketsPanel.classList.add('hidden');
    }
}

// --- Interaction Logic ---

function bindHomePageActions() {
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;

        switch (action) {
            case 'go-home':
                if (typeof goToHomeTabAndRefresh === 'function') {
                    goToHomeTabAndRefresh();
                }
                break;
            case 'switch-tab':
                if (actionEl.dataset.tab) {
                    switchTab(actionEl.dataset.tab);
                }
                break;
            case 'nav-click':
                if (actionEl.dataset.tab) {
                    switchTab(actionEl.dataset.tab);
                }
                break;
            case 'nav-center':
                switchTab('add');
                break;
            case 'logout':
                if (typeof handleLogout === 'function') {
                    handleLogout();
                }
                break;
            case 'open-settings':
                openSettingsModal();
                break;
            case 'close-settings':
                closeSettingsModal();
                break;
            case 'toggle-private-account':
                updatePrivateAccountSetting(!state.currentUser.isPrivate);
                break;
            case 'handle-follow-request':
                if (actionEl.dataset.requesterId && actionEl.dataset.requestAction) {
                    handleFollowRequestAction(actionEl.dataset.requesterId, actionEl.dataset.requestAction);
                }
                break;
            case 'location-toggle':
                if (actionEl.dataset.buttonId) {
                    handleLocationToggleTap(event, actionEl.dataset.buttonId);
                }
                break;
            case 'switch-my-events':
                if (actionEl.dataset.tab) {
                    switchMyEventsTab(actionEl.dataset.tab);
                }
                break;
            case 'close-booking-modal':
                closeBookingModal();
                break;
            case 'confirm-booking':
                confirmBooking();
                break;
            case 'cancel-ticket':
                event.stopPropagation();
                if (actionEl.dataset.ticketId) {
                    cancelTicket(actionEl.dataset.ticketId);
                }
                break;
            case 'archive-ticket':
                event.stopPropagation();
                if (actionEl.dataset.ticketId) {
                    archiveTicket(actionEl.dataset.ticketId);
                }
                break;
            case 'delete-ticket':
                event.stopPropagation();
                if (actionEl.dataset.ticketId) {
                    deleteTicket(actionEl.dataset.ticketId);
                }
                break;
            case 'close-location-modal':
                closeLocationModal();
                break;
            case 'toggle-location-enabled':
                toggleLocationModalEnabled();
                break;
            case 'use-detected-location':
                useDetectedLocationInModal();
                break;
            case 'save-location-modal':
                saveLocationModal();
                break;
            case 'clear-location-modal':
                clearLocationModal();
                break;
            case 'toggle-like':
                toggleLike(actionEl);
                break;
            case 'open-booking-modal':
                if (actionEl.dataset.postId) {
                    openBookingModal(actionEl.dataset.postId);
                }
                break;
            case 'stop-prop':
                event.stopPropagation();
                break;
            case 'shift-post-media':
                event.stopPropagation();
                shiftPostMedia(actionEl.dataset.postId, Number(actionEl.dataset.direction || 0));
                break;
            case 'delete-hosted-event':
                event.stopPropagation();
                if (actionEl.dataset.postId) {
                    deleteHostedEvent(actionEl.dataset.postId);
                }
                break;
            case 'close-hosted-event-card':
                event.stopPropagation();
                if (actionEl.dataset.postId) {
                    closeHostedEventCard(actionEl.dataset.postId);
                }
                break;
            case 'follow-user':
                event.stopPropagation();
                if (actionEl.dataset.userId) {
                    followDiscoverUser(actionEl.dataset.userId);
                }
                break;
            case 'open-discover-profile':
                if (actionEl.dataset.userId) {
                    openDiscoverProfile(actionEl.dataset.userId);
                }
                break;
            case 'open-public-profile-booking':
                event.stopPropagation();
                closeDiscoverProfile();
                if (actionEl.dataset.postId) {
                    openBookingModal(actionEl.dataset.postId);
                }
                break;
            case 'close-discover-profile':
                closeDiscoverProfile();
                break;
            case 'open-follow-graph':
                if (actionEl.dataset.graph) {
                    openFollowGraph(actionEl.dataset.graph);
                }
                break;
            case 'close-follow-graph':
                closeFollowGraph();
                break;
            case 'open-notifications':
                openNotifications();
                break;
            case 'close-notifications':
                closeNotifications();
                break;
            case 'clear-discover-search':
                event.stopPropagation();
                clearDiscoverSearch();
                break;
            case 'run-discover-history':
                if (actionEl.dataset.query) {
                    setDiscoverSearchValue(actionEl.dataset.query, { render: false });
                    runDiscoverSearch(actionEl.dataset.query);
                }
                break;
            case 'remove-discover-history':
                event.stopPropagation();
                if (actionEl.dataset.query) {
                    removeDiscoverHistoryItem(actionEl.dataset.query);
                    renderExplore();
                }
                break;
            default:
                break;
        }
    });

    document.addEventListener('touchstart', (event) => {
        const swipeEl = event.target.closest('[data-action="post-swipe"]');
        if (!swipeEl) return;
        const postId = swipeEl.dataset.postId;
        if (postId) {
            startPostSwipe(event, postId);
        }
    }, { passive: true });

    document.addEventListener('touchend', (event) => {
        const swipeEl = event.target.closest('[data-action="post-swipe"]');
        if (!swipeEl) return;
        const postId = swipeEl.dataset.postId;
        if (postId) {
            endPostSwipe(event, postId);
        }
    });

    document.addEventListener('pointerdown', (event) => {
        const cancelledTicketCard = event.target.closest('[data-action="ticket-card"]');
        if (cancelledTicketCard?.dataset.ticketId) {
            const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(cancelledTicketCard.dataset.ticketId));
            if (ticket?.status === 'cancelled') {
                startCancelledTicketDeletePress(event, cancelledTicketCard.dataset.ticketId);
            }
        }
        const card = event.target.closest('[data-action="hosted-event-card"]');
        if (!card) return;
        startHostedEventPress(event, card.dataset.postId);
    });

    document.addEventListener('pointerup', (event) => {
        stopCancelledTicketDeletePress();
        const card = event.target.closest('[data-action="hosted-event-card"]');
        if (!card) return;
        cancelHostedEventPress();
    });

    document.addEventListener('pointerout', (event) => {
        stopCancelledTicketDeletePress();
        const card = event.target.closest('[data-action="hosted-event-card"]');
        if (!card) return;
        cancelHostedEventPress();
    });

    document.addEventListener('pointercancel', (event) => {
        stopCancelledTicketDeletePress();
        const card = event.target.closest('[data-action="hosted-event-card"]');
        if (!card) return;
        cancelHostedEventPress();
    });

    document.addEventListener('click', (event) => {
        const ticketCard = event.target.closest('[data-action="ticket-card"]');
        if (ticketCard && !event.target.closest('[data-action="cancel-ticket"]') && !event.target.closest('[data-action="delete-ticket"]') && !event.target.closest('[data-action="archive-ticket"]')) {
            handleTicketCardClick(ticketCard.dataset.ticketId);
        }
        const card = event.target.closest('[data-action="hosted-event-card"]');
        if (!card) return;
        handleHostedEventCardClick(card.dataset.postId);
    });
}

function switchTab(tabId) {
    state.activeTab = tabId;
    localStorage.setItem('happnix_active_tab', tabId);
    try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tabId);
        window.history.replaceState({}, '', url);
    } catch (err) {
        // ignore URL update failures (e.g., sandboxed environments)
    }
    
    // Update Navigation UI (Handles both Mobile and Desktop navs)
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const icon = btn.querySelector('svg') || btn.querySelector('i');
        const text = btn.querySelector('span'); // for desktop labels

        if (btn.dataset.target === tabId) {
            btn.classList.add('text-fuchsia-400', 'active');
            btn.classList.remove('text-gray-400');
            // Mobile styling
            if (btn.classList.contains('justify-center')) {
                btn.classList.add('scale-110');
            }
            // Icon Glow
            if (icon) icon.classList.add('drop-shadow-[0_0_8px_rgba(232,121,249,0.5)]');
            // Desktop Text Color
            if (text) {
                text.classList.remove('group-hover:text-white');
                text.classList.add('text-white');
            }
        } else {
            btn.classList.remove('text-fuchsia-400', 'active', 'scale-110');
            btn.classList.add('text-gray-400');
            if (icon) icon.classList.remove('drop-shadow-[0_0_8px_rgba(232,121,249,0.5)]');
            if (text) {
                text.classList.add('group-hover:text-white');
                text.classList.remove('text-white');
            }
        }
    });

    // Update View Visibility
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${tabId}`).classList.add('active');
    
    // Hide Mobile Header on Search/Add
    const header = document.getElementById('main-header');
    if (header) {
        if(tabId === 'search' || tabId === 'add') header.style.transform = 'translateY(-100%)';
        else header.style.transform = 'translateY(0)';
    }
    if (tabId === 'profile') {
        loadCurrentUserProfile();
    }
    if (tabId === 'tickets') {
        renderTicketList();
        renderHostedEventList();
        switchMyEventsTab(state.myEventsTab);
    }
}

// Group ticket overrides
const bookingDraftState = { invitees: [], searchResults: [], inviteeStatuses: {} };
const groupTicketDetailState = { ticketId: null, searchResults: [], selectedPendingTicketIds: [], selectedTierIndex: 0 };

function inferEventTicketType(event) {
    const fallbackPrice = Number(event?.eventDetails?.price) || 0;
    const rawTicketType = String(event?.eventDetails?.ticketType || '').trim();
    return rawTicketType || (fallbackPrice > 0 ? 'Paid' : 'Free');
}

function upsertStoredTicket(ticketPayload) {
    const nextTicket = normalizeStoredTicket(ticketPayload);
    if (!nextTicket) return null;
    state.tickets = [nextTicket, ...state.tickets.filter((entry) => String(entry.id) !== String(nextTicket.id))];
    persistTickets();
    renderTicketList();
    return nextTicket;
}

function normalizeStoredTicket(ticket) {
    if (!ticket || !ticket.event) return null;
    const event = ticket.event;
    const eventDetails = event.eventDetails || {};
    const normalizedEvent = event.isEvent ? event : serverEventToPost(event);
    const status = ticket.status === 'cancelled' ? 'cancelled' : (ticket.status === 'pending' ? 'pending' : 'active');
    const participants = Array.isArray(ticket.participants) && ticket.participants.length
        ? ticket.participants.map((participant) => ({
            ticketId: String(participant.ticketId || ''),
            userId: Number(participant.userId || 0) || null,
            username: String(participant.username || '').trim(),
            status: participant.status === 'cancelled' ? 'cancelled' : (participant.status === 'pending' ? 'pending' : 'active'),
            bookedById: Number(participant.bookedById || 0) || null,
            bookedByUsername: String(participant.bookedByUsername || '').trim(),
            paidById: Number(participant.paidById || 0) || null,
            paidByUsername: String(participant.paidByUsername || '').trim(),
            inviteStatus: String(participant.inviteStatus || 'confirmed').trim().toLowerCase(),
            pendingReason: String(participant.pendingReason || '').trim().toLowerCase(),
            paymentTransactionId: String(participant.paymentTransactionId || '').trim(),
            refundTransactionId: String(participant.refundTransactionId || '').trim(),
            ticketPrice: Number(participant.ticketPrice || 0) || 0,
            serviceFee: Number(participant.serviceFee || 0) || 0,
            amountDue: Number(participant.amountDue || 0) || 0,
            isCurrentUser: Boolean(participant.isCurrentUser),
            isPaid: Boolean(participant.isPaid),
        }))
        : [{
            ticketId: String(ticket.id || ''), userId: Number(ticket.userId || state.currentUser.id || 0) || null,
            username: String(ticket.username || state.currentUser.username || '').trim(), status,
            bookedById: Number(ticket.bookedById || ticket.userId || state.currentUser.id || 0) || null,
            bookedByUsername: String(ticket.bookedByUsername || ticket.username || state.currentUser.username || '').trim(),
            paidById: Number(ticket.paidById || 0) || null, paidByUsername: String(ticket.paidByUsername || '').trim(),
            inviteStatus: String(ticket.inviteStatus || 'confirmed').trim().toLowerCase(),
            pendingReason: String(ticket.pendingReason || '').trim().toLowerCase(),
            paymentTransactionId: String(ticket.paymentTransactionId || '').trim(),
            refundTransactionId: String(ticket.refundTransactionId || '').trim(),
            ticketPrice: Number(ticket.ticketPrice || 0) || 0, serviceFee: Number(ticket.serviceFee || 0) || 0,
            amountDue: Number(ticket.amountDue || 0) || 0, isCurrentUser: true, isPaid: status === 'active',
        }];
    return {
        id: String(ticket.id || `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        groupCode: String(ticket.groupCode || ticket.id || ''), userId: Number(ticket.userId || state.currentUser.id || 0) || null,
        username: String(ticket.username || state.currentUser.username || '').trim(),
        bookedById: Number(ticket.bookedById || ticket.userId || state.currentUser.id || 0) || null,
        bookedByUsername: String(ticket.bookedByUsername || ticket.username || state.currentUser.username || '').trim(),
        paidById: Number(ticket.paidById || 0) || null, paidByUsername: String(ticket.paidByUsername || '').trim(),
        inviteStatus: String(ticket.inviteStatus || 'confirmed').trim().toLowerCase(),
        pendingReason: String(ticket.pendingReason || '').trim().toLowerCase(),
        paymentTransactionId: String(ticket.paymentTransactionId || '').trim(), refundTransactionId: String(ticket.refundTransactionId || '').trim(),
        qty: Math.max(1, Number(ticket.qty || 1)), status, tierName: String(ticket.tierName || 'General').trim(),
        ticketPrice: Number(ticket.ticketPrice || 0) || 0, serviceFee: Number(ticket.serviceFee || 0) || 0,
        amountDue: Number(ticket.amountDue || 0) || 0, createdAt: ticket.createdAt || new Date().toISOString(),
        cancelledAt: ticket.cancelledAt || null, archivedAt: ticket.archivedAt || null, isExpired: Boolean(ticket.isExpired),
        canPay: Boolean(ticket.canPay || status === 'pending'), participants,
        event: { ...normalizedEvent, id: String(normalizedEvent.id || event.id || ''), image: normalizedEvent.image || defaultAvatar,
            eventDetails: { ...(normalizedEvent.eventDetails || {}), ...eventDetails,
                title: String((normalizedEvent.eventDetails || {}).title || eventDetails.title || event.title || 'Untitled event').trim(),
                date: String((normalizedEvent.eventDetails || {}).date || eventDetails.date || eventDetails.startLabel || 'Date TBD').trim(),
                startLabel: String((normalizedEvent.eventDetails || {}).startLabel || eventDetails.startLabel || eventDetails.date || '').trim(),
                endLabel: String((normalizedEvent.eventDetails || {}).endLabel || eventDetails.endLabel || '').trim(), } },
    };
}

function getActiveTicketForEvent(eventId) {
    const safeEventId = String(eventId || '');
    const currentUserId = Number(state.currentUser.id || 0);
    const currentUsername = String(state.currentUser.username || '').trim().toLowerCase();
    return (state.tickets || []).find((ticket) => {
        if (!ticket || ticket.status === 'cancelled') return false;
        if (String(ticket.event?.id || '') !== safeEventId) return false;
        const ticketUserId = Number(ticket.userId || 0);
        const ticketUsername = String(ticket.username || '').trim().toLowerCase();
        if (currentUserId > 0 && ticketUserId > 0) return ticketUserId === currentUserId;
        return currentUsername && ticketUsername === currentUsername;
    }) || null;
}

function hasActiveTicketForEvent(eventId) { return !!getActiveTicketForEvent(eventId); }
function ticketStatusMeta(ticket) {
    const expired = isTicketExpired(ticket);
    if (ticket?.status === 'cancelled') return { label: 'Cancelled', className: 'text-amber-200', icon: 'circle-off' };
    if (expired) return { label: 'Expired', className: 'text-rose-300', icon: 'clock-3' };
    if (ticket?.status === 'pending' && ticket?.pendingReason === 'tentative') return { label: 'Tentative', className: 'text-amber-200', icon: 'hourglass' };
    if (ticket?.status === 'pending') return { label: 'Pending Payment', className: 'text-amber-200', icon: 'wallet' };
    return { label: 'Joined', className: 'text-cyan-400', icon: 'badge-check' };
}
function ticketParticipantStatusMeta(participant) {
    if (!participant) return { label: 'Pending', className: 'text-amber-200' };
    if (participant.status === 'cancelled') return { label: 'Cancelled', className: 'text-amber-200' };
    if (participant.status === 'pending' && participant.inviteStatus === 'tentative') return { label: 'Tentative', className: 'text-amber-200' };
    if (participant.status === 'pending' && participant.pendingReason === 'payment') return { label: 'Pending Payment', className: 'text-amber-200' };
    if (participant.status === 'pending') return { label: 'Pending', className: 'text-amber-200' };
    return { label: 'Joined', className: 'text-emerald-300' };
}

function renderTicketList() {
    const container = document.getElementById('tickets-list');
    const emptyState = document.getElementById('empty-tickets');
    if (!container || !emptyState) return;
    if (state.tickets.length === 0) { emptyState.classList.remove('hidden'); container.innerHTML = ''; return; }
    emptyState.classList.add('hidden');
    container.innerHTML = state.tickets.map((ticket) => {
        const statusMeta = ticketStatusMeta(ticket);
        const participants = Array.isArray(ticket.participants) ? ticket.participants : [];
        const pendingCount = participants.filter((participant) => participant.status === 'pending').length;
        const joinedCount = participants.filter((participant) => participant.status === 'active').length;
        return `<div class="relative group hover:scale-[1.02] transition-transform duration-300 cursor-pointer" data-action="ticket-card" data-ticket-id="${ticket.id}"><div class="absolute -inset-0.5 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 rounded-2xl opacity-75 blur group-hover:opacity-100 transition-opacity"></div><div class="relative bg-slate-900 rounded-2xl overflow-hidden"><div class="h-28 w-full relative"><img src="${ticket.event.image}" class="w-full h-full object-cover opacity-60"><div class="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div><div class="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-3"><h3 class="font-black text-xl italic tracking-wide text-white">${escapeHtml(ticket.event.eventDetails.title)}</h3><span class="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-bold text-white">${escapeHtml(ticket.tierName || 'General')}</span></div></div><div class="p-5 space-y-4"><div class="flex items-start justify-between gap-3"><div><div class="text-[10px] uppercase text-gray-400 tracking-wider">Date</div><div class="font-bold text-white">${escapeHtml(ticket.event.eventDetails.date)}</div></div><div class="text-right"><div class="text-[10px] uppercase text-gray-400 tracking-wider">Your Total</div><div class="font-black text-fuchsia-300">${ticket.amountDue > 0 ? formatInr(ticket.amountDue) : 'Free'}</div></div></div><div class="flex flex-wrap items-center gap-2"><div class="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs ${statusMeta.className}"><i data-lucide="${statusMeta.icon}" class="w-3 h-3"></i> ${statusMeta.label}</div><div class="text-[11px] text-gray-400">${joinedCount} joined${pendingCount ? `, ${pendingCount} pending` : ''}</div></div><div class="text-sm text-gray-400">Tap to view ticket details, participants, and payment status.</div></div></div></div>`;
    }).join('');
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
function selectedBookingTierIndex() { const checked = document.querySelector('input[name="booking-tier"]:checked'); return checked ? Number(checked.value || 0) : 0; }
function getBookingParticipants() { return [{ userId: Number(state.currentUser.id || 0) || null, username: String(state.currentUser.username || '').trim(), isSelf: true }, ...(bookingDraftState.invitees || []).map((user) => ({ ...user, isSelf: false }))]; }
function getBookingPaidForUserIds() { return Array.from(document.querySelectorAll('input[name="booking-pay-for"]:checked')).map((input) => Number(input.value || 0)).filter((value) => value > 0); }
function updateBookingTotal() {
    const totalEl = document.getElementById('booking-total-amount'); if (!totalEl) return;
    const event = getPostById(currentBookingEventId); if (inferEventTicketType(event) === 'Free') { totalEl.textContent = 'Free'; return; }
    const tierInput = document.querySelector('input[name="booking-tier"]:checked'); if (!tierInput) return;
    const ticketPrice = Number(tierInput.dataset.price || 0) || 0; const fee = Number(tierInput.dataset.fee || 0) || 0; const paidCount = Math.max(1, getBookingPaidForUserIds().length);
    totalEl.textContent = ticketPrice + fee > 0 ? formatInr((ticketPrice + fee) * paidCount) : 'Free';
}
function renderBookingInvitees() {
    const selectedEl = document.getElementById('booking-invitees'); const paidListEl = document.getElementById('booking-paid-list');
    const isFree = inferEventTicketType(getPostById(currentBookingEventId)) === 'Free';
    if (selectedEl) selectedEl.innerHTML = bookingDraftState.invitees.length ? bookingDraftState.invitees.map((user) => { const inviteStatus = bookingDraftState.inviteeStatuses[String(user.userId)] || 'confirmed'; return `<div class="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"><div class="flex items-center justify-between gap-3"><div><div class="font-semibold text-white">@${escapeHtml(user.username)}</div><div class="text-xs text-gray-400">${isFree ? 'Choose confirmed or tentative before sending the ticket.' : 'Included in this group ticket'}</div></div><button type="button" data-action="remove-booking-invitee" data-user-id="${user.userId}" class="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 transition-colors">Remove</button></div>${isFree ? `<div class="mt-3"><select data-action="booking-invite-status" data-user-id="${user.userId}" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none"><option value="confirmed" ${inviteStatus === 'confirmed' ? 'selected' : ''}>Confirm</option><option value="tentative" ${inviteStatus === 'tentative' ? 'selected' : ''}>Tentative</option></select></div>` : ''}</div>`; }).join('') : `<div class="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm text-gray-500">${isFree ? 'Add people and mark them confirmed or tentative before you send the ticket.' : 'Add people to this group booking. You can choose who you pay for now and who stays pending.'}</div>`;
    if (paidListEl) {
        if (isFree) paidListEl.innerHTML = '';
        else { paidListEl.innerHTML = getBookingParticipants().map((user) => `<label class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 ${user.isSelf ? 'border-cyan-400/30 bg-cyan-500/10' : ''}"><div><div class="font-semibold text-white">${user.isSelf ? 'You' : `@${escapeHtml(user.username)}`}</div><div class="text-xs text-gray-400">${user.isSelf ? 'Always selected and always paid now' : 'Check if you want to pay for this person now'}</div></div><input type="checkbox" name="booking-pay-for" value="${user.userId}" class="h-4 w-4 accent-fuchsia-500" ${user.isSelf ? 'checked disabled' : ''}></label>`).join(''); paidListEl.querySelectorAll('input[name="booking-pay-for"]').forEach((input) => input.addEventListener('change', updateBookingTotal)); }
    }
    updateBookingTotal();
}
function renderBookingSearchResults() {
    const resultsEl = document.getElementById('booking-search-results'); if (!resultsEl) return;
    if (!bookingDraftState.searchResults.length) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = bookingDraftState.searchResults.map((user) => `<button type="button" data-action="add-booking-invitee" data-user-id="${user.userId}" class="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3 text-left hover:border-fuchsia-500/30"><div><div class="font-semibold text-white">@${escapeHtml(user.username)}</div><div class="text-xs text-gray-400">${escapeHtml(user.fullName || 'Tap to add to this ticket')}</div></div><span class="text-xs font-bold text-fuchsia-300">Add</span></button>`).join('');
}
async function searchBookingInvitees(query) {
    const safeQuery = String(query || '').trim(); if (!safeQuery) { bookingDraftState.searchResults = []; renderBookingSearchResults(); return; }
    try { const response = await getJson(`/api/users/search?q=${encodeURIComponent(safeQuery)}&limit=6`); const existingIds = new Set([Number(state.currentUser.id || 0), ...(bookingDraftState.invitees || []).map((user) => Number(user.userId || 0))]); bookingDraftState.searchResults = (response.users || []).map((user) => ({ userId: Number(user.sql_user_id || 0), username: String(user.username || '').trim(), fullName: String(user.full_name || '').trim() })).filter((user) => user.userId > 0 && user.username && !existingIds.has(user.userId)); } catch (_error) { bookingDraftState.searchResults = []; }
    renderBookingSearchResults();
}
function bindBookingActionButton(postId) {
    const actionButton = document.getElementById('booking-action-btn'); if (!actionButton) return; const event = getPostById(postId); const existingTicket = getActiveTicketForEvent(postId);
    const isEnded = isEventEndedFromDetails(event?.eventDetails || {}); const ticketType = inferEventTicketType(event); const alreadyJoined = existingTicket && existingTicket.status === 'active' && !existingTicket.canPay; const pendingTicket = existingTicket && existingTicket.status === 'pending';
    actionButton.disabled = Boolean(isEnded || alreadyJoined); actionButton.textContent = isEnded ? 'Event Ended' : (alreadyJoined ? 'Already Joined' : (pendingTicket ? 'Pay & Join' : (ticketType === 'Free' ? 'Join Group Event' : 'Book Group Ticket')));
    actionButton.className = `w-full py-4 rounded-xl font-bold text-lg ${actionButton.disabled ? 'bg-white/10 text-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 text-white shadow-lg shadow-fuchsia-500/30'}`; actionButton.type = 'button'; actionButton.style.pointerEvents = 'auto'; actionButton.style.position = 'relative'; actionButton.style.zIndex = '5';
    actionButton.onclick = (eventLike) => { eventLike.preventDefault(); eventLike.stopPropagation(); if (actionButton.disabled) return false; confirmBooking(); return false; };
}
function openBookingModal(postId) {
    const event = getPostById(postId); if (!event || !event.eventDetails) return; currentBookingEventId = postId; bookingDraftState.invitees = []; bookingDraftState.searchResults = []; bookingDraftState.inviteeStatuses = {};
    const modal = document.getElementById('booking-modal'); const content = document.getElementById('modal-content'); const details = document.getElementById('modal-event-details'); const fallbackPrice = Number(event.eventDetails.price) || 0; const ticketType = inferEventTicketType(event); let ticketTiers = Array.isArray(event.eventDetails.ticketTiers) ? event.eventDetails.ticketTiers : []; if (ticketType === 'Paid' && ticketTiers.length === 0) ticketTiers = [{ name: 'General', price: fallbackPrice }];
    const baseFee = ticketType === 'Paid' ? 4 : 0; const isEnded = isEventEndedFromDetails(event.eventDetails); const existingTicket = getActiveTicketForEvent(postId); const highlights = getEventHighlightPosts(postId); const alreadyJoined = existingTicket && existingTicket.status === 'active' && !existingTicket.canPay; const pendingTicket = existingTicket && existingTicket.status === 'pending';
    details.innerHTML = `<div class="flex gap-5 mb-8"><img src="${event.image}" class="w-24 h-32 rounded-2xl object-cover shadow-2xl"><div class="pt-2"><div class="flex items-center gap-2 mb-2 flex-wrap"><h3 class="font-black text-2xl leading-tight text-white">${escapeHtml(event.eventDetails.title)}</h3>${isEnded ? '<span class="px-2 py-1 rounded-full bg-rose-500/15 text-rose-300 text-[10px] font-bold uppercase tracking-[0.2em]">Ended</span>' : ''}${alreadyJoined ? '<span class="px-2 py-1 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-bold uppercase tracking-[0.2em]">Joined</span>' : ''}${pendingTicket ? '<span class="px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 text-[10px] font-bold uppercase tracking-[0.2em]">Pending</span>' : ''}</div><p class="text-fuchsia-400 font-medium mb-1">${escapeHtml(event.eventDetails.date)}</p><p class="text-gray-400 text-sm">${escapeHtml(event.eventDetails.location)}</p>${event.eventDetails.endLabel ? `<p class="text-xs text-gray-500 mt-1">Ends: ${escapeHtml(event.eventDetails.endLabel)}</p>` : ''}${event.eventDetails.mapUrl ? `<a href="${event.eventDetails.mapUrl}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs text-cyan-300 hover:text-cyan-200">Open in Maps</a>` : ''}</div></div><div class="space-y-6">${renderEventHighlightsSection('Pre-event Highlights', highlights.before, 'before')}${renderEventHighlightsSection('Post-event Highlights', highlights.after, 'after')}${alreadyJoined ? `<div class="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-4 text-sm text-cyan-100">You already joined this party. Your ticket is visible in My Events with the rest of your group.</div>` : (pendingTicket ? `<div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">@${escapeHtml(existingTicket.bookedByUsername || existingTicket.username)} added you to this ticket. Open My Events to manage your pending ticket.</div>` : `${ticketType === 'Free' ? `<div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5"><span class="font-bold text-gray-300">Free Entry</span><span class="text-sm font-semibold text-emerald-300">No charge</span></div>` : `<div class="space-y-3"><div class="text-sm font-semibold text-gray-300">Choose Ticket</div><div class="space-y-2">${ticketTiers.map((tier, index) => `<label class="flex items-center justify-between gap-3 bg-white/5 p-3 rounded-2xl border border-white/5 ${isEnded ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-fuchsia-500/40'} transition-colors"><div class="flex items-center gap-3"><input type="radio" name="booking-tier" value="${index}" data-price="${Number(tier.price) || 0}" data-fee="${baseFee}" ${index === 0 ? 'checked' : ''} class="accent-fuchsia-500" ${isEnded ? 'disabled' : ''}><div><div class="font-semibold text-white">${escapeHtml(tier.name || 'General')}</div>${tier.services ? `<div class="text-xs text-gray-400">${escapeHtml(tier.services)}</div>` : ''}</div></div><div class="text-fuchsia-400 font-bold">${formatInr(Number(tier.price) || 0)}</div></label>`).join('')}</div></div>`}<div class="space-y-3"><div class="text-sm font-semibold text-gray-300">Add People</div><div class="rounded-3xl border border-white/10 bg-white/[0.03] p-4 space-y-3"><input id="booking-user-search" type="text" placeholder="Search username to add people" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-fuchsia-500/50 focus:outline-none"><div id="booking-search-results" class="space-y-2"></div><div id="booking-invitees" class="space-y-2"></div></div></div>${ticketType === 'Paid' ? `<div class="space-y-3"><div class="text-sm font-semibold text-gray-300">Select Who You Pay For</div><div id="booking-paid-list" class="space-y-2"></div></div>` : `<div class="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">Everyone marked confirmed joins now. Anyone marked tentative gets a pending ticket, a message, and a notification.</div>`}`)}<div class="border-t border-white/10 pt-4 flex justify-between items-center"><span class="text-xl font-bold text-white">Total</span><span id="booking-total-amount" class="text-2xl font-black ${(isEnded || alreadyJoined) ? 'text-rose-300' : 'text-fuchsia-400'}">${isEnded ? 'Closed' : (alreadyJoined ? 'Joined' : (pendingTicket ? (existingTicket.amountDue > 0 ? formatInr(existingTicket.amountDue || 0) : 'Pending') : (ticketType === 'Free' ? 'Free' : formatInr((Number(ticketTiers[0]?.price) || 0) + baseFee))))}</span></div><button id="booking-action-btn" data-action="confirm-booking">Loading</button><button data-action="close-booking-modal" class="w-full text-center text-sm text-gray-500 p-2 hover:text-white transition-colors">Cancel</button></div>`;
    if (!isEnded && !alreadyJoined && !pendingTicket) { renderBookingInvitees(); const searchInput = document.getElementById('booking-user-search'); if (searchInput) searchInput.addEventListener('input', () => searchBookingInvitees(searchInput.value)); details.querySelectorAll('input[name="booking-tier"]').forEach((input) => input.addEventListener('change', updateBookingTotal)); updateBookingTotal(); }
    bindBookingActionButton(postId); modal.classList.remove('hidden'); modal.scrollTop = 0; if (content) content.scrollTop = 0; setTimeout(() => { modal.classList.remove('opacity-0'); if (window.innerWidth >= 768) content.classList.remove('translate-y-10'); else content.classList.remove('translate-y-full'); }, 10);
}
async function confirmBooking() {
    const event = getPostById(currentBookingEventId); if (!event || isEventEndedFromDetails(event.eventDetails)) { setLocationStatus('This event has already ended, so booking is closed.', true); closeBookingModal(); return; }
    const existingTicket = getActiveTicketForEvent(event.id); if (existingTicket && existingTicket.status !== 'cancelled') { closeBookingModal(); openTicketDetailsModal(existingTicket.id); return; }
    const fallbackPrice = Number(event.eventDetails.price) || 0; const ticketType = inferEventTicketType(event); let ticketTiers = Array.isArray(event.eventDetails.ticketTiers) ? event.eventDetails.ticketTiers : []; if (ticketType === 'Paid' && ticketTiers.length === 0) ticketTiers = [{ name: 'General', price: fallbackPrice }];
    const baseFee = ticketType === 'Paid' ? 4 : 0; const tierIndex = selectedBookingTierIndex(); const selectedTier = ticketTiers[tierIndex] || ticketTiers[0] || { name: 'General', price: fallbackPrice }; const inviteeStatuses = {};
    Object.entries(bookingDraftState.inviteeStatuses || {}).forEach(([userId, status]) => { inviteeStatuses[userId] = String(status || 'confirmed').trim().toLowerCase() === 'tentative' ? 'tentative' : 'confirmed'; });
    try { const data = await postJson('/api/tickets/book', { eventId: Number(String(event.id || '').replace('event-', '')), inviteeUserIds: bookingDraftState.invitees.map((user) => user.userId), inviteeStatuses, paidForUserIds: ticketType === 'Paid' ? getBookingPaidForUserIds() : [Number(state.currentUser.id || 0)], tierName: selectedTier.name || 'General', ticketPrice: Number(selectedTier.price) || 0, serviceFee: baseFee, }); const nextTicket = upsertStoredTicket(data.ticket); if (event.userId && Number(event.userId) !== Number(state.currentUser.id || 0)) logActivity({ activityType: 'ticket_purchase', recipientUserId: event.userId, eventId: event.id, eventTitle: event.eventDetails?.title || 'your event' }); closeBookingModal(); setTimeout(() => { switchTab('tickets'); if (nextTicket) openTicketDetailsModal(nextTicket.id); }, 300); } catch (error) { setLocationStatus(error.message || 'Failed to join this party.', true); }
}
function describeParticipantSecondary(ticket, participant) { if (participant.refundTransactionId) return `Refund: ${escapeHtml(participant.refundTransactionId)}`; if (participant.paymentTransactionId) return `Payment: ${escapeHtml(participant.paymentTransactionId)}`; if (participant.paidByUsername) return `Paid by @${escapeHtml(participant.paidByUsername)}`; if (participant.status === 'pending' && participant.inviteStatus === 'tentative') return 'Waiting for confirmation'; if (participant.status === 'pending') return 'Waiting for payment'; return `Added by @${escapeHtml(participant.bookedByUsername || ticket.bookedByUsername || ticket.username)}`; }
async function searchGroupInvitees(ticketId, query) {
    const safeQuery = String(query || '').trim(); groupTicketDetailState.ticketId = String(ticketId || '');
    if (!safeQuery) { groupTicketDetailState.searchResults = []; openTicketDetailsModal(ticketId); return; }
    const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(ticketId)); if (!ticket) return;
    try { const response = await getJson(`/api/users/search?q=${encodeURIComponent(safeQuery)}&limit=6`); const existingIds = new Set((ticket.participants || []).map((participant) => Number(participant.userId || 0)).filter(Boolean)); groupTicketDetailState.searchResults = (response.users || []).map((user) => ({ userId: Number(user.sql_user_id || 0), username: String(user.username || '').trim(), fullName: String(user.full_name || '').trim() })).filter((user) => user.userId > 0 && user.username && !existingIds.has(user.userId)); } catch (_error) { groupTicketDetailState.searchResults = []; }
    openTicketDetailsModal(ticketId);
}
function groupTicketTierOptions(ticket) { const tiers = Array.isArray(ticket?.event?.eventDetails?.ticketTiers) ? ticket.event.eventDetails.ticketTiers : []; const fallbackPrice = Number(ticket?.ticketPrice || 0) || 0; if (!tiers.length && fallbackPrice > 0) return [{ name: ticket.tierName || 'General', price: fallbackPrice, fee: Number(ticket.serviceFee || 0) || 0 }]; return tiers.map((tier) => ({ name: String(tier?.name || 'General').trim() || 'General', price: Number(tier?.price || 0) || 0, fee: Number(ticket?.serviceFee || 0) || 0, services: String(tier?.services || '').trim(), })); }
function ensureDetailTierIndex(ticket) { const options = groupTicketTierOptions(ticket); const currentIndex = Number(groupTicketDetailState.selectedTierIndex || 0); if (!options.length) { groupTicketDetailState.selectedTierIndex = 0; return 0; } if (currentIndex >= 0 && currentIndex < options.length) return currentIndex; const matchIndex = options.findIndex((tier) => String(tier.name || '').trim().toLowerCase() === String(ticket.tierName || '').trim().toLowerCase()); groupTicketDetailState.selectedTierIndex = matchIndex >= 0 ? matchIndex : 0; return groupTicketDetailState.selectedTierIndex; }
function selectedDetailTier(ticket) { const options = groupTicketTierOptions(ticket); const index = ensureDetailTierIndex(ticket); return options[index] || { name: ticket.tierName || 'General', price: Number(ticket.ticketPrice || 0) || 0, fee: Number(ticket.serviceFee || 0) || 0 }; }
function prototypeQrMarkup(ticket, participants) { const seed = `${ticket.id}|${ticket.groupCode}|${ticket.event?.eventDetails?.title || ''}|${participants.length}`; const cells = Array.from({ length: 81 }, (_item, index) => { const charCode = seed.charCodeAt(index % seed.length) || 0; const on = ((charCode + index * 7) % 11) < 5; return `<div class="aspect-square rounded-[2px] ${on ? 'bg-slate-950' : 'bg-white'}"></div>`; }).join(''); return `<div class="rounded-3xl border border-white/10 bg-white p-4 text-slate-950"><div class="flex items-start justify-between gap-4"><div><div class="text-[10px] font-black uppercase tracking-[0.24em] text-slate-500">Prototype QR</div><div class="mt-2 text-sm font-bold">${escapeHtml(ticket.event.eventDetails.title || 'Event Ticket')}</div><div class="mt-1 text-xs text-slate-500">Ticket ${escapeHtml(String(ticket.id || ''))}</div><div class="mt-1 text-xs text-slate-500">Tier ${escapeHtml(ticket.tierName || 'General')}</div></div><div class="grid w-28 grid-cols-9 gap-1 rounded-2xl bg-slate-200 p-2">${cells}</div></div><div class="mt-4 grid grid-cols-2 gap-2 text-[11px]"><div><span class="font-bold">Booked by:</span> @${escapeHtml(ticket.bookedByUsername || ticket.username)}</div><div><span class="font-bold">Group:</span> ${escapeHtml(ticket.groupCode || ticket.id)}</div><div><span class="font-bold">Date:</span> ${escapeHtml(ticket.event.eventDetails.date || 'Date TBD')}</div><div><span class="font-bold">People:</span> ${participants.length}</div></div></div>`; }
async function cancelTicket(ticketId) { const safeTicketId = String(ticketId || ''); if (!safeTicketId) return; try { const data = await postJson(`/api/tickets/${Number(safeTicketId)}/cancel`, {}); const nextTicket = upsertStoredTicket(data.ticket); await loadTickets(); closeTicketDetailsModal(); if (nextTicket && currentBookingEventId && String(nextTicket.event?.id || '') === String(currentBookingEventId)) openBookingModal(currentBookingEventId); setLocationStatus('Ticket cancelled. You can join this party again now.'); } catch (error) { setLocationStatus(error.message || 'Failed to cancel ticket.', true); } }
function openTicketDetailsModal(ticketId) {
    const safeTicketId = String(ticketId || ''); const ticket = (state.tickets || []).find((entry) => String(entry.id) === safeTicketId); if (!ticket) return; const modal = document.getElementById('ticket-details-modal'); const content = document.getElementById('ticket-details-content'); const body = document.getElementById('ticket-details-body'); if (!modal || !content || !body) return;
    const participants = Array.isArray(ticket.participants) ? ticket.participants : []; const pendingParticipants = participants.filter((participant) => participant.status === 'pending'); if (groupTicketDetailState.ticketId !== safeTicketId) { groupTicketDetailState.selectedPendingTicketIds = pendingParticipants.map((participant) => String(participant.ticketId || '')); groupTicketDetailState.selectedTierIndex = 0; } else { const visibleIds = new Set(pendingParticipants.map((participant) => String(participant.ticketId || ''))); groupTicketDetailState.selectedPendingTicketIds = (groupTicketDetailState.selectedPendingTicketIds || []).filter((id) => visibleIds.has(String(id))); }
    groupTicketDetailState.ticketId = safeTicketId; const ticketType = inferEventTicketType(ticket.event); const selectedPending = new Set(groupTicketDetailState.selectedPendingTicketIds || []); const chosenTier = selectedDetailTier(ticket); const selectedCount = pendingParticipants.filter((participant) => selectedPending.has(String(participant.ticketId))).length; const selectedTotal = selectedCount ? ((Number(chosenTier.price || 0) || 0) + (Number(chosenTier.fee || 0) || 0)) * selectedCount : 0; const searchResults = groupTicketDetailState.ticketId === safeTicketId ? groupTicketDetailState.searchResults : [];
    body.innerHTML = `<div class="space-y-6"><div class="flex gap-4"><img src="${ticket.event.image}" class="h-28 w-24 rounded-2xl object-cover"><div class="pt-2"><div class="flex items-center gap-2 flex-wrap"><h3 class="text-2xl font-black text-white">${escapeHtml(ticket.event.eventDetails.title)}</h3><span class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold ${ticketStatusMeta(ticket).className}">${escapeHtml(ticketStatusMeta(ticket).label)}</span></div><p class="mt-2 text-sm text-fuchsia-300">${escapeHtml(ticket.event.eventDetails.date || 'Date TBD')}</p><p class="mt-1 text-sm text-gray-400">${escapeHtml(ticket.event.eventDetails.location || '')}</p><p class="mt-3 text-xs text-gray-500">Booked by @${escapeHtml(ticket.bookedByUsername || ticket.username)}</p></div></div><div class="grid grid-cols-2 gap-3"><div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div class="text-[11px] uppercase tracking-[0.18em] text-gray-500">Tier</div><div class="mt-2 text-lg font-bold text-white">${escapeHtml(ticket.tierName || 'General')}</div></div><div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div class="text-[11px] uppercase tracking-[0.18em] text-gray-500">Your Total</div><div class="mt-2 text-lg font-bold text-white">${ticket.amountDue > 0 ? formatInr(ticket.amountDue) : 'Free'}</div></div></div>${prototypeQrMarkup(ticket, participants)}${ticket.paymentTransactionId || ticket.refundTransactionId ? `<div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4">${ticket.paymentTransactionId ? `<div class="text-[11px] uppercase tracking-[0.18em] text-gray-500">Payment Transaction</div><div class="mt-2 text-sm font-bold text-cyan-200">${escapeHtml(ticket.paymentTransactionId)}</div>` : ''}${ticket.refundTransactionId ? `<div class="mt-3 text-[11px] uppercase tracking-[0.18em] text-gray-500">Refund Transaction</div><div class="mt-2 text-sm font-bold text-amber-200">${escapeHtml(ticket.refundTransactionId)}</div>` : ''}</div>` : ''}<div class="space-y-3"><div class="text-[11px] font-bold uppercase tracking-[0.2em] text-gray-500">Participants</div>${participants.map((participant) => { const meta = ticketParticipantStatusMeta(participant); const selectable = participant.status === 'pending'; const checked = selectedPending.has(String(participant.ticketId)) ? 'checked' : ''; return `<div class="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4"><div class="flex items-start justify-between gap-3"><div><div class="flex items-center gap-2 flex-wrap"><div class="font-semibold text-white">${participant.isCurrentUser ? 'You' : `@${escapeHtml(participant.username)}`}</div><div class="text-xs font-bold ${meta.className}">${meta.label}</div></div><div class="mt-1 text-xs text-gray-400">${describeParticipantSecondary(ticket, participant)}</div><div class="mt-1 text-[11px] text-gray-500">Invite: ${escapeHtml((participant.inviteStatus || 'confirmed').replace(/^./, (m) => m.toUpperCase()))}</div></div><div class="flex flex-col items-end gap-2">${selectable ? `<label class="inline-flex items-center gap-2 text-xs text-gray-300"><input type="checkbox" data-action="toggle-pending-ticket" data-ticket-id="${ticket.id}" data-participant-ticket-id="${participant.ticketId}" class="h-4 w-4 accent-fuchsia-500" ${checked}> Select</label>` : ''}${participant.status === 'pending' && !participant.isCurrentUser ? `<button type="button" data-action="remove-group-member" data-ticket-id="${ticket.id}" data-user-id="${participant.userId}" class="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20 transition-colors">Remove</button>` : ''}</div></div></div>`; }).join('')}</div>${pendingParticipants.length ? `<div class="rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4 space-y-3">${ticketType === 'Paid' && groupTicketTierOptions(ticket).length ? `<div class="space-y-2"><div class="text-sm font-bold text-amber-100">Choose Tier For Selected Pending People</div><select id="ticket-detail-tier-select" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none">${groupTicketTierOptions(ticket).map((tier, index) => `<option value="${index}" ${index === ensureDetailTierIndex(ticket) ? 'selected' : ''}>${escapeHtml(tier.name)} - ${formatInr((Number(tier.price || 0) || 0) + (Number(tier.fee || 0) || 0))}</option>`).join('')}</select></div>` : ''}<div class="flex items-center justify-between gap-3"><div><div class="text-sm font-bold text-amber-100">Pending people</div><div class="text-xs text-amber-100/80">Select anyone in the list and then confirm or pay for them.</div></div><div class="text-right"><div class="text-xs text-amber-100/70">Selected total</div><div class="text-lg font-black text-white">${selectedCount ? (selectedTotal > 0 ? formatInr(selectedTotal) : 'Free') : 'Select people'}</div></div></div><button type="button" data-action="pay-selected-group" data-ticket-id="${ticket.id}" ${selectedCount ? '' : 'disabled'} class="w-full rounded-2xl border border-emerald-400/30 ${selectedCount ? 'bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20' : 'bg-white/5 text-gray-500 cursor-not-allowed'} px-4 py-4 text-sm font-bold transition-colors">${selectedCount ? (selectedTotal > 0 ? 'Pay for Selected' : 'Confirm Selected') : 'Select Pending People'}</button></div>` : ''}<div class="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"><div class="text-sm font-semibold text-gray-300">Add More Members</div>${ticketType === 'Free' ? `<select id="ticket-detail-add-status" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none"><option value="confirmed">Add as Confirmed</option><option value="tentative">Add as Tentative</option></select>` : `${groupTicketTierOptions(ticket).length ? `<select id="ticket-detail-add-tier" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3 text-sm text-white focus:border-fuchsia-500/50 focus:outline-none">${groupTicketTierOptions(ticket).map((tier, index) => `<option value="${index}">${escapeHtml(tier.name)} - ${formatInr((Number(tier.price || 0) || 0) + (Number(tier.fee || 0) || 0))}</option>`).join('')}</select>` : '<div class="text-xs text-gray-400">New paid members can be added here and paid later from the shared ticket.</div>'}`}<input id="ticket-detail-user-search" type="text" placeholder="Search username to add more people" class="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-fuchsia-500/50 focus:outline-none"><div id="ticket-detail-search-results" class="space-y-2">${searchResults.map((user) => `<div class="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3"><div><div class="font-semibold text-white">@${escapeHtml(user.username)}</div><div class="text-xs text-gray-400">${escapeHtml(user.fullName || 'Add to this ticket')}</div></div><button type="button" data-action="add-group-invitee" data-ticket-id="${ticket.id}" data-user-id="${user.userId}" class="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/20 transition-colors">Add</button></div>`).join('')}</div></div><div class="flex flex-col gap-3">${ticket.status !== 'cancelled' ? `<button type="button" data-action="cancel-ticket" data-ticket-id="${ticket.id}" class="w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-4 text-sm font-bold text-rose-200 hover:bg-rose-500/20 transition-colors">Cancel Ticket</button>` : ''}<button type="button" data-action="close-ticket-details" class="w-full text-center text-sm text-gray-500 p-2 hover:text-white transition-colors">Close</button></div></div>`;
    modal.classList.remove('hidden'); modal.scrollTop = 0; content.scrollTop = 0; setTimeout(() => { modal.classList.remove('opacity-0'); if (window.innerWidth >= 768) content.classList.remove('translate-y-10'); else content.classList.remove('translate-y-full'); }, 10);
    const searchInput = document.getElementById('ticket-detail-user-search'); if (searchInput) searchInput.addEventListener('input', () => searchGroupInvitees(ticket.id, searchInput.value)); if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
}
function closeTicketDetailsModal() { const modal = document.getElementById('ticket-details-modal'); const content = document.getElementById('ticket-details-content'); if (!modal || !content) return; modal.classList.add('opacity-0'); if (window.innerWidth >= 768) content.classList.add('translate-y-10'); else content.classList.add('translate-y-full'); setTimeout(() => modal.classList.add('hidden'), 300); }
async function updateGroupTicket(ticketId, payload) { const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(ticketId)); const addTierSelect = document.getElementById('ticket-detail-add-tier'); if (ticket && inferEventTicketType(ticket.event) === 'Paid' && addTierSelect) { const tier = groupTicketTierOptions(ticket)[Number(addTierSelect.value || 0)] || selectedDetailTier(ticket); payload = { ...payload, tierName: tier.name, ticketPrice: Number(tier.price || 0) || 0, serviceFee: Number(tier.fee || 0) || 0 }; } const response = await postJson(`/api/tickets/${ticketId}/group`, payload); const nextTicket = upsertStoredTicket(response.ticket); await loadTickets(); if (nextTicket) openTicketDetailsModal(nextTicket.id); return nextTicket; }
async function payForSelectedGroup(ticketId) { const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(ticketId)); const selected = Array.from(new Set((groupTicketDetailState.selectedPendingTicketIds || []).map((value) => String(value || '')).filter(Boolean))); if (!selected.length) { setLocationStatus('Select at least one pending person first.', true); return; } const payload = { payForTicketIds: selected }; if (ticket && inferEventTicketType(ticket.event) === 'Paid') { const tier = selectedDetailTier(ticket); payload.tierName = tier.name; payload.ticketPrice = Number(tier.price || 0) || 0; payload.serviceFee = Number(tier.fee || 0) || 0; } try { const response = await postJson(`/api/tickets/${ticketId}/pay`, payload); const nextTicket = upsertStoredTicket(response.ticket); await loadTickets(); if (nextTicket) openTicketDetailsModal(nextTicket.id); } catch (error) { setLocationStatus(error.message || 'Failed to update this ticket.', true); } }
function handleTicketCardClick(ticketId) { const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(ticketId)); if (!ticket) return; openTicketDetailsModal(ticket.id); }
const __originalSwitchMyEventsTab = switchMyEventsTab; switchMyEventsTab = function(tabId) { __originalSwitchMyEventsTab(tabId); if (state.myEventsTab === 'tickets') loadTickets(); };
window.__forceConfirmBooking = function(event) { if (event) { event.preventDefault(); event.stopPropagation(); } const bookingModal = document.getElementById('booking-modal'); const actionButton = document.getElementById('booking-action-btn'); if (!bookingModal || bookingModal.classList.contains('hidden') || !actionButton || actionButton.disabled) return false; confirmBooking(); return false; };
if (!window.__finalGroupTicketBindingsBound) {
    window.__finalGroupTicketBindingsBound = true;
    document.addEventListener('click', (event) => {
        const bookingButton = event.target.closest('#booking-action-btn,[data-action="confirm-booking"]');
        if (bookingButton) {
            const bookingModal = document.getElementById('booking-modal');
            if (bookingModal && !bookingModal.classList.contains('hidden')) {
                event.preventDefault(); event.stopImmediatePropagation(); if (!bookingButton.disabled) confirmBooking(); return;
            }
        }
        const payButton = event.target.closest('[data-action="pay-ticket"]');
        if (payButton?.dataset.ticketId) { event.preventDefault(); event.stopImmediatePropagation(); openTicketDetailsModal(payButton.dataset.ticketId); return; }
        const addInviteeButton = event.target.closest('[data-action="add-booking-invitee"]');
        if (addInviteeButton?.dataset.userId) {
            event.preventDefault(); event.stopImmediatePropagation(); const userId = Number(addInviteeButton.dataset.userId || 0); const match = (bookingDraftState.searchResults || []).find((user) => Number(user.userId) === userId);
            if (match && !(bookingDraftState.invitees || []).some((user) => Number(user.userId) === userId)) { bookingDraftState.invitees = [...bookingDraftState.invitees, match]; bookingDraftState.inviteeStatuses[String(userId)] = bookingDraftState.inviteeStatuses[String(userId)] || 'confirmed'; bookingDraftState.searchResults = bookingDraftState.searchResults.filter((user) => Number(user.userId) !== userId); const searchInput = document.getElementById('booking-user-search'); if (searchInput) searchInput.value = ''; renderBookingSearchResults(); renderBookingInvitees(); }
            return;
        }
        const removeInviteeButton = event.target.closest('[data-action="remove-booking-invitee"]');
        if (removeInviteeButton?.dataset.userId) { event.preventDefault(); event.stopImmediatePropagation(); const userId = Number(removeInviteeButton.dataset.userId || 0); bookingDraftState.invitees = (bookingDraftState.invitees || []).filter((user) => Number(user.userId) !== userId); delete bookingDraftState.inviteeStatuses[String(userId)]; renderBookingInvitees(); return; }
        const addGroupInviteeButton = event.target.closest('[data-action="add-group-invitee"]');
        if (addGroupInviteeButton?.dataset.userId && addGroupInviteeButton?.dataset.ticketId) { event.preventDefault(); event.stopImmediatePropagation(); const ticket = (state.tickets || []).find((entry) => String(entry.id) === String(addGroupInviteeButton.dataset.ticketId)); const inviteStatus = inferEventTicketType(ticket?.event) === 'Free' ? (document.getElementById('ticket-detail-add-status')?.value || 'confirmed') : 'confirmed'; updateGroupTicket(addGroupInviteeButton.dataset.ticketId, { inviteeUserIds: [Number(addGroupInviteeButton.dataset.userId || 0)], inviteeStatuses: { [Number(addGroupInviteeButton.dataset.userId || 0)]: inviteStatus } }).catch((error) => setLocationStatus(error.message || 'Failed to add this person.', true)); return; }
        const removeGroupMemberButton = event.target.closest('[data-action="remove-group-member"]');
        if (removeGroupMemberButton?.dataset.userId && removeGroupMemberButton?.dataset.ticketId) { event.preventDefault(); event.stopImmediatePropagation(); updateGroupTicket(removeGroupMemberButton.dataset.ticketId, { removeUserIds: [Number(removeGroupMemberButton.dataset.userId || 0)] }).catch((error) => setLocationStatus(error.message || 'Failed to remove this person.', true)); return; }
        const paySelectedButton = event.target.closest('[data-action="pay-selected-group"]');
        if (paySelectedButton?.dataset.ticketId) { event.preventDefault(); event.stopImmediatePropagation(); payForSelectedGroup(paySelectedButton.dataset.ticketId); return; }
        const cancelButton = event.target.closest('[data-action="cancel-ticket"]');
        if (cancelButton?.dataset.ticketId) { event.preventDefault(); event.stopImmediatePropagation(); cancelTicket(cancelButton.dataset.ticketId); return; }
        const closeDetails = event.target.closest('[data-action="close-ticket-details"]');
        if (closeDetails) { event.preventDefault(); closeTicketDetailsModal(); return; }
    }, true);
    document.addEventListener('change', (event) => {
        const inviteStatusSelect = event.target.closest('[data-action="booking-invite-status"]');
        if (inviteStatusSelect?.dataset.userId) { bookingDraftState.inviteeStatuses[String(inviteStatusSelect.dataset.userId)] = String(inviteStatusSelect.value || 'confirmed').trim().toLowerCase() === 'tentative' ? 'tentative' : 'confirmed'; return; }
        const pendingToggle = event.target.closest('[data-action="toggle-pending-ticket"]');
        if (pendingToggle?.dataset.participantTicketId) { const ticketId = String(pendingToggle.dataset.ticketId || ''); const participantTicketId = String(pendingToggle.dataset.participantTicketId || ''); const next = new Set(groupTicketDetailState.selectedPendingTicketIds || []); if (pendingToggle.checked) next.add(participantTicketId); else next.delete(participantTicketId); groupTicketDetailState.selectedPendingTicketIds = Array.from(next); openTicketDetailsModal(ticketId); return; }
        const tierSelect = event.target.closest('#ticket-detail-tier-select');
        if (tierSelect) { groupTicketDetailState.selectedTierIndex = Number(tierSelect.value || 0) || 0; if (groupTicketDetailState.ticketId) openTicketDetailsModal(groupTicketDetailState.ticketId); }
    }, true);
    window.setTimeout(() => loadTickets(), 150);
}
