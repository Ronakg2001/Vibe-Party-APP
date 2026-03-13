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
    uploadActivityItems: [],
    uploadActivitySeq: 0,
    currentUser: {
        username: currentUsernameTemplate,
        avatar: currentAvatarTemplate || defaultAvatar,
        fullName: currentUsernameTemplate,
        bio: ''
    },
    locationEnabled: true,
    customLocationName: '',
    detectedLocationName: '',
    userLocation: null,
    eventLocationPoint: null,
    nearbyRadiusKm: 30,
    nearbyEventPosts: [],
    posts: [
        {
            id: 'local-1',
            username: 'neon_nights',
            avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&h=100&fit=crop',
            image: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&h=600&fit=crop',
            caption: 'The bass drop was unreal tonight.',
            likes: 1240,
            isEvent: false
        },
        {
            id: 'local-event-1',
            username: 'electric_jungle',
            avatar: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=100&h=100&fit=crop',
            image: 'https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop',
            caption: 'Secret warehouse party. Limited slots tonight.',
            likes: 856,
            isEvent: true,
            eventDetails: {
                title: 'Neon Jungle Rave',
                date: 'Oct 24, 10:00 PM',
                location: 'Warehouse 42, BK',
                price: 45,
                mapUrl: 'https://www.google.com/maps/search/?api=1&query=40.7128,-74.0060'
            }
        }
    ],
    tickets: []
};
const loaderStartTs = Date.now();

const THEME_STORAGE_KEY = 'vibe-theme';

function getStoredTheme() {
    try {
        return localStorage.getItem(THEME_STORAGE_KEY);
    } catch (_error) {
        return null;
    }
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
    return getAllPosts().filter((post) => post.isEvent && post.username === state.currentUser.username);
}

async function loadCurrentUserProfile() {
    try {
        const data = await getJson('/api/profile/me');
        const profile = data?.profile || {};
        state.currentUser.username = profile.username || state.currentUser.username;
        state.currentUser.fullName = profile.full_name || state.currentUser.username;
        state.currentUser.bio = profile.bio || '';
        state.currentUser.avatar = profile.profile_picture_url || state.currentUser.avatar || defaultAvatar;
    } catch (error) {
        // Keep existing template-backed values if API fails.
    }
    renderCurrentUserProfile();
    renderProfileGrid();
    renderHostedEventList();
}

function getAllPosts() {
    return [...state.nearbyEventPosts, ...state.posts];
}

function getPostById(postId) {
    return getAllPosts().find((post) => post.id === postId);
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
        localStorage.setItem('vibe_custom_location_name', value);
    } else {
        localStorage.removeItem('vibe_custom_location_name');
    }
    state.customLocationName = value;

    if (locationModalSelectedCenter) {
        localStorage.setItem('vibe_custom_location_center', JSON.stringify(locationModalSelectedCenter));
    }
    if (locationModalSelectedBounds) {
        localStorage.setItem('vibe_custom_location_bounds', JSON.stringify(locationModalSelectedBounds));
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
    localStorage.removeItem('vibe_custom_location_name');
    localStorage.removeItem('vibe_custom_location_center');
    localStorage.removeItem('vibe_custom_location_bounds');
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
        localStorage.removeItem('vibe_detected_location_name');
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
    return {
        id: `event-${eventData.id}`,
        username: eventData.hostUsername || 'host',
        avatar: defaultAvatar,
        image: eventData.imageUrl || primaryUrl || `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`,
        mediaType: primaryIsVideo ? 'video' : 'image',
        mediaUrl: primaryUrl || '',
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : (primaryUrl ? [primaryUrl] : []),
        mediaTypes: mediaUrls.length > 0 ? mediaUrls.map(mediaTypeForUrl) : (primaryUrl ? [mediaTypeForUrl(primaryUrl)] : []),
        caption: eventData.description || 'Live event nearby.',
        likes: 0,
        isEvent: true,
        eventDetails: {
            title: eventData.title,
            date: eventData.startLabel || 'Date TBD',
            location: eventData.locationName,
            price: eventData.price,
            mapUrl: eventData.mapUrl,
            distanceKm: eventData.distanceKm,
            eventType: eventData.eventCategory || 'local event',
            mediaCount: mediaUrls.length
        }
    };
}

async function loadNearbyEvents() {
    if (!state.locationEnabled) {
        state.nearbyEventPosts = [];
        renderFeed();
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
        renderTopLocationUi();
    } catch (error) {
        setLocationStatus(error.message || 'Failed to load nearby events.', true);
    }
}

async function detectUserLocationAndLoad() {
    if (!state.locationEnabled) {
        state.nearbyEventPosts = [];
        renderFeed();
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
                localStorage.setItem('vibe_detected_location_name', state.detectedLocationName);
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

function formatTime12(hour12, minute, period) {
    const hh = String(hour12).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return `${hh}:${mm} ${period}`;
}

function to24HourTime(hour12, minute, period) {
    let hour24 = hour12 % 12;
    if (period === 'PM') {
        hour24 += 12;
    }
    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parse24HourTime(value) {
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

function isFutureEventDateTime(dateValue, time24Value) {
    if (!dateValue || !time24Value) return false;
    const candidate = new Date(`${dateValue}T${time24Value}:00`);
    if (Number.isNaN(candidate.getTime())) return false;
    const now = new Date();
    now.setSeconds(0, 0);
    return candidate.getTime() >= now.getTime();
}

function stopAnalogLiveTicker() {
    if (analogLiveTickerId) {
        clearInterval(analogLiveTickerId);
        analogLiveTickerId = null;
    }
}

function startAnalogLiveTicker() {
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

function isTodayEventDateSelected() {
    const selectedDate = document.getElementById('event-date')?.value || '';
    return selectedDate && selectedDate === getTodayDateKey();
}

function isAnalogCandidateAllowed(hour12, minute, period) {
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

function markManualAnalogSelection() {
    analogClockState.liveMode = false;
    analogClockState.second = 0;
    stopAnalogLiveTicker();
}

function getAnalogTargetHiddenInputId() {
    return analogClockState.targetInputId === 'event-end-time-display' ? 'event-end-time' : 'event-time';
}

function syncEventTimeInputs() {
    const hiddenTime = document.getElementById(getAnalogTargetHiddenInputId());
    const displayTime = document.getElementById(analogClockState.targetInputId || 'event-time-display');
    if (!displayTime) return;
    const time24 = to24HourTime(analogClockState.hour, analogClockState.minute, analogClockState.period);
    if (hiddenTime) hiddenTime.value = time24;
    displayTime.value = formatTime12(analogClockState.hour, analogClockState.minute, analogClockState.period);
    recalculateEventDurationFromTimes();
    syncEventTimeDependencyUi();
}

function time24ToMinutes(time24) {
    const parsed = parse24HourTime(time24);
    if (!parsed) return null;
    let hour24 = parsed.hour12 % 12;
    if (parsed.period === 'PM') hour24 += 12;
    return (hour24 * 60) + parsed.minute;
}

function calculateDurationMinutesFromTimes(startTime24, endTime24) {
    const startMin = time24ToMinutes(startTime24);
    const endMin = time24ToMinutes(endTime24);
    if (startMin === null || endMin === null) return null;
    let delta = endMin - startMin;
    if (delta <= 0) delta += 24 * 60;
    return delta;
}

function formatDurationMinutes(minutes) {
    const safe = Number(minutes);
    if (!Number.isFinite(safe) || safe <= 0) return '';
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
}

function parseDurationDisplayToMinutes(value) {
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

function syncDurationHiddenFromDisplay() {
    const durationDisplay = document.getElementById('event-duration-display');
    const durationHidden = document.getElementById('event-duration-minutes');
    if (!durationDisplay || !durationHidden) return;
    updateDurationClearButtonVisibility();
    if (durationDisplay.readOnly) return;
    const minutes = parseDurationDisplayToMinutes(durationDisplay.value);
    durationHidden.value = minutes > 0 ? String(minutes) : '';
    syncEventTimeDependencyUi();
}

function updateDurationClearButtonVisibility() {
    const durationDisplay = document.getElementById('event-duration-display');
    const clearBtn = document.getElementById('event-duration-clear-btn');
    if (!durationDisplay || !clearBtn) return;
    const show = !durationDisplay.disabled && !durationDisplay.readOnly && !!durationDisplay.value.trim();
    clearBtn.classList.toggle('hidden', !show);
}

function clearDurationSelection() {
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

function recalculateEventDurationFromTimes() {
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

function syncEventTimeDependencyUi() {
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

function setAnalogMode(mode) {
    analogClockState.mode = mode === 'minute' ? 'minute' : 'hour';
    analogClockState.focus = analogClockState.mode;
    renderAnalogClockDial();
}

function setAnalogPeriod(period) {
    if (!isAnalogCandidateAllowed(analogClockState.hour, analogClockState.minute, period === 'AM' ? 'AM' : 'PM')) {
        return;
    }
    markManualAnalogSelection();
    analogClockState.period = period === 'AM' ? 'AM' : 'PM';
    analogClockState.focus = 'period';
    renderAnalogClockDial();
}

function toggleAnalogPeriod() {
    setAnalogPeriod(analogClockState.period === 'AM' ? 'PM' : 'AM');
}

function getAnalogDialIndexFromPoint(clientX, clientY) {
    const dial = document.getElementById('analog-clock-dial');
    if (!dial) return 0;
    const rect = dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angleDeg = (Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI + 90 + 360) % 360;
    return Math.round(angleDeg / 30) % 12;
}

function setAnalogValueFromDialIndex(index) {
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

function adjustAnalogSelection(step) {
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

function moveAnalogFocus(step) {
    const order = ['hour', 'minute', 'period'];
    const currentIndex = order.indexOf(analogClockState.focus);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + step + order.length) % order.length;
    analogClockState.focus = order[nextIndex];
    if (analogClockState.focus === 'hour' || analogClockState.focus === 'minute') {
        analogClockState.mode = analogClockState.focus;
    }
}

function isAnalogModalOpen() {
    const modal = document.getElementById('analog-time-modal');
    return !!modal && !modal.classList.contains('hidden');
}

function initAnalogClockInteractions() {
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

function renderAnalogClockDial() {
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

function openAnalogTimeModal(inputId) {
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

function closeAnalogTimeModal() {
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

function clearAnalogTimeSelection() {
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

function parseDateParts(dateValue) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || '').trim());
    if (!match) return null;
    return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3])
    };
}

function formatDateDisplay(dateValue) {
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

function toDateKey(year, month, day) {
    return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getTodayDateKey() {
    const now = new Date();
    return toDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function dateKeyToLocalDate(dateKey) {
    const parts = parseDateParts(dateKey);
    if (!parts) return null;
    return new Date(parts.year, parts.month - 1, parts.day);
}

function localDateToDateKey(localDate) {
    if (!(localDate instanceof Date) || Number.isNaN(localDate.getTime())) return '';
    return toDateKey(localDate.getFullYear(), localDate.getMonth(), localDate.getDate());
}

function getSafeSelectedOrTodayDateKey() {
    const todayKey = getTodayDateKey();
    if (!eventCalendarState.selectedDate) return todayKey;
    return eventCalendarState.selectedDate < todayKey ? todayKey : eventCalendarState.selectedDate;
}

function isEventDateModalOpen() {
    const modal = document.getElementById('event-date-modal');
    return !!modal && !modal.classList.contains('hidden');
}

function isEventMonthYearPickerOpen() {
    const picker = document.getElementById('event-month-year-picker');
    return !!picker && !picker.classList.contains('hidden');
}

function clampEventCalendarToCurrentMonth() {
    const today = new Date();
    if (
        eventCalendarState.viewYear < today.getFullYear() ||
        (eventCalendarState.viewYear === today.getFullYear() && eventCalendarState.viewMonth < today.getMonth())
    ) {
        eventCalendarState.viewYear = today.getFullYear();
        eventCalendarState.viewMonth = today.getMonth();
    }
}

function renderEventMonthYearPicker() {
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

function toggleEventMonthYearPicker() {
    const picker = document.getElementById('event-month-year-picker');
    if (!picker) return;
    picker.classList.toggle('hidden');
    if (!picker.classList.contains('hidden')) {
        renderEventMonthYearPicker();
    }
}

function closeEventMonthYearPicker() {
    const picker = document.getElementById('event-month-year-picker');
    if (!picker) return;
    picker.classList.add('hidden');
}

function changeEventCalendarYear(step) {
    const today = new Date();
    const nextYear = eventCalendarState.viewYear + step;
    eventCalendarState.viewYear = Math.max(today.getFullYear(), nextYear);
    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function setCalendarViewToSelectedDate(dateKey) {
    const parsed = parseDateParts(dateKey);
    if (!parsed) return;
    eventCalendarState.viewYear = parsed.year;
    eventCalendarState.viewMonth = parsed.month - 1;
}

function moveEventDateSelectionByDays(daysDelta) {
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

function moveEventCalendarMonthByKeyboard(monthDelta) {
    const nextMonth = eventCalendarState.viewMonth + monthDelta;
    const yearDelta = Math.floor(nextMonth / 12);
    eventCalendarState.viewYear += yearDelta;
    eventCalendarState.viewMonth = ((nextMonth % 12) + 12) % 12;
    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function handleEventCalendarKeyboard(event) {
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

function renderEventCalendar() {
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

function openEventDateModal(inputId) {
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

function closeEventDateModal() {
    const modal = document.getElementById('event-date-modal');
    const card = document.getElementById('event-date-modal-card');
    if (!modal || !card) return;
    closeEventMonthYearPicker();
    modal.classList.add('opacity-0');
    card.classList.add('scale-95');
    setTimeout(() => modal.classList.add('hidden'), 220);
}

function changeEventCalendarMonth(step) {
    const nextMonth = eventCalendarState.viewMonth + step;
    const yearDelta = Math.floor(nextMonth / 12);
    eventCalendarState.viewYear += yearDelta;
    eventCalendarState.viewMonth = ((nextMonth % 12) + 12) % 12;

    clampEventCalendarToCurrentMonth();
    renderEventCalendar();
}

function saveEventDateSelection() {
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

function clearEventDateSelection() {
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

function saveAnalogTimeSelection() {
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

function initEventDateTimePicker() {
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

function initEventCalendarKeyboardNavigation() {
    document.addEventListener('keydown', handleEventCalendarKeyboard);
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    state.customLocationName = localStorage.getItem('vibe_custom_location_name') || '';
    state.detectedLocationName = localStorage.getItem('vibe_detected_location_name') || '';
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
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('#event-type-picker')) {
            return;
        }
        closeEventTypeMenu();
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.hosted-event-menu') && !event.target.closest('[onpointerdown*="startHostedEventPress"]')) {
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
    renderStories();
    renderExplore();
    renderCurrentUserProfile();
    renderProfileGrid();
    renderTicketList();
    renderHostedEventList();
    switchMyEventsTab('tickets');
    const eventMediaInput = document.getElementById('event-media-input');
    if (eventMediaInput) {
        eventMediaInput.addEventListener('change', handleEventMediaInputChange);
    }
    const createPostForm = document.getElementById('create-post-form');
    if (createPostForm) {
        createPostForm.addEventListener('submit', handlePostSubmit);
    }
    renderEventCategoriesFromManifest();
    renderSelectedEventMedia();
    if (typeof initEventBuilder === 'function') {
        initEventBuilder();
    }
    loadCurrentUserProfile();
    switchTab(getInitialTabFromUrl());
    lucide.createIcons();
    if (!state.locationEnabled) {
        setLocationStatus('Location is OFF. Nearby detection stopped.');
    } else if (window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
        detectUserLocationAndLoad();
    } else {
        setLocationStatus('Location auto-detect disabled on insecure origin. Use localhost/HTTPS.');
    }
});

window.addEventListener("load", hideLoaderWhenReady);

// --- Render Functions ---

function renderStories() {
    const container = document.getElementById('stories-container');
    const storiesHTML = Array(5).fill(0).map((_, i) => `
        <div class="flex flex-col items-center gap-1 min-w-[68px]">
            <div class="w-[68px] h-[68px] rounded-full p-[2px] bg-gradient-to-tr from-cyan-400 via-fuchsia-500 to-yellow-400 hover:scale-105 transition-transform cursor-pointer">
                <div class="w-full h-full rounded-full border-[3px] border-slate-900 overflow-hidden">
                    <img src="https://images.unsplash.com/photo-${1500000000000 + i * 1000}?w=100&h=100&fit=crop" class="w-full h-full object-cover">
                </div>
            </div>
            <span class="text-xs font-medium text-gray-300 truncate w-full text-center">User_${i+1}</span>
        </div>
    `).join('');
    container.innerHTML = storiesHTML;
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
        ? `<button type="button" onclick="event.stopPropagation(); shiftPostMedia('${post.id}', -1)" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 border border-white/10 text-white grid place-items-center z-20">&lsaquo;</button>
           <button type="button" onclick="event.stopPropagation(); shiftPostMedia('${post.id}', 1)" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 border border-white/10 text-white grid place-items-center z-20">&rsaquo;</button>
           <div class="absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/45 text-xs text-white border border-white/10 z-20">${idx + 1} / ${safeCount}</div>`
        : '';
    return `<div class="absolute inset-0" ontouchstart="startPostSwipe(event, '${post.id}')" ontouchend="endPostSwipe(event, '${post.id}')">${mediaTag}${controls}</div>`;
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
    container.innerHTML = getAllPosts().map(post => `
        <article class="relative mb-6 bg-slate-800/20 md:bg-transparent md:rounded-2xl md:overflow-hidden md:border md:border-white/5">
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
                    <button onclick="toggleLike(this)" class="flex flex-col items-center gap-1 group">
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
                    <p class="text-sm text-gray-200 mb-3 line-clamp-2"><span class="font-bold text-white mr-2">${post.username}</span>${post.caption}</p>
                    ${post.isEvent ? `
                    <div class="mt-3 bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex items-center justify-between group/event hover:bg-white/15 transition-colors cursor-pointer" onclick="openBookingModal('${post.id}')">
                        <div class="flex gap-3 items-center">
                            <div class="bg-fuchsia-600/20 w-10 h-10 rounded-lg flex flex-col items-center justify-center text-fuchsia-400 border border-fuchsia-500/30">
                                <span class="text-[10px] font-bold uppercase leading-none">Oct</span><span class="text-lg font-bold leading-none">24</span>
                            </div>
                            <div>
                                <h3 class="font-bold text-sm text-white group-hover/event:text-fuchsia-300 transition-colors">${post.eventDetails.title}</h3>
                                <p class="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><i data-lucide="map-pin" class="w-3 h-3"></i> ${post.eventDetails.location}${post.eventDetails.distanceKm !== undefined ? ` (${post.eventDetails.distanceKm} km)` : ''}</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            ${post.eventDetails.mapUrl ? `<a href="${post.eventDetails.mapUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="px-3 py-2 bg-cyan-600/20 text-cyan-300 text-xs font-bold rounded-lg border border-cyan-500/30 hover:bg-cyan-600/30">Map</a>` : ''}
                            <button class="px-3 py-2 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-fuchsia-500/20">Book ${formatInr(post.eventDetails.price)}</button>
                        </div>
                    </div>` : ''}
                </div>
            </div>
        </article>
    `).join('');
    lucide.createIcons();
}

function renderExplore() {
    const grid = document.getElementById('explore-grid');
    let html = `
        <div class="col-span-2 row-span-2 relative overflow-hidden rounded-xl h-[280px] md:h-[400px] group cursor-pointer">
            <img src="https://images.unsplash.com/photo-1533174072545-e8d4aa97edf9?w=600&h=600&fit=crop" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex items-end p-4"><span class="font-black text-white text-lg">Trending</span></div>
        </div>
    `;
    for(let i=0; i<8; i++) {
        html += `<div class="bg-slate-800 rounded-xl overflow-hidden h-[140px] md:h-[195px] relative group cursor-pointer">
            <img src="https://images.unsplash.com/photo-${1520000000000 + i * 1234}?w=300&h=300&fit=crop" class="w-full h-full object-cover opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:scale-105">
            <div class="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors"></div>
        </div>`;
    }
    grid.innerHTML = html;
}

function renderProfileGrid() {
    const grid = document.getElementById('profile-grid');
    const myPosts = getAllPosts().filter(p => p.username === state.currentUser.username);
    document.getElementById('profile-posts-count').innerText = myPosts.length;
    
    let html = '';
    myPosts.forEach(post => {
            html += `<div class="aspect-square bg-slate-800 relative group overflow-hidden md:rounded-lg cursor-pointer">
            <img src="${post.image}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110">
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold">
                <span class="flex items-center gap-1"><i data-lucide="heart" class="w-4 h-4 fill-white"></i> ${post.likes}</span>
            </div>
            </div>`;
    });
    for(let i=0; i<4; i++) {
        html += `<div class="aspect-square bg-slate-800 md:rounded-lg overflow-hidden group">
            <img src="https://images.unsplash.com/photo-${1510000000000 + i * 500}?w=300&h=300&fit=crop" class="w-full h-full object-cover opacity-50 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500 cursor-pointer">
        </div>`;
    }
    grid.innerHTML = html;
}

function renderTicketList() {
    const container = document.getElementById('tickets-list');
    const emptyState = document.getElementById('empty-tickets');
    
    if (state.tickets.length === 0) {
        emptyState.classList.remove('hidden');
        container.innerHTML = '';
        return;
    }
    
    emptyState.classList.add('hidden');
    container.innerHTML = state.tickets.map(ticket => `
        <div class="relative group hover:scale-[1.02] transition-transform duration-300 cursor-pointer">
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
                        <div class="inline-flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-xs text-cyan-400"><i data-lucide="check" class="w-3 h-3"></i> Confirmed</div>
                    </div>
                    <div class="col-span-1 flex flex-col items-center justify-center border-l border-white/10 pl-4">
                        <i data-lucide="qr-code" class="w-16 h-16 text-white mb-2"></i>
                        <span class="font-mono text-[10px] text-gray-500">#${ticket.id.substr(0,4)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    lucide.createIcons();
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
        state.posts = state.posts.filter((item) => item.id !== postId);
        state.tickets = state.tickets.filter((ticket) => ticket?.event?.id !== postId);
        state.hostedMenuEventPostId = null;
        renderFeed();
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
                onclick="handleHostedEventCardClick('${eventPost.id}')"
                onpointerdown="startHostedEventPress(event, '${eventPost.id}')"
                onpointerup="cancelHostedEventPress()"
                onpointerleave="cancelHostedEventPress()"
                onpointercancel="cancelHostedEventPress()">
                <div class="absolute -inset-0.5 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 rounded-2xl opacity-75 blur group-hover:opacity-100 transition-opacity"></div>
                <div class="relative bg-slate-900 rounded-2xl overflow-hidden border border-white/10">
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
                            <div class="text-[10px] uppercase text-gray-400 tracking-wider">Price</div>
                            <div class="font-black text-fuchsia-400">${formatInr(eventPost.eventDetails.price)}</div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="hosted-event-menu mt-2 ${menuVisible ? '' : 'hidden'}">
                <button type="button" onclick="event.stopPropagation(); deleteHostedEvent('${eventPost.id}')"
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

function switchTab(tabId) {
    state.activeTab = tabId;
    
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
