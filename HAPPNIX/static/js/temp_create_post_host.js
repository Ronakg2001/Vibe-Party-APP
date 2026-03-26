// Mock State for Preview
const state = {
    isEventMode: false,
    pendingEventMedia: [],
    pendingMediaIndex: 0,
    currentUser: { username: "happnix_user", avatar: "https://i.pravatar.cc/150" },
    categories: ["Music", "Party", "Workshop", "Networking", "Tech", "Wellness", "Art", "Food", "Other"]
};

let vibeCover = null;
let vibeHighlights = [];
let eventTags = [];
let ticketTiers = [];
let currentStep = 1;

document.addEventListener('DOMContentLoaded', () => {
    bindTempCreateActions();
    bindTempCreateInputs();
    initEventBuilder();
});

function bindTempCreateActions() {
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;

        switch (action) {
            case 'toggle-post-type':
                togglePostType(actionEl.dataset.eventMode === 'true');
                break;
            case 'shift-pending-media':
                event.preventDefault();
                event.stopPropagation();
                shiftPendingMedia(Number(actionEl.dataset.direction || 0));
                break;
            case 'scroll-carousel':
                scrollCarousel(Number(actionEl.dataset.direction || 0));
                break;
            case 'toggle-event-type-menu':
                toggleEventTypeMenu();
                break;
            case 'select-category':
                selectCategory(actionEl.dataset.category || '');
                break;
            case 'trigger-cover-upload':
                triggerCoverUpload();
                break;
            case 'trigger-highlight-upload':
                triggerHighlightUpload();
                break;
            case 'remove-highlight':
                removeHighlight(Number(actionEl.dataset.index || 0));
                break;
            case 'remove-tag':
                removeTag(Number(actionEl.dataset.index || 0));
                break;
            case 'remove-tier':
                removeTier(Number(actionEl.dataset.index || 0));
                break;
            case 'ticket-type':
                toggleTicketTypes();
                break;
            case 'add-tier':
                addTier();
                break;
            case 'change-step':
                changeStep(Number(actionEl.dataset.step || 0));
                break;
            default:
                break;
        }
    });
}

function bindTempCreateInputs() {
    const mediaInput = document.getElementById('event-media-input');
    if (mediaInput) {
        mediaInput.addEventListener('change', handleEventMediaInputChange);
    }
    const coverUpload = document.getElementById('cover-upload');
    if (coverUpload) {
        coverUpload.addEventListener('change', handleCoverUpload);
    }
    const highlightUpload = document.getElementById('highlight-upload');
    if (highlightUpload) {
        highlightUpload.addEventListener('change', handleHighlightUpload);
    }
    const highlightChange = document.getElementById('highlight-change');
    if (highlightChange) {
        highlightChange.addEventListener('change', handleHighlightChangeUpload);
    }
    document.querySelectorAll('input[name=\"ticket_type\"]').forEach((input) => {
        input.addEventListener('change', toggleTicketTypes);
    });
    const form = document.getElementById('create-post-form');
    if (form) {
        form.addEventListener('submit', handlePostSubmit);
    }
}

function initEventBuilder() {
    renderCategoryMenu();
    renderCarousel();
    if (window.lucide) lucide.createIcons();

    // Tag Input Handler
    const tagInput = document.getElementById('inp-tag-entry');
    if (tagInput) {
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = tagInput.value.trim().replace(/^#/, '').replace(/,/g, '');
                if (val && !eventTags.includes(val) && eventTags.length < 10) {
                    eventTags.push(val);
                    tagInput.value = '';
                    renderTags();
                }
            }
        });
    }

    // Promo Toggle
    document.getElementById('promo-toggle')?.addEventListener('change', (e) => {
        document.getElementById('promo-input-wrap').classList.toggle('hidden', !e.target.checked);
    });
}

function togglePostType(isEvent) {
    state.isEventMode = isEvent;
    const btnPost = document.getElementById('btn-type-post');
    const btnEvent = document.getElementById('btn-type-event');
    const eventFields = document.getElementById('event-fields');
    const postUiWrap = document.getElementById('post-ui-wrap');
    const postSubmitWrap = document.getElementById('post-submit-wrap');

    if (isEvent) {
        btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold bg-fuchsia-600 text-white shadow-lg";
        btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white";
        eventFields.classList.remove('hidden');
        postUiWrap.classList.add('hidden');
        postSubmitWrap.classList.add('hidden');
        setStep(1);
    } else {
        btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold bg-slate-700 text-white shadow-lg";
        btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold text-gray-400 hover:text-white";
        eventFields.classList.add('hidden');
        postUiWrap.classList.remove('hidden');
        postSubmitWrap.classList.remove('hidden');
    }
}

function setStep(step) {
    currentStep = step;
    document.querySelectorAll('.step-container').forEach((el, idx) => {
        el.classList.toggle('active', idx + 1 === step);
    });

    document.getElementById('btn-prev').classList.toggle('hidden', step === 1);
    document.getElementById('btn-next').classList.toggle('hidden', step === 4);
    document.getElementById('event-submit-btn').classList.toggle('hidden', step !== 4);

    if (step === 4) generatePreview();
    if (window.lucide) lucide.createIcons();
}

function changeStep(delta) {
    const next = currentStep + delta;
    if (next >= 1 && next <= 4) {
        if (delta === 0 && !validateStep(currentStep)) return;
        setStep(next);
    }
}

function validateStep(step) {
    if (step === 1) {
        if (!vibeCover) { alert("Please upload a cover image."); return false; }
        if (!document.getElementById('event-title').value) return false;
        if (!document.getElementById('event-type').value) { alert("Please select a category."); return false; }
    }
    if (step === 2 && eventTags.length < 2) { alert("Add at least 2 tags."); return false; }
    return true;
}

function renderCategoryMenu() {
    const menu = document.getElementById('event-type-menu');
    menu.innerHTML = state.categories.map(cat => `
        <div class="event-type-item" data-action="select-category" data-category="${cat}">${cat}</div>
    `).join('');
}

function toggleEventTypeMenu() {
    document.getElementById('event-type-menu').classList.toggle('hidden');
}

function selectCategory(cat) {
    document.getElementById('event-type').value = cat;
    document.getElementById('event-type-label').textContent = cat;
    toggleEventTypeMenu();
}

function handleCoverUpload(e) {
    if (e.target.files[0]) {
        vibeCover = e.target.files[0];
        renderCarousel();
    }
}

function triggerCoverUpload() { document.getElementById('cover-upload').click(); }
function triggerHighlightUpload() { document.getElementById('highlight-upload').click(); }
function removeHighlight(index) { vibeHighlights.splice(index, 1); renderCarousel(); }

function handleHighlightUpload(e) {
    const files = Array.from(e.target.files);
    vibeHighlights = [...vibeHighlights, ...files].slice(0, 9);
    renderCarousel();
}

function renderCarousel() {
    const track = document.getElementById('media-track');
    let html = `<div class="min-w-full h-full snap-center flex-shrink-0 relative bg-slate-800 flex items-center justify-center">`;
    
    if (vibeCover) {
        html += `<img src="${URL.createObjectURL(vibeCover)}" class="absolute inset-0 w-full h-full object-cover">
                 <button type="button" data-action="trigger-cover-upload" class="z-10 bg-black/50 p-2 rounded-full text-xs text-white">Change Cover</button>`;
    } else {
        html += `<div data-action="trigger-cover-upload" class="text-center cursor-pointer"><i data-lucide="image-plus" class="w-8 h-8 mx-auto text-fuchsia-400"></i><p class="text-xs mt-2">Add Cover</p></div>`;
    }
    html += `</div>`;

    vibeHighlights.forEach((file, i) => {
        html += `<div class="min-w-full h-full snap-center flex-shrink-0 relative bg-slate-800 flex items-center justify-center">
                    <img src="${URL.createObjectURL(file)}" class="absolute inset-0 w-full h-full object-cover">
                    <button type="button" data-action="remove-highlight" data-index="${i}" class="absolute top-2 right-2 bg-red-500 rounded-full p-1"><i data-lucide="x" class="w-3 h-3"></i></button>
                 </div>`;
    });

    if (vibeHighlights.length < 9) {
        html += `<div data-action="trigger-highlight-upload" class="min-w-full h-full snap-center flex-shrink-0 bg-slate-900/50 flex items-center justify-center cursor-pointer border-l border-white/5">
                    <i data-lucide="plus" class="w-6 h-6 text-cyan-400"></i>
                 </div>`;
    }

    track.innerHTML = html;
    updateCounter();
    if (window.lucide) lucide.createIcons();
}

function scrollCarousel(dir) {
    const track = document.getElementById('media-track');
    track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
    setTimeout(updateCounter, 300);
}

function updateCounter() {
    const track = document.getElementById('media-track');
    const idx = Math.round(track.scrollLeft / track.clientWidth);
    document.getElementById('media-counter').textContent = `${idx + 1} / ${track.children.length}`;
}

function renderTags() {
    document.getElementById('tags-container').innerHTML = eventTags.map((t, i) => `
        <span class="bg-fuchsia-500/20 text-fuchsia-400 px-3 py-1 rounded-full text-xs flex items-center gap-1">
            #${t} <i data-lucide="x" class="w-3 h-3 cursor-pointer" data-action="remove-tag" data-index="${i}"></i>
        </span>
    `).join('');
    if (window.lucide) lucide.createIcons();
}
function removeTag(index) { eventTags.splice(index, 1); renderTags(); }

function toggleTicketTypes() {
    const isPaid = document.querySelector('input[name="ticket_type"]:checked').value === 'Paid';
    document.getElementById('paid-tiers-section').classList.toggle('hidden', !isPaid);
    if (isPaid && ticketTiers.length === 0) addTier();
}

function addTier() {
    ticketTiers.push({ name: '', price: '' });
    renderTiers();
}

function removeTier(index) { ticketTiers.splice(index, 1); renderTiers(); }

function renderTiers() {
    const container = document.getElementById('paid-tiers-container');
    container.innerHTML = ticketTiers.map((t, i) => `
        <div class="flex gap-2 bg-slate-900 p-3 rounded-xl border border-white/5">
            <input type="text" placeholder="Tier Name" value="${t.name}" oninput="ticketTiers[${i}].name=this.value" class="flex-1 bg-transparent outline-none text-sm">
            <input type="number" placeholder="Price" value="${t.price}" oninput="ticketTiers[${i}].price=this.value" class="w-20 bg-transparent outline-none text-sm text-cyan-400 font-bold">
            <button type="button" data-action="remove-tier" data-index="${i}"><i data-lucide="trash" class="w-4 h-4 text-red-400"></i></button>
        </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
}

function generatePreview() {
    document.getElementById('prev-title').textContent = document.getElementById('event-title').value || "Untitled Event";
    document.getElementById('prev-category').textContent = document.getElementById('event-type').value || "General";
    document.getElementById('prev-venue').textContent = document.getElementById('event-location').value || "Venue TBD";
    document.getElementById('prev-date').textContent = document.getElementById('event-date').value || "Date";
    document.getElementById('prev-time').textContent = document.getElementById('event-time').value || "Time";
    document.getElementById('prev-bio').textContent = document.getElementById('event-bio').value || "No bio...";
    
    if (vibeCover) {
        document.getElementById('prev-img-area').style.background = `url(${URL.createObjectURL(vibeCover)}) center/cover`;
        document.getElementById('prev-img-area').innerHTML = `<span class="absolute top-3 right-3 bg-black/60 px-3 py-1 rounded-full text-xs text-cyan-300">${document.getElementById('event-type').value}</span>`;
    }

    const services = Array.from(document.querySelectorAll('.service-checkbox:checked')).map(el => el.value);
    document.getElementById('prev-tags-services').innerHTML = [
        ...eventTags.map(t => `<span class="text-fuchsia-400 text-xs">#${t}</span>`),
        ...services.map(s => `<span class="bg-white/5 px-2 py-0.5 rounded text-[10px]">${s}</span>`)
    ].join(' ');
}

async function handlePostSubmit(e) {
    e.preventDefault();
    const btn = state.isEventMode ? document.getElementById('event-submit-btn') : document.getElementById('post-submit-btn');
    const originalText = btn.textContent;
    
    btn.disabled = true;
    btn.textContent = "Publishing...";

    // Mock API call
    setTimeout(() => {
        alert(state.isEventMode ? "Vibe Event Published!" : "Post Dropped!");
        btn.disabled = false;
        btn.textContent = originalText;
        location.reload(); // Reset for demo
    }, 1500);
}
