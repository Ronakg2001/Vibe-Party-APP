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
const state = {
    activeTab: 'home',
    isEventMode: false,
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
}

function getAllPosts() {
    return [...state.nearbyEventPosts, ...state.posts];
}

function getPostById(postId) {
    return getAllPosts().find((post) => post.id === postId);
}

function setLocationStatus(message, isError = false) {
    const statusEl = document.getElementById('location-status');
    if (!statusEl) return;
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
    return {
        id: `event-${eventData.id}`,
        username: eventData.hostUsername || 'host',
        avatar: defaultAvatar,
        image: eventData.imageUrl || `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`,
        caption: eventData.description || 'Live event nearby.',
        likes: 0,
        isEvent: true,
        eventDetails: {
            title: eventData.title,
            date: eventData.startLabel || 'Date TBD',
            location: eventData.locationName,
            price: eventData.price,
            mapUrl: eventData.mapUrl,
            distanceKm: eventData.distanceKm
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
    bindLocationButtonGestures('mobile-location-btn');
    bindLocationButtonGestures('desktop-location-btn');
    renderTopLocationUi();
    renderFeed();
    renderStories();
    renderExplore();
    renderCurrentUserProfile();
    renderProfileGrid();
    renderTicketList();
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
                <img src="${post.image}" class="w-full h-full object-cover opacity-90 transition-transform duration-700 group-hover:scale-105">
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
                            <button class="px-3 py-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-bold rounded-lg shadow-lg shadow-fuchsia-500/20">Book $${post.eventDetails.price}</button>
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
}

function togglePostType(isEvent) {
    state.isEventMode = isEvent;
    const btnPost = document.getElementById('btn-type-post');
    const btnEvent = document.getElementById('btn-type-event');
    const eventFields = document.getElementById('event-fields');

    if (isEvent) {
        btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/20";
        btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white";
        eventFields.classList.remove('hidden');
        eventFields.classList.add('flex');
    } else {
        btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-slate-700 text-white shadow-lg";
        btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white";
        eventFields.classList.add('hidden');
        eventFields.classList.remove('flex');
    }
}

async function handlePostSubmit(e) {
    e.preventDefault();
    const newPost = {
        id: Math.random().toString(36),
        username: state.currentUser.username,
        avatar: state.currentUser.avatar,
        image: `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`,
        caption: document.getElementById('post-caption').value,
        likes: 0,
        isEvent: state.isEventMode
    };

    if (state.isEventMode) {
        const useCurrentLocation = document.getElementById('event-use-current-location')?.checked;
        if (!useCurrentLocation) {
            setLocationStatus('Please keep "Use my current location" enabled for exact event pin.', true);
            return;
        }
        if (!state.userLocation) {
            setLocationStatus('Please detect your location before creating an event.', true);
            return;
        }

        try {
            const result = await postJson('/api/events/create', {
                title: document.getElementById('event-title').value.trim(),
                description: document.getElementById('post-caption').value.trim(),
                startLabel: document.getElementById('event-date').value.trim(),
                locationName: document.getElementById('event-location').value.trim(),
                price: document.getElementById('event-price').value || 0,
                latitude: state.userLocation?.latitude,
                longitude: state.userLocation?.longitude
            });
            if (result?.event) {
                state.nearbyEventPosts.unshift(serverEventToPost(result.event));
                renderFeed();
                renderProfileGrid();
                switchTab('home');
                e.target.reset();
                return;
            }
        } catch (error) {
            setLocationStatus(error.message || 'Failed to create event.', true);
            return;
        }
    }

    state.posts.unshift(newPost);
    renderFeed();
    renderProfileGrid();
    switchTab('home');
    e.target.reset(); // clear form
}

let currentBookingEventId = null;

function openBookingModal(postId) {
    const event = getPostById(postId);
    if (!event || !event.eventDetails) return;
    currentBookingEventId = postId;
    
    const modal = document.getElementById('booking-modal');
    const content = document.getElementById('modal-content');
    const details = document.getElementById('modal-event-details');
    
    details.innerHTML = `
        <div class="flex gap-5 mb-8">
            <img src="${event.image}" class="w-24 h-32 rounded-2xl object-cover shadow-2xl">
            <div class="pt-2">
                <h3 class="font-black text-2xl leading-tight text-white mb-2">${event.eventDetails.title}</h3>
                <p class="text-fuchsia-400 font-medium mb-1">${event.eventDetails.date}</p>
                <p class="text-gray-400 text-sm">${event.eventDetails.location}</p>
                ${event.eventDetails.mapUrl ? `<a href="${event.eventDetails.mapUrl}" target="_blank" rel="noopener" class="inline-block mt-2 text-xs text-cyan-300 hover:text-cyan-200">Open in Maps</a>` : ''}
            </div>
        </div>
        <div class="space-y-6">
            <div class="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                <span class="font-bold text-gray-300">Tickets</span>
                <div class="flex items-center gap-5">
                    <span class="w-6 text-center font-bold text-xl text-white">1</span>
                </div>
            </div>
            <div class="border-t border-white/10 pt-4 flex justify-between items-center">
                <span class="text-xl font-bold text-white">Total</span>
                <span class="text-2xl font-black text-fuchsia-400">$${parseInt(event.eventDetails.price) + 4}.00</span>
            </div>
            <button onclick="confirmBooking()" class="w-full py-4 rounded-xl font-bold text-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-fuchsia-500/30">Pay & Join</button>
            <button onclick="closeBookingModal()" class="w-full text-center text-sm text-gray-500 p-2 hover:text-white transition-colors">Cancel</button>
        </div>
    `;

    modal.classList.remove('hidden');
    // Small timeout to allow display:block to apply before opacity transition
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        // Check if we are on desktop for different animation
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

function confirmBooking() {
    const event = getPostById(currentBookingEventId);
    if (!event) return;
    state.tickets.unshift({
        id: Math.random().toString(36).substr(2, 9),
        event: event,
        qty: 1
    });
    renderTicketList();
    closeBookingModal();
    setTimeout(() => switchTab('tickets'), 300);
}

function toggleLike(btn) {
    const icon = btn.querySelector('svg') || btn.querySelector('i'); // Fix: prioritize SVG
    const wrapper = btn.querySelector('div');
    
    if (!icon) return;

    // Simple visual toggle (no state persistence in this basic HTML version)
    if (wrapper.classList.contains('text-rose-500')) {
        wrapper.classList.remove('text-rose-500', 'bg-rose-500/20');
        wrapper.classList.add('text-white', 'bg-black/20');
        icon.setAttribute('fill', 'none');
    } else {
        wrapper.classList.add('text-rose-500', 'bg-rose-500/20');
        wrapper.classList.remove('text-white', 'bg-black/20');
        icon.setAttribute('fill', 'currentColor');
    }
}

