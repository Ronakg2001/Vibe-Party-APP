let isPublishingCreatePost = false;

function togglePostType(isEvent) {
        state.isEventMode = isEvent;
        const btnPost = document.getElementById('btn-type-post');
        const btnEvent = document.getElementById('btn-type-event');
        const eventFields = document.getElementById('event-fields');
        const postMediaWrap = document.getElementById('post-media-wrap');
        const postCaptionWrap = document.getElementById('post-caption-wrap');
        const postLinkWrap = document.getElementById('post-link-wrap');
        const postSubmitWrap = document.getElementById('post-submit-wrap');

        if (isEvent) {
            btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-900/20";
            btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white";
            eventFields.classList.remove('hidden');
            eventFields.classList.add('flex');
            if (postMediaWrap) postMediaWrap.classList.add('hidden');
            if (postCaptionWrap) postCaptionWrap.classList.add('hidden');
            if (postLinkWrap) postLinkWrap.classList.add('hidden');
            if (postSubmitWrap) postSubmitWrap.classList.add('hidden');
            if (typeof setStep === 'function') setStep(1);
        } else {
            btnPost.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all bg-slate-700 text-white shadow-lg";
            btnEvent.className = "flex-1 py-2.5 rounded-lg text-sm font-bold transition-all text-gray-400 hover:text-white";
            eventFields.classList.add('hidden');
            eventFields.classList.remove('flex');
            if (postMediaWrap) postMediaWrap.classList.remove('hidden');
            if (postCaptionWrap) postCaptionWrap.classList.remove('hidden');
            if (postLinkWrap) postLinkWrap.classList.remove('hidden');
            if (postSubmitWrap) postSubmitWrap.classList.remove('hidden');
            if (typeof renderPostEventLinkOptions === 'function') renderPostEventLinkOptions();
            if (typeof updatePostLinkHelper === 'function') updatePostLinkHelper();
        }
    }

    function renderSelectedEventMedia() {
        const stage = document.getElementById('event-media-stage');
        const frame = document.getElementById('event-media-frame');
        const counter = document.getElementById('event-media-counter');
        const emptyState = document.getElementById('event-media-empty-state');
        if (!stage || !frame || !counter || !emptyState) return;
        state.pendingEventMediaPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
        state.pendingEventMediaPreviewUrls = [];
        if (state.pendingEventMedia.length === 0) {
            stage.classList.add('hidden');
            emptyState.classList.remove('hidden');
            frame.innerHTML = '';
            counter.textContent = '';
            state.pendingMediaIndex = 0;
            return;
        }
        emptyState.classList.add('hidden');
        stage.classList.remove('hidden');
        const slideCount = state.pendingEventMedia.length + 1;
        if (state.pendingMediaIndex >= slideCount) {
            state.pendingMediaIndex = 0;
        }

        if (state.pendingMediaIndex === state.pendingEventMedia.length) {
            frame.innerHTML = `
                <div class="w-full h-full grid place-items-center bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-fuchsia-950/35 p-5 text-center"
                    data-action="trigger-event-media-input">
                    <div class="space-y-3">
                        <div class="mx-auto w-16 h-16 rounded-full bg-white/10 border border-white/20 grid place-items-center text-white text-3xl">+</div>
                        <p class="text-white font-semibold">Add or Change Media</p>
                        <p class="text-xs text-gray-300">Keep current media and add more (max 10 total).</p>
                    </div>
                </div>
            `;
            counter.textContent = `${slideCount} / ${slideCount}`;
            return;
        }

        const file = state.pendingEventMedia[state.pendingMediaIndex];
        const previewUrl = URL.createObjectURL(file);
        state.pendingEventMediaPreviewUrls.push(previewUrl);
        const isVideo = (file.type || '').startsWith('video/');
        frame.innerHTML = isVideo
            ? `<video src="${previewUrl}" class="w-full h-full object-cover" controls playsinline preload="metadata" data-action="pending-swipe"></video>`
            : `<img src="${previewUrl}" class="w-full h-full object-cover" data-action="pending-swipe">`;
        counter.textContent = `${state.pendingMediaIndex + 1} / ${slideCount}`;
    }


    function getHostedEventsForPostLinking() {
        if (typeof getHostedEvents === 'function') {
            return getHostedEvents() || [];
        }
        return Array.isArray(state.hostedEventPosts) ? state.hostedEventPosts : [];
    }

    function getSelectedLinkedEventPost() {
        const select = document.getElementById('post-linked-event-id');
        const selectedId = select?.value || '';
        if (!selectedId) return null;
        const hostedEvents = getHostedEventsForPostLinking();
        return hostedEvents.find((eventPost) => eventPost.id === selectedId) || (typeof getPostById === 'function' ? getPostById(selectedId) : null);
    }

    function renderPostEventLinkOptions() {
        const select = document.getElementById('post-linked-event-id');
        if (!select) return;
        const hostedEvents = getHostedEventsForPostLinking();
        const currentValue = select.value;
        select.innerHTML = '';

        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = hostedEvents.length > 0 ? 'Just a normal post' : 'No hosted events yet';
        select.appendChild(defaultOption);

        hostedEvents.forEach((eventPost) => {
            const option = document.createElement('option');
            option.value = eventPost.id;
            const status = typeof isEventEndedFromDetails === 'function' && isEventEndedFromDetails(eventPost.eventDetails) ? 'Ended' : 'Running';
            option.textContent = `${eventPost.eventDetails?.title || 'Untitled Event'} - ${status}`;
            select.appendChild(option);
        });

        if (currentValue && hostedEvents.some((eventPost) => eventPost.id === currentValue)) {
            select.value = currentValue;
        }
        updatePostLinkHelper();
    }

    function updatePostLinkHelper() {
        const helper = document.getElementById('post-link-helper');
        if (!helper) return;
        const hostedEvents = getHostedEventsForPostLinking();
        const linkedEvent = getSelectedLinkedEventPost();

        if (!linkedEvent) {
            if (hostedEvents.length === 0) {
                helper.textContent = 'Publish an event first if you want this post to show up as a highlight.';
                helper.className = 'text-xs text-amber-300';
                isPublishingCreatePost = false;
                return;
            }
            helper.textContent = 'Choose one of your hosted events to turn this into a pre-event or post-event highlight.';
            helper.className = 'text-xs text-gray-400';
            return;
        }

        const isEnded = typeof isEventEndedFromDetails === 'function' && isEventEndedFromDetails(linkedEvent.eventDetails);
        helper.textContent = isEnded
            ? `This post will appear under Post-event Highlights for ${linkedEvent.eventDetails?.title || 'your event'}.`
            : `This post will appear under Pre-event Highlights for ${linkedEvent.eventDetails?.title || 'your event'}.`;
        helper.className = `text-xs ${isEnded ? 'text-rose-300' : 'text-cyan-300'}`;
    }

    function buildLocalPostMediaPayload(files) {
        const fallbackImage = `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`;
        const normalizedFiles = Array.isArray(files) ? files : [];
        const mediaUrls = [];
        const mediaTypes = [];
        let preferredImage = '';

        normalizedFiles.forEach((file) => {
            const url = URL.createObjectURL(file);
            const type = (file.type || '').toLowerCase().startsWith('video/') ? 'video' : 'image';
            mediaUrls.push(url);
            mediaTypes.push(type);
            if (!preferredImage && type === 'image') {
                preferredImage = url;
            }
        });

        return {
            image: preferredImage || fallbackImage,
            mediaUrl: mediaUrls[0] || fallbackImage,
            mediaType: mediaTypes[0] || 'image',
            mediaUrls: mediaUrls.length > 0 ? mediaUrls : [fallbackImage],
            mediaTypes: mediaTypes.length > 0 ? mediaTypes : ['image']
        };
    }


    function calculateDurationMinutesForSubmission(startDate, startTime, endDate, endTime) {
        if (!startDate || !startTime || !endTime) return null;
        const startAt = new Date(`${startDate}T${startTime}:00`);
        if (Number.isNaN(startAt.getTime())) return null;
        const baseEndDate = endDate || startDate;
        const endAt = new Date(`${baseEndDate}T${endTime}:00`);
        if (Number.isNaN(endAt.getTime())) return null;
        if (!endDate && endAt.getTime() <= startAt.getTime()) {
            endAt.setDate(endAt.getDate() + 1);
        }
        const diffMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
        return diffMinutes > 0 ? diffMinutes : null;
    }

    function resetPostCreation() {
        const caption = document.getElementById('post-caption');
        const linkedEventSelect = document.getElementById('post-linked-event-id');
        const mediaInput = document.getElementById('event-media-input');

        if (caption) caption.value = '';
        if (linkedEventSelect) linkedEventSelect.value = '';
        if (mediaInput) mediaInput.value = '';

        state.pendingEventMedia = [];
        if (state.pendingEventMediaPreviewUrls) {
            state.pendingEventMediaPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
            state.pendingEventMediaPreviewUrls = [];
        }
        state.pendingMediaIndex = 0;
        renderSelectedEventMedia();
        updatePostLinkHelper();
        if (typeof setLocationStatus === 'function') setLocationStatus('', false);
    }

    function confirmAbortPostCreation() {
        return window.confirm('Discard this post? Your caption, media, and event link will be lost.');
    }

    async function handleEventMediaInputChange(event) {
        const files = Array.from(event.target.files || []);
        if (files.length === 0) return;

        const { accepted, longVideoNames, invalidTypeNames } = await validateIncomingMedia(files);
        const uniqueAccepted = accepted.filter((file) => !isDuplicatePendingMedia(file));
        const slotsLeft = Math.max(0, 10 - state.pendingEventMedia.length);
        const toAdd = uniqueAccepted.slice(0, slotsLeft);
        const overflowCount = Math.max(0, uniqueAccepted.length - toAdd.length);

        if (toAdd.length > 0) {
            state.pendingEventMedia = [...state.pendingEventMedia, ...toAdd];
            state.pendingMediaIndex = Math.max(0, state.pendingEventMedia.length - 1);
        }

        const messages = [];
        if (longVideoNames.length > 0) {
            messages.push(`Skipped ${longVideoNames.length} video(s) longer than 90 seconds.`);
        }
        if (invalidTypeNames.length > 0) {
            messages.push(`Skipped ${invalidTypeNames.length} invalid file(s). Only image/video allowed.`);
        }
        if (overflowCount > 0) {
            messages.push(`Only 10 media files are allowed. ${overflowCount} file(s) were not added.`);
        }
        if (messages.length > 0) {
            alert(messages.join('\n'));
        }

        event.target.value = '';
        renderSelectedEventMedia();
    }

    async function handlePostSubmit(e) {
        // Stop the form from refreshing the page!
        e.preventDefault();
        if (isPublishingCreatePost) return;
        isPublishingCreatePost = true;

        let activityId = null;
        const eventBioValue = document.getElementById('event-bio')?.value;
        const captionValue = state.isEventMode ? (eventBioValue ?? '') : document.getElementById('post-caption').value;
        
        const newPost = {
            id: Math.random().toString(36),
            username: state.currentUser?.username || 'User',
            avatar: state.currentUser?.avatar || '',
            image: `https://images.unsplash.com/photo-1545128485-c400e7702796?w=600&h=600&fit=crop&q=${Math.random()}`,
            caption: captionValue,
            likes: 0,
            isEvent: state.isEventMode
        };

        if (state.isEventMode) {
            const useCurrentLocation = document.getElementById('event-use-current-location')?.checked;
            const eventLocationInputValue = document.getElementById('event-location')?.value?.trim() || '';
            const fallbackPoint = state.eventLocationPoint || state.userLocation;
            const finalPoint = useCurrentLocation ? state.userLocation : fallbackPoint;

            if (!document.getElementById('event-title')?.value?.trim()) {
                setLocationStatus('Please enter event title.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (!eventLocationInputValue) {
                setLocationStatus('Please select event location.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (!finalPoint) {
                setLocationStatus('Please detect location or pick location from map.', true);
                isPublishingCreatePost = false;
                return;
            }

            // --- NEW: Cover Image Validation ---
            if (!vibeCover) {
                setLocationStatus('Please upload a cover image for your vibe.', true);
                isPublishingCreatePost = false;
                return;
            }

            // --- NEW: Ticket Validation ---
            const ticketType = document.querySelector('input[name="ticket_type"]:checked')?.value || 'Free';
            if (ticketType === 'Paid') {
                if (!ticketTiers || ticketTiers.length === 0) {
                    setLocationStatus('Please add at least one ticket tier for a paid event.', true);
                    isPublishingCreatePost = false;
                    return;
                }
                for (const tier of ticketTiers) {
                    if (!tier.name || tier.price === '') {
                        setLocationStatus('Please fill out all ticket tier names and prices.', true);
                        isPublishingCreatePost = false;
                        return;
                    }
                }
            }

            const selectedDate = document.getElementById('event-date').value;
            const selectedTime = document.getElementById('event-time').value;
            const effectiveStartTime = selectedTime || '00:00';
            const selectedEventType = (document.getElementById('event-type')?.value || '').trim();
            const customEventType = (document.getElementById('event-type-other')?.value || '').trim();
            const selectedEndDate = document.getElementById('event-end-date')?.value || '';
            const selectedEndTime = document.getElementById('event-end-time')?.value || '';
            const effectiveEndTime = selectedEndTime || (selectedEndDate ? '23:59' : '');
            const durationInputEl = document.getElementById('event-duration-minutes');
            const durationDisplayEl = document.getElementById('event-duration-display');
            
            if (typeof syncDurationHiddenFromDisplay === 'function') {
                syncDurationHiddenFromDisplay();
            }
            
            let durationMinutes = Number(durationInputEl?.value || 0);
            
            if (!selectedDate) {
                setLocationStatus('Please select event date.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (typeof isFutureEventDateTime === 'function' && !isFutureEventDateTime(selectedDate, effectiveStartTime)) {
                setLocationStatus('Event date/time must be in the future.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (!selectedEventType) {
                setLocationStatus('Please select event type.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (selectedEventType === 'Other' && !customEventType) {
                setLocationStatus('Please enter custom event type.', true);
                isPublishingCreatePost = false;
                return;
            }
            if ((selectedEndDate || effectiveEndTime) && durationDisplayEl?.value?.trim() && !durationDisplayEl.readOnly) {
                setLocationStatus('Choose either End Date/Time or Duration.', true);
                isPublishingCreatePost = false;
                return;
            }
            if (effectiveEndTime) {
                const effectiveEndDate = selectedEndDate || selectedDate;
                if (selectedEndDate && selectedEndDate < selectedDate) {
                    setLocationStatus('End date cannot be before the start date.', true);
                    isPublishingCreatePost = false;
                    return;
                }
                if (typeof isFutureEventDateTime === 'function' && !isFutureEventDateTime(effectiveEndDate, effectiveEndTime)) {
                    setLocationStatus('End date/time must not be in the past.', true);
                    isPublishingCreatePost = false;
                    return;
                }
                if (typeof calculateDurationMinutesFromTimes === 'function') {
                    const computedDuration = calculateDurationMinutesForSubmission(selectedDate, effectiveStartTime, selectedEndDate, effectiveEndTime);
                    if (computedDuration === null || computedDuration < 30 || computedDuration > 24 * 60) {
                        setLocationStatus('Event duration must be between 30 min and 24 hr.', true);
                        isPublishingCreatePost = false;
                        return;
                    }
                    durationMinutes = computedDuration;
                    if (durationInputEl) durationInputEl.value = String(computedDuration);
                    if (durationDisplayEl) {
                        if (typeof formatDurationMinutes === 'function') {
                            durationDisplayEl.value = formatDurationMinutes(computedDuration);
                        }
                        durationDisplayEl.readOnly = true;
                    }
                }
            } else {
                if (durationDisplayEl?.value?.trim() && typeof parseDurationDisplayToMinutes === 'function') {
                    const parsedManualDuration = parseDurationDisplayToMinutes(durationDisplayEl.value);
                    if (parsedManualDuration <= 0) {
                        setLocationStatus('Invalid duration format. Use 90, 1h 30m, 2h, or 45m.', true);
                        isPublishingCreatePost = false;
                        return;
                    }
                    if (parsedManualDuration < 30) {
                        setLocationStatus('Duration must be at least 30 minutes.', true);
                        isPublishingCreatePost = false;
                        return;
                    }
                    if (parsedManualDuration > 24 * 60) {
                        setLocationStatus('Duration cannot be more than 24 hours.', true);
                        isPublishingCreatePost = false;
                        return;
                    }
                    durationMinutes = parsedManualDuration;
                    if (durationInputEl) durationInputEl.value = String(parsedManualDuration);
                    if (typeof formatDurationMinutes === 'function') {
                        durationDisplayEl.value = formatDurationMinutes(parsedManualDuration);
                    }
                } else if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
                    durationMinutes = 0;
                }
            }
            
            const startLabel = [selectedDate, effectiveStartTime].filter(Boolean).join(' ');
            if (typeof startUploadActivity === 'function') {
                activityId = startUploadActivity('Uploading event...');
            }

            try {
                const formData = new FormData();
                formData.append('title', document.getElementById('event-title').value.trim());
                formData.append('description', captionValue.trim());
                formData.append('startLabel', startLabel);
                if (effectiveEndTime) {
                    formData.append('endTime', effectiveEndTime);
                    if (selectedEndDate) {
                        formData.append('endLabel', `${selectedEndDate} ${effectiveEndTime}`);
                    }
                }
                if (durationMinutes > 0) {
                    formData.append('durationMinutes', String(durationMinutes));
                }
                formData.append('locationName', eventLocationInputValue);
                formData.append('latitude', String(finalPoint?.latitude || ''));
                formData.append('longitude', String(finalPoint?.longitude || ''));
                formData.append('eventCategory', selectedEventType === 'Other' ? customEventType : selectedEventType);
                formData.append('currency', 'INR');
                
                // --- NEW: Add Ticketing Data ---
                formData.append('ticketType', ticketType);
                if (ticketType === 'Paid') {
                    formData.append('ticketTiers', JSON.stringify(ticketTiers));
                }

                // Append Cover and Highlights
                if (vibeCover) formData.append('vibeCover', vibeCover);
                vibeHighlights.forEach((file) => formData.append('vibeHighlights', file));
                
                // Keep original fallback if needed
                if (state.pendingEventMedia && state.pendingEventMedia.length > 0) {
                    state.pendingEventMedia.forEach((file) => {
                        formData.append('eventMedia', file);
                    });
                }

                if (typeof postFormData === 'function') {
                    const result = await postFormData('/api/events/create', formData);
                    if (result?.event) {
                        result.event.ticketType = ticketType;
                        result.event.ticketTiers = ticketType === 'Paid' ? ticketTiers : [];
                        if (typeof serverEventToPost === 'function') {
                            const createdEventPost = serverEventToPost(result.event);
                            if (Array.isArray(state.hostedEventPosts)) {
                                state.hostedEventPosts = [createdEventPost, ...state.hostedEventPosts.filter((item) => item.id !== createdEventPost.id)];
                            }
                            if (Array.isArray(state.nearbyEventPosts)) {
                                state.nearbyEventPosts = [createdEventPost, ...state.nearbyEventPosts.filter((item) => item.id !== createdEventPost.id)];
                            }
                        }
                        if (typeof switchTab === 'function') switchTab('home');
                        if (typeof renderFeed === 'function') renderFeed();
                        if (typeof renderLiveNow === 'function') renderLiveNow();
                        if (typeof renderProfileGrid === 'function') renderProfileGrid();
                        if (typeof renderHostedEventList === 'function') renderHostedEventList();
                        if (typeof renderTicketList === 'function') renderTicketList();
                        if (typeof loadHostedEvents === 'function') {
                            loadHostedEvents();
                        }

                        resetEventCreation();

                        if (activityId && typeof finishUploadActivity === 'function') finishUploadActivity(activityId, true);
                        isPublishingCreatePost = false;
                        return;
                    }
                }
                if (activityId && typeof finishUploadActivity === 'function') finishUploadActivity(activityId, false);
                throw new Error('Event upload did not complete. Please try again.');
            } catch (error) {
                if (activityId && typeof finishUploadActivity === 'function') finishUploadActivity(activityId, false);
                if (typeof setLocationStatus === 'function') {
                    setLocationStatus(error.message || 'Failed to create event.', true);
                }
                isPublishingCreatePost = false;
                return;
            }
        }

        // POST MODE
        const linkedEvent = getSelectedLinkedEventPost();
        const postMedia = buildLocalPostMediaPayload(state.pendingEventMedia);
        const trimmedCaption = (captionValue || '').trim();

        if (!trimmedCaption && state.pendingEventMedia.length === 0) {
            if (typeof setLocationStatus === 'function') {
                setLocationStatus('Add a caption or at least one photo/video before publishing.', true);
            }
            isPublishingCreatePost = false;
            return;
        }

        if (linkedEvent?.eventDetails) {
            newPost.linkedEventId = linkedEvent.id;
            newPost.linkedEventTitle = linkedEvent.eventDetails.title || 'Untitled Event';
        }
        newPost.caption = trimmedCaption;
        newPost.image = postMedia.image;
        newPost.mediaUrl = postMedia.mediaUrl;
        newPost.mediaType = postMedia.mediaType;
        newPost.mediaUrls = postMedia.mediaUrls;
        newPost.mediaTypes = postMedia.mediaTypes;
        newPost.createdAt = new Date().toISOString();

        if (typeof startUploadActivity === 'function') activityId = startUploadActivity('Uploading post...');
        if (typeof switchTab === 'function') switchTab('home');
        
        await new Promise((resolve) => setTimeout(resolve, 900));
        
        newPost.userId = state.currentUser?.id || null;
        newPost.avatar = state.currentUser?.avatar || newPost.avatar;
        if (typeof persistSharedPost === 'function') {
            persistSharedPost(newPost);
        } else if (state.posts) {
            state.posts.unshift(newPost);
        }
        if (typeof refreshFollowingFeed === 'function') {
            refreshFollowingFeed();
        }
        if (typeof renderFeed === 'function') renderFeed();
        if (typeof renderProfileGrid === 'function') renderProfileGrid();
        if (typeof renderHostedEventList === 'function') renderHostedEventList();
        
        resetPostCreation();
        if (activityId && typeof finishUploadActivity === 'function') finishUploadActivity(activityId, true);
        isPublishingCreatePost = false;
    }

    function confirmAbortEventCreation() {
        return window.confirm('Discard event creation? Your progress will be lost.');
    }

    function bindCreatePostActions() {
        document.addEventListener('click', (event) => {
            const actionEl = event.target.closest('[data-action]');
            if (!actionEl) return;
            const action = actionEl.dataset.action;

            switch (action) {
                case 'toggle-post-type':
                    togglePostType(actionEl.dataset.eventMode === 'true');
                    break;
                case 'trigger-event-media-input':
                    event.preventDefault();
                    event.stopPropagation();
                    document.getElementById('event-media-input')?.click();
                    break;
                case 'shift-pending-media':
                    event.preventDefault();
                    event.stopPropagation();
                    shiftPendingMedia(Number(actionEl.dataset.direction || 0));
                    break;
                case 'scroll-carousel':
                    scrollCarousel(Number(actionEl.dataset.direction || 0));
                    break;
                case 'trigger-cover-upload':
                    triggerCoverUpload();
                    break;
                case 'trigger-highlight-upload':
                    triggerHighlightUpload();
                    break;
                case 'trigger-highlight-change':
                    triggerHighlightChange(Number(actionEl.dataset.index || 0));
                    break;
                case 'remove-highlight':
                    removeHighlight(Number(actionEl.dataset.index || 0));
                    break;
                case 'toggle-event-type-menu':
                    toggleEventTypeMenu();
                    break;
                case 'open-location-modal':
                    openLocationModal(actionEl.dataset.context || 'event');
                    break;
                case 'open-event-date-modal':
                    openEventDateModal(actionEl.dataset.inputId || 'event-date-display');
                    break;
                case 'open-analog-time-modal':
                    openAnalogTimeModal(actionEl.dataset.inputId || 'event-time-display');
                    break;
                case 'clear-duration':
                    clearDurationSelection();
                    break;
                case 'remove-service':
                    removeServiceNode(actionEl, event);
                    break;
                case 'remove-tag':
                    removeTag(Number(actionEl.dataset.index || 0));
                    break;
                case 'remove-tier':
                    removeTier(Number(actionEl.dataset.index || 0));
                    break;
                case 'toggle-custom-service':
                    toggleCustomService();
                    break;
                case 'add-custom-service':
                    addCustomService();
                    break;
                case 'add-tier':
                    addTier();
                    break;
                case 'change-step':
                    changeStep(Number(actionEl.dataset.step || 0));
                    break;
                case 'cancel-event-create':
                    if (confirmAbortEventCreation()) {
                        resetEventCreation();
                    }
                    break;
                case 'confirm-booking':
                    confirmBooking();
                    break;
                case 'close-booking-modal':
                    closeBookingModal();
                    break;
                default:
                    break;
            }
        });

        document.addEventListener('touchstart', (event) => {
            const swipeEl = event.target.closest('[data-action="pending-swipe"]');
            if (!swipeEl) return;
            startPendingMediaSwipe(event);
        }, { passive: true });

        document.addEventListener('touchend', (event) => {
            const swipeEl = event.target.closest('[data-action="pending-swipe"]');
            if (!swipeEl) return;
            endPendingMediaSwipe(event);
        });
    }

    function bindCreatePostInputs() {
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
        const capacityToggle = document.getElementById('capacity-toggle');
        if (capacityToggle) {
            capacityToggle.addEventListener('change', () => {
                updateRemainingSeatsUI();
                renderTiers();
            });
        }
        const capacityInput = document.getElementById('inp-capacity');
        if (capacityInput) {
            capacityInput.addEventListener('input', updateRemainingSeatsUI);
        }
        const capacityFlex = document.getElementById('inp-capacity-flex');
        if (capacityFlex) {
            capacityFlex.addEventListener('change', updateRemainingSeatsUI);
        }
        document.querySelectorAll('input[name=\"ticket_type\"]').forEach((input) => {
            input.addEventListener('change', toggleTicketTypes);
        });
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

    // --- Event Builder (Create Event Stepper) ---
    let currentStep = 1;
    const totalSteps = 4;

    let vibeCover = null;
    let vibeHighlights = [];
    let editingHighlightIndex = -1;

    let eventTags = [];
    let ticketTiers = [
        { name: 'Regular Entry', price: '', qty: '', flex: false, services: '' }
    ];

    let swipeReady = false;
    let swipeDragging = false;
    let swipeStartX = 0;
    let swipeCurrentX = 0;
    let swipeMaxDrag = 120;
    let swipeThreshold = 100;

    function updateSwipeLabels() {
        const left = document.getElementById('eventSwipeTextLeft');
        const right = document.getElementById('eventSwipeTextRight');
        if (!left || !right) return;

        if (currentStep === 1) {
            left.textContent = 'Abort';
            right.textContent = 'Next';
        } else if (currentStep === totalSteps) {
            left.textContent = 'Back';
            right.textContent = 'Publish';
        } else {
            left.textContent = 'Back';
            right.textContent = 'Next';
        }
    }

    function resetSwipeVisuals() {
        const thumb = document.getElementById('eventSwipeThumb');
        const bg = document.getElementById('eventSwipeBg');
        const icon = document.getElementById('eventSwipeIcon');
        const left = document.getElementById('eventSwipeTextLeft');
        const right = document.getElementById('eventSwipeTextRight');
        if (!thumb || !bg || !icon) return;

        bg.style.opacity = 0;
        bg.style.boxShadow = 'none';
        icon.style.transform = 'rotate(0deg)';
        icon.style.stroke = '#141414';
        if (left) left.style.opacity = 1;
        if (right) right.style.opacity = 1;
        thumb.style.transform = 'translateX(0px) scale(1)';
        swipeCurrentX = 0;
    }

    function resetSwipeSlider() {
        const thumb = document.getElementById('eventSwipeThumb');
        const bg = document.getElementById('eventSwipeBg');
        if (thumb) thumb.classList.add('event-swipe-snap');
        if (bg) bg.classList.add('event-swipe-snap-bg');
        resetSwipeVisuals();
    }

    function swipeActionNext() {
        if (currentStep < totalSteps) {
            changeStep(1);
            return;
        }

        const form = document.getElementById('create-post-form');
        if (form && typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return;
        }
        document.getElementById('event-submit-btn')?.click();
    }

    function swipeActionBack() {
        if (currentStep === 1) {
            if (confirmAbortEventCreation()) {
                if (typeof resetEventCreation === 'function') resetEventCreation();
            }
            return;
        }
        changeStep(-1);
    }

    function initSwipePanel() {
        const panel = document.getElementById('eventSwipePanel');
        const thumb = document.getElementById('eventSwipeThumb');
        const bg = document.getElementById('eventSwipeBg');
        const icon = document.getElementById('eventSwipeIcon');
        const left = document.getElementById('eventSwipeTextLeft');
        const right = document.getElementById('eventSwipeTextRight');

        if (!panel || !thumb || !bg || !icon || !left || !right || swipeReady) return;
        swipeReady = true;

        const colorRight = '#0D3A63';
        const glowRight = '#00d2ff';
        const colorLeft = '#C84C49';
        const glowLeft = '#ff4d4d';

        const dragStart = (e) => {
            swipeDragging = true;
            swipeStartX = e.clientX;

            const cWidth = panel.offsetWidth || 340;
            const tWidth = thumb.offsetWidth || 50;
            const padding = 22;
            swipeMaxDrag = (cWidth / 2) - (tWidth / 2) - padding;
            swipeThreshold = swipeMaxDrag * 0.85;

            thumb.classList.remove('event-swipe-snap');
            bg.classList.remove('event-swipe-snap-bg');
            bg.classList.remove('event-swipe-energetic');
            thumb.setPointerCapture(e.pointerId);
        };

        const dragMove = (e) => {
            if (!swipeDragging) return;

            let deltaX = e.clientX - swipeStartX;
            if (deltaX > swipeMaxDrag) deltaX = swipeMaxDrag;
            if (deltaX < -swipeMaxDrag) deltaX = -swipeMaxDrag;

            swipeCurrentX = deltaX;
            const dragPercent = Math.abs(deltaX) / swipeMaxDrag;

            if (deltaX > 0) {
                bg.style.backgroundColor = colorRight;
                bg.style.boxShadow = `inset 0 0 ${40 * dragPercent}px ${colorRight}, 0 0 ${20 * dragPercent}px ${glowRight}`;
                bg.style.opacity = dragPercent + 0.2;
                icon.style.transform = `rotate(${-90 * dragPercent}deg)`;

                if (deltaX >= swipeThreshold) {
                    bg.classList.add('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1.1)`;
                    icon.style.stroke = glowRight;
                } else {
                    bg.classList.remove('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1)`;
                    icon.style.stroke = '#141414';
                }

                right.style.opacity = 1 - dragPercent;
                left.style.opacity = 1;
            } else if (deltaX < 0) {
                bg.style.backgroundColor = colorLeft;
                bg.style.boxShadow = `inset 0 0 ${40 * dragPercent}px ${colorLeft}, 0 0 ${20 * dragPercent}px ${glowLeft}`;
                bg.style.opacity = dragPercent + 0.2;
                icon.style.transform = `rotate(${90 * dragPercent}deg)`;

                if (deltaX <= -swipeThreshold) {
                    bg.classList.add('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1.1)`;
                    icon.style.stroke = glowLeft;
                } else {
                    bg.classList.remove('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1)`;
                    icon.style.stroke = '#141414';
                }

                left.style.opacity = 1 - dragPercent;
                right.style.opacity = 1;
            } else {
                resetSwipeVisuals();
            }
        };

        const dragEnd = (e) => {
            if (!swipeDragging) return;
            swipeDragging = false;
            thumb.releasePointerCapture(e.pointerId);

            thumb.classList.add('event-swipe-snap');
            bg.classList.add('event-swipe-snap-bg');
            bg.classList.remove('event-swipe-energetic');

            if (swipeCurrentX >= swipeThreshold) {
                thumb.style.transform = `translateX(${swipeMaxDrag}px) scale(1)`;
                swipeActionNext();
                setTimeout(resetSwipeSlider, 350);
                return;
            }
            if (swipeCurrentX <= -swipeThreshold) {
                thumb.style.transform = `translateX(${-swipeMaxDrag}px) scale(1)`;
                swipeActionBack();
                setTimeout(resetSwipeSlider, 350);
                return;
            }
            resetSwipeSlider();
        };

        thumb.addEventListener('pointerdown', dragStart);
        window.addEventListener('pointermove', dragMove);
        window.addEventListener('pointerup', dragEnd);
        updateSwipeLabels();
        resetSwipeSlider();
    }


    let postSwipeReady = false;
    let postSwipeDragging = false;
    let postSwipeStartX = 0;
    let postSwipeCurrentX = 0;
    let postSwipeMaxDrag = 120;
    let postSwipeThreshold = 100;

    function resetPostSwipeVisuals() {
        const thumb = document.getElementById('postSwipeThumb');
        const bg = document.getElementById('postSwipeBg');
        const icon = document.getElementById('postSwipeIcon');
        const left = document.getElementById('postSwipeTextLeft');
        const right = document.getElementById('postSwipeTextRight');
        if (!thumb || !bg || !icon) return;

        bg.style.opacity = 0;
        bg.style.boxShadow = 'none';
        icon.style.transform = 'rotate(0deg)';
        icon.style.stroke = '#141414';
        if (left) left.style.opacity = 1;
        if (right) right.style.opacity = 1;
        thumb.style.transform = 'translateX(0px) scale(1)';
        postSwipeCurrentX = 0;
    }

    function resetPostSwipeSlider() {
        const thumb = document.getElementById('postSwipeThumb');
        const bg = document.getElementById('postSwipeBg');
        if (thumb) thumb.classList.add('event-swipe-snap');
        if (bg) bg.classList.add('event-swipe-snap-bg');
        resetPostSwipeVisuals();
    }

    function postSwipeActionPublish() {
        const form = document.getElementById('create-post-form');
        if (form && typeof form.requestSubmit === 'function') {
            form.requestSubmit();
            return;
        }
        document.getElementById('post-submit-btn')?.click();
    }

    function postSwipeActionCancel() {
        if (confirmAbortPostCreation()) {
            resetPostCreation();
        }
    }

    function initPostSwipePanel() {
        const panel = document.getElementById('postSwipePanel');
        const thumb = document.getElementById('postSwipeThumb');
        const bg = document.getElementById('postSwipeBg');
        const icon = document.getElementById('postSwipeIcon');
        const left = document.getElementById('postSwipeTextLeft');
        const right = document.getElementById('postSwipeTextRight');

        if (!panel || !thumb || !bg || !icon || !left || !right || postSwipeReady) return;
        postSwipeReady = true;

        const colorRight = '#0D3A63';
        const glowRight = '#00d2ff';
        const colorLeft = '#C84C49';
        const glowLeft = '#ff4d4d';

        const dragStart = (e) => {
            postSwipeDragging = true;
            postSwipeStartX = e.clientX;

            const cWidth = panel.offsetWidth || 340;
            const tWidth = thumb.offsetWidth || 50;
            const padding = 22;
            postSwipeMaxDrag = (cWidth / 2) - (tWidth / 2) - padding;
            postSwipeThreshold = postSwipeMaxDrag * 0.85;

            thumb.classList.remove('event-swipe-snap');
            bg.classList.remove('event-swipe-snap-bg');
            bg.classList.remove('event-swipe-energetic');
            thumb.setPointerCapture(e.pointerId);
        };

        const dragMove = (e) => {
            if (!postSwipeDragging) return;

            let deltaX = e.clientX - postSwipeStartX;
            if (deltaX > postSwipeMaxDrag) deltaX = postSwipeMaxDrag;
            if (deltaX < -postSwipeMaxDrag) deltaX = -postSwipeMaxDrag;

            postSwipeCurrentX = deltaX;
            const dragPercent = Math.abs(deltaX) / postSwipeMaxDrag;

            if (deltaX > 0) {
                bg.style.backgroundColor = colorRight;
                bg.style.boxShadow = `inset 0 0 ${40 * dragPercent}px ${colorRight}, 0 0 ${20 * dragPercent}px ${glowRight}`;
                bg.style.opacity = dragPercent + 0.2;
                icon.style.transform = `rotate(${-90 * dragPercent}deg)`;

                if (deltaX >= postSwipeThreshold) {
                    bg.classList.add('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1.1)`;
                    icon.style.stroke = glowRight;
                } else {
                    bg.classList.remove('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1)`;
                    icon.style.stroke = '#141414';
                }

                right.style.opacity = 1 - dragPercent;
                left.style.opacity = 1;
            } else if (deltaX < 0) {
                bg.style.backgroundColor = colorLeft;
                bg.style.boxShadow = `inset 0 0 ${40 * dragPercent}px ${colorLeft}, 0 0 ${20 * dragPercent}px ${glowLeft}`;
                bg.style.opacity = dragPercent + 0.2;
                icon.style.transform = `rotate(${90 * dragPercent}deg)`;

                if (deltaX <= -postSwipeThreshold) {
                    bg.classList.add('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1.1)`;
                    icon.style.stroke = glowLeft;
                } else {
                    bg.classList.remove('event-swipe-energetic');
                    thumb.style.transform = `translateX(${deltaX}px) scale(1)`;
                    icon.style.stroke = '#141414';
                }

                left.style.opacity = 1 - dragPercent;
                right.style.opacity = 1;
            } else {
                resetPostSwipeVisuals();
            }
        };

        const dragEnd = (e) => {
            if (!postSwipeDragging) return;
            postSwipeDragging = false;
            thumb.releasePointerCapture(e.pointerId);

            thumb.classList.add('event-swipe-snap');
            bg.classList.add('event-swipe-snap-bg');
            bg.classList.remove('event-swipe-energetic');

            if (postSwipeCurrentX >= postSwipeThreshold) {
                thumb.style.transform = `translateX(${postSwipeMaxDrag}px) scale(1)`;
                postSwipeActionPublish();
                setTimeout(resetPostSwipeSlider, 350);
                return;
            }
            if (postSwipeCurrentX <= -postSwipeThreshold) {
                thumb.style.transform = `translateX(${-postSwipeMaxDrag}px) scale(1)`;
                postSwipeActionCancel();
                setTimeout(resetPostSwipeSlider, 350);
                return;
            }
            resetPostSwipeSlider();
        };

        thumb.addEventListener('pointerdown', dragStart);
        window.addEventListener('pointermove', dragMove);
        window.addEventListener('pointerup', dragEnd);
        resetPostSwipeSlider();
    }

    function resetEventCreation() {
        const form = document.getElementById('create-post-form');
        if (form) {
            form.reset();
        }

        vibeCover = null;
        vibeHighlights = [];
        editingHighlightIndex = -1;
        eventTags = [];
        ticketTiers = [{ name: 'Regular Entry', price: '', qty: '', flex: false, services: '' }];

        state.pendingEventMedia = [];
        if (state.pendingEventMediaPreviewUrls) {
            state.pendingEventMediaPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
            state.pendingEventMediaPreviewUrls = [];
        }
        state.pendingMediaIndex = 0;

        const eventTypeLabel = document.getElementById('event-type-label');
        if (eventTypeLabel) eventTypeLabel.textContent = '';
        const eventTypeSelect = document.getElementById('event-type');
        if (eventTypeSelect) eventTypeSelect.value = '';
        const eventTypeOther = document.getElementById('event-type-other');
        if (eventTypeOther) eventTypeOther.value = '';
        document.getElementById('event-type-other-wrap')?.classList.add('hidden');

        const locationInput = document.getElementById('event-location');
        if (locationInput) locationInput.value = '';

        ['event-date-display', 'event-date', 'event-date-multi', 'event-time-display', 'event-time', 'event-end-date-display', 'event-end-date', 'event-end-time-display', 'event-end-time', 'event-duration-minutes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const durationDisplay = document.getElementById('event-duration-display');
        if (durationDisplay) {
            durationDisplay.value = '';
            durationDisplay.readOnly = false;
        }

        document.querySelectorAll('#services-container .service-checkbox').forEach((input) => {
            input.checked = false;
        });
        document.querySelectorAll('#services-container [data-custom-service="true"]').forEach((node) => node.remove());
        document.getElementById('custom-service-wrap')?.classList.add('hidden');
        const customServiceInput = document.getElementById('inp-custom-service');
        if (customServiceInput) customServiceInput.value = '';

        const freeTicket = document.querySelector('input[name="ticket_type"][value="Free"]');
        if (freeTicket) freeTicket.checked = true;

        setStep(1);
        renderCarousel();
        renderSelectedEventMedia();
        renderTags();
        renderTiers();
        toggleTicketTypes();
        updateRemainingSeatsUI();
        const advancedRow = document.getElementById('event-advanced-time-row');
        if (advancedRow) advancedRow.classList.add('hidden');
        const startDisplay = document.getElementById('event-time-display');
        const endDateDisplay = document.getElementById('event-end-date-display');
        const endTimeDisplay = document.getElementById('event-end-time-display');
        if (startDisplay) startDisplay.disabled = true;
        if (endDateDisplay) endDateDisplay.disabled = true;
        if (endTimeDisplay) endTimeDisplay.disabled = true;
        if (durationDisplay) durationDisplay.disabled = true;
        if (typeof setLocationStatus === 'function') setLocationStatus('', false);
    }

    function initEventBuilder() {
        const eventFields = document.getElementById('event-fields');
        if (!eventFields) return;

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        setStep(1);
        initSwipePanel();
        initPostSwipePanel();
        renderPostEventLinkOptions();
        updatePostLinkHelper();
        renderCarousel();
        bindCarouselDrag();
        toggleTicketTypes();
        updateRemainingSeatsUI();

        const dressToggle = document.getElementById('dresscode-toggle');
        const dressWrap = document.getElementById('dresscode-input-wrap');
        if (dressToggle && dressWrap) {
            dressToggle.addEventListener('change', () => {
                dressWrap.classList.toggle('hidden', !dressToggle.checked);
                if (currentStep === totalSteps) generatePreview();
            });
        }

        const promoToggle = document.getElementById('promo-toggle');
        const promoWrap = document.getElementById('promo-input-wrap');
        if (promoToggle && promoWrap) {
            promoToggle.addEventListener('change', () => {
                promoWrap.classList.toggle('hidden', !promoToggle.checked);
                if (currentStep === totalSteps) generatePreview();
            });
        }

        const capacityToggle = document.getElementById('capacity-toggle');
        const capacityWrap = document.getElementById('capacity-input-wrap');
        if (capacityToggle && capacityWrap) {
            capacityToggle.addEventListener('change', () => {
                capacityWrap.classList.toggle('hidden', !capacityToggle.checked);
                updateRemainingSeatsUI();
                renderTiers();
                if (currentStep === totalSteps) generatePreview();
            });
        }

        const tagInput = document.getElementById('inp-tag-entry');
        if (tagInput) {
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') e.preventDefault();

                if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    let val = tagInput.value.trim().replace(/^#/, '').replace(/,/g, '');

                    if (val && !eventTags.includes(val)) {
                        if (eventTags.length < 10) {
                            eventTags.push(val);
                            tagInput.value = '';
                            renderTags();
                        } else {
                            alert('Maximum 10 tags allowed.');
                        }
                    }
                }
            });
        }

        const eventBio = document.getElementById('event-bio');
        const postCaption = document.getElementById('post-caption');
        if (eventBio && postCaption) {
            eventBio.addEventListener('input', () => {
                postCaption.value = eventBio.value;
                if (currentStep === totalSteps) generatePreview();
            });
        }

        const previewInputs = eventFields.querySelectorAll('input, select, textarea');
        previewInputs.forEach((el) => {
            el.addEventListener('input', () => {
                if (currentStep === totalSteps) generatePreview();
            });
            el.addEventListener('change', () => {
                if (currentStep === totalSteps) generatePreview();
            });
        });
    }

    function setStep(step) {
        currentStep = Math.max(1, Math.min(totalSteps, step));
        document.querySelectorAll('.step-container').forEach(el => el.classList.remove('active'));
        const active = document.getElementById(`step-${currentStep}`);
        if (active) active.classList.add('active');

        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');
        const btnSubmit = document.getElementById('event-submit-btn');
        const swipePanel = document.getElementById('eventSwipePanel');

        if (swipePanel) {
            if (btnPrev) btnPrev.classList.add('hidden');
            if (btnNext) btnNext.classList.add('hidden');
            if (btnSubmit) btnSubmit.classList.add('hidden');
            updateSwipeLabels();
            resetSwipeSlider();
        } else {
            if (btnPrev) btnPrev.classList.toggle('hidden', currentStep === 1);
            if (btnNext) btnNext.classList.toggle('hidden', currentStep === totalSteps);
            if (btnSubmit) btnSubmit.classList.toggle('hidden', currentStep !== totalSteps);
        }

        if (currentStep === totalSteps) {
            generatePreview();
        }
    }

    function changeStep(delta) {
        if (delta === 0 && !validateCurrentStep()) return;

        if (currentStep === 1 && delta > 0 && !vibeCover) {
            const carousel = document.getElementById('carousel-wrapper');
            if (carousel) {
                carousel.classList.add('border-red-500', 'shadow-[0_0_15px_rgba(239,68,68,0.3)]');
            }
            alert('Cover image is required.');
            return;
        }

        setStep(currentStep + delta);
    }

    function validateCurrentStep() {
        const currentForm = document.getElementById(`step-${currentStep}`);
        if (!currentForm) return true;

        const requiredFields = currentForm.querySelectorAll('input[required], select[required], textarea[required]');
        for (const field of requiredFields) {
            if (field.disabled) continue;
            if (!field.value || !field.value.toString().trim()) {
                field.focus();
                alert('Please fill all required fields.');
                return false;
            }
        }

        if (currentStep === 1) {
            const eventType = document.getElementById('event-type')?.value?.trim();
            if (!eventType) {
                alert('Please select event type.');
                return false;
            }
            if (eventType === 'Other' && !document.getElementById('event-type-other')?.value?.trim()) {
                alert('Please enter custom event type.');
                return false;
            }
        }

        if (currentStep === 2 && eventTags.length < 2) {
            alert('Please add at least 2 tags.');
            return false;
        }

        return true;
    }

    function renderCarousel() {
        const track = document.getElementById('media-track');
        if (!track) return;

        let html = '';
        html += `
            <div class="min-w-full h-full snap-center flex-shrink-0 relative bg-slate-800/80 flex flex-col items-center justify-center cursor-pointer group select-none">
                ${vibeCover ? `
                    <img src="${URL.createObjectURL(vibeCover)}" class="absolute inset-0 w-full h-full object-cover opacity-80" draggable="false"/>
                    <div class="absolute bottom-5 flex gap-2 z-10 pointer-events-auto">
                        <button type="button" data-action="trigger-cover-upload" class="px-5 py-2 bg-black/80 hover:bg-fuchsia-600 border border-white/20 rounded-full text-xs font-bold text-white backdrop-blur transition-colors shadow-lg">Change Cover</button>
                    </div>
                    <span class="absolute top-3 left-3 bg-fuchsia-500/80 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-white/20 backdrop-blur">Cover</span>
                ` : `
                    <div data-action="trigger-cover-upload" class="flex flex-col items-center gap-2 z-10 p-4 transition-transform group-hover:scale-105 pointer-events-auto w-full h-full justify-center">
                        <div class="p-4 bg-white/5 rounded-full border border-white/10 group-hover:border-fuchsia-500/50 shadow-lg"><i data-lucide="image-plus" class="w-8 h-8 text-fuchsia-400"></i></div>
                        <span class="text-sm font-medium text-white">Upload Cover <span class="text-rose-400">*</span></span>
                        <span class="text-xs text-gray-400 text-center">(Mandatory. Your main poster.)</span>
                    </div>
                `}
            </div>
        `;

        vibeHighlights.forEach((file, index) => {
            const isVideo = file.type.startsWith('video/');
            const url = URL.createObjectURL(file);
            html += `
                <div class="min-w-full h-full snap-center flex-shrink-0 relative bg-slate-800/80 flex flex-col items-center justify-center cursor-pointer group select-none">
                    ${isVideo ? `
                        <video src="${url}" class="absolute inset-0 w-full h-full object-cover opacity-80" muted loop autoplay playsinline draggable="false"></video>
                        <div class="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none"><i data-lucide="play-circle" class="w-12 h-12 text-white/50"></i></div>
                    ` : `
                        <img src="${url}" class="absolute inset-0 w-full h-full object-cover opacity-80" draggable="false"/>
                    `}
                    <div class="absolute bottom-5 flex gap-2 z-10 pointer-events-auto">
                        <button type="button" data-action="trigger-highlight-change" data-index="${index}" class="px-5 py-2 bg-black/80 hover:bg-cyan-600 border border-white/20 rounded-full text-xs font-bold text-white backdrop-blur transition-colors shadow-lg">Change</button>
                        <button type="button" data-action="remove-highlight" data-index="${index}" class="px-5 py-2 bg-black/80 hover:bg-rose-600 border border-white/20 rounded-full text-xs font-bold text-white backdrop-blur transition-colors shadow-lg">Remove</button>
                    </div>
                    <span class="absolute top-3 left-3 bg-cyan-500/80 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded border border-white/20 backdrop-blur">Highlight ${index + 1}</span>
                </div>
            `;
        });

        if (vibeHighlights.length < 9) {
            html += `
                <div class="min-w-full h-full snap-center flex-shrink-0 relative bg-slate-800/50 border-x border-white/5 flex flex-col items-center justify-center cursor-pointer group hover:bg-slate-800/80 transition-colors select-none" data-action="trigger-highlight-upload">
                    <div class="flex flex-col items-center gap-2 z-10 p-4 transition-transform group-hover:scale-105 pointer-events-none">
                        <div class="p-4 bg-white/5 rounded-full border border-white/10 group-hover:border-cyan-500/50 shadow-lg"><i data-lucide="clapperboard" class="w-8 h-8 text-cyan-400"></i></div>
                        <span class="text-sm font-medium text-white text-center">Add Highlight<br><span class="text-xs text-gray-400 font-normal">(${vibeHighlights.length}/9 Uploaded)</span></span>
                    </div>
                </div>
            `;
        }

        track.innerHTML = html;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        updateCounter();
    }

    function triggerCoverUpload() {
        document.getElementById('cover-upload')?.click();
    }

    function handleCoverUpload(e) {
        if (e.target.files.length > 0) {
            vibeCover = e.target.files[0];
            const carousel = document.getElementById('carousel-wrapper');
            if (carousel) {
                carousel.classList.remove('border-red-500', 'shadow-[0_0_15px_rgba(239,68,68,0.3)]');
            }
            renderCarousel();
        }
    }

    function triggerHighlightUpload() {
        document.getElementById('highlight-upload')?.click();
    }

    function handleHighlightUpload(e) {
        const newFiles = Array.from(e.target.files);
        const spacesLeft = 9 - vibeHighlights.length;
        if (newFiles.length > spacesLeft) {
            alert(`You can only add ${spacesLeft} more highlights.`);
        }
        vibeHighlights.push(...newFiles.slice(0, spacesLeft));
        renderCarousel();
        setTimeout(() => scrollCarousel(10), 100);
    }

    function triggerHighlightChange(index) {
        editingHighlightIndex = index;
        document.getElementById('highlight-change')?.click();
    }


    function handleHighlightChangeUpload(e) {
        if (e.target.files.length > 0 && editingHighlightIndex !== -1) {
            vibeHighlights[editingHighlightIndex] = e.target.files[0];
            editingHighlightIndex = -1;
            renderCarousel();
        }
    }

    function removeHighlight(index) {
        vibeHighlights.splice(index, 1);
        renderCarousel();
    }

    function scrollCarousel(dir) {
        const mediaTrack = document.getElementById('media-track');
        if (!mediaTrack) return;
        const slideWidth = mediaTrack.clientWidth;
        mediaTrack.scrollBy({ left: dir * slideWidth, behavior: 'smooth' });
    }

    function updateCounter() {
        const mediaTrack = document.getElementById('media-track');
        if (!mediaTrack || mediaTrack.clientWidth === 0) return;
        const total = mediaTrack.children.length;
        const index = Math.round(mediaTrack.scrollLeft / mediaTrack.clientWidth);
        const counter = document.getElementById('media-counter');
        if (counter) counter.innerText = `${index + 1} / ${total}`;

        const prevBtn = document.getElementById('btn-car-prev');
        const nextBtn = document.getElementById('btn-car-next');
        if (prevBtn) prevBtn.disabled = (index === 0);
        if (nextBtn) nextBtn.disabled = (index >= total - 1);
    }

    function bindCarouselDrag() {
        const mediaTrack = document.getElementById('media-track');
        if (!mediaTrack || mediaTrack.dataset.dragBound === 'true') return;
        mediaTrack.dataset.dragBound = 'true';

        mediaTrack.addEventListener('scroll', updateCounter);

        let isDown = false;
        let startX;
        let scrollLeftPos;

        mediaTrack.addEventListener('mousedown', (e) => {
            isDown = true;
            mediaTrack.classList.remove('cursor-grab');
            mediaTrack.classList.add('cursor-grabbing');
            startX = e.pageX - mediaTrack.offsetLeft;
            scrollLeftPos = mediaTrack.scrollLeft;
        });
        mediaTrack.addEventListener('mouseleave', () => {
            isDown = false;
            mediaTrack.classList.remove('cursor-grabbing');
            mediaTrack.classList.add('cursor-grab');
        });
        mediaTrack.addEventListener('mouseup', () => {
            isDown = false;
            mediaTrack.classList.remove('cursor-grabbing');
            mediaTrack.classList.add('cursor-grab');
        });
        mediaTrack.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - mediaTrack.offsetLeft;
            const walk = (x - startX) * 1.6;
            mediaTrack.scrollLeft = scrollLeftPos - walk;
        });
    }

    function toggleCustomService() {
        const wrap = document.getElementById('custom-service-wrap');
        if (!wrap) return;
        wrap.classList.toggle('hidden');
        document.getElementById('inp-custom-service')?.focus();
    }

    function removeServiceNode(btn, e) {
        e?.preventDefault();
        e?.stopPropagation();
        const label = btn?.closest('label');
        if (label) label.remove();
        if (currentStep === totalSteps) generatePreview();
    }

    function addCustomService() {
        const inputField = document.getElementById('inp-custom-service');
        const container = document.getElementById('services-container');
        const btnWrap = document.getElementById('btn-add-service-wrap');
        if (!inputField || !container || !btnWrap) return;

        const value = inputField.value.trim();
        if (!value) return;

        const newLabel = document.createElement('label');
        newLabel.className = 'cursor-pointer relative service-item group';
        newLabel.dataset.customService = 'true';
        newLabel.innerHTML = `
            <input type="checkbox" class="sr-only service-checkbox" value="${value}" checked>
            <div class="px-4 py-2 pr-10 bg-slate-800 border border-white/10 rounded-full text-sm text-gray-300 transition-colors flex items-center gap-2">
                <i data-lucide="sparkles" class="w-4 h-4"></i> ${value}
            </div>
            <button type="button" data-action="remove-service" class="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full hover:bg-rose-500 hover:text-white opacity-0 group-hover:opacity-100 transition-all text-gray-400 z-10">
                <i data-lucide="x" class="w-3.5 h-3.5"></i>
            </button>
        `;

        container.insertBefore(newLabel, btnWrap);
        inputField.value = '';
        document.getElementById('custom-service-wrap')?.classList.add('hidden');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        if (currentStep === totalSteps) generatePreview();
    }

    function renderTags() {
        const tagsContainer = document.getElementById('tags-container');
        if (!tagsContainer) return;

        if (eventTags.length > 0) {
            tagsContainer.classList.remove('hidden');
        } else {
            tagsContainer.classList.add('hidden');
        }

        tagsContainer.innerHTML = eventTags.map((tag, i) => `
            <span class="bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-sm">
                #${tag}
                <button type="button" data-action="remove-tag" data-index="${i}" class="w-4 h-4 rounded-full bg-black/40 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors">&times;</button>
            </span>
        `).join('');

        if (currentStep === totalSteps) generatePreview();
    }

    function removeTag(index) {
        eventTags.splice(index, 1);
        renderTags();
    }

    function getRemainingSeats() {
        const isCapacityOn = document.getElementById('capacity-toggle')?.checked;
        const isTotalFlex = document.getElementById('inp-capacity-flex')?.checked;
        const totalCapInput = parseInt(document.getElementById('inp-capacity')?.value) || 0;

        if (!isCapacityOn) return null;
        if (isTotalFlex) return 'flex';

        let used = 0;
        ticketTiers.forEach(t => { used += (parseInt(t.qty) || 0); });
        return totalCapInput - used;
    }

    function updateRemainingSeatsUI() {
        const remaining = getRemainingSeats();
        const badge = document.getElementById('remaining-seats-badge');
        const addBtn = document.getElementById('btn-add-tier');

        if (!badge || !addBtn) return;

        if (remaining !== null && remaining !== 'flex') {
            badge.classList.remove('hidden');
            badge.textContent = `Seats Left: ${remaining}`;

            if (remaining <= 0) {
                addBtn.classList.add('hidden');
                badge.classList.replace('text-cyan-300', 'text-rose-400');
                badge.classList.replace('border-cyan-500/30', 'border-rose-500/50');
            } else {
                addBtn.classList.remove('hidden');
                badge.classList.replace('text-rose-400', 'text-cyan-300');
                badge.classList.replace('border-rose-500/50', 'border-cyan-500/30');
            }
        } else if (remaining === 'flex') {
            badge.classList.remove('hidden');
            badge.textContent = 'Seats: Flexible Mode';
            badge.classList.replace('text-rose-400', 'text-cyan-300');
            badge.classList.replace('border-rose-500/50', 'border-cyan-500/30');
            addBtn.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            addBtn.classList.remove('hidden');
        }

        if (currentStep === totalSteps) generatePreview();
    }

    function updateTierField(element, index, field) {
        let value = (element.type === 'checkbox') ? element.checked : element.value;

        if (field === 'qty') {
            const isCapacityOn = document.getElementById('capacity-toggle')?.checked;
            const isTotalFlex = document.getElementById('inp-capacity-flex')?.checked;

            if (isCapacityOn && !isTotalFlex) {
                const totalCap = parseInt(document.getElementById('inp-capacity')?.value) || 0;
                let otherUsed = 0;
                ticketTiers.forEach((t, i) => {
                    if (i !== index) otherUsed += (parseInt(t.qty) || 0);
                });

                const maxAllowed = totalCap - otherUsed;
                let requested = parseInt(value) || 0;

                if (requested > maxAllowed) {
                    alert(`Limit reached! You only have ${maxAllowed} seats available out of your total limit.`);
                    requested = maxAllowed;
                    element.value = requested;
                    value = requested;
                }
            }
        }

        ticketTiers[index][field] = value;
        updateRemainingSeatsUI();
    }

    function addTier() {
        ticketTiers.push({ name: '', price: '', qty: '', flex: false, services: '' });
        renderTiers();
    }

    function removeTier(index) {
        ticketTiers.splice(index, 1);
        renderTiers();
    }

    function renderTiers() {
        const container = document.getElementById('paid-tiers-container');
        const hasCapacityOn = document.getElementById('capacity-toggle')?.checked;
        if (!container) return;

        if (ticketTiers.length === 0) {
            container.innerHTML = '<p class="text-xs text-gray-400 italic">No sections added yet.</p>';
        } else {
            container.innerHTML = ticketTiers.map((tier, index) => `
                <div class="p-4 bg-slate-800/30 border border-white/5 rounded-xl space-y-3 relative group">
                    <div class="flex gap-2">
                        <div class="flex-1 relative neon-border rounded-lg">
                            <input type="text" placeholder="Section Name (e.g. VIP, Regular)" value="${tier.name}" oninput="updateTierField(this, ${index}, 'name')" class="w-full p-2.5 bg-slate-900 rounded-lg outline-none text-sm text-white border border-transparent focus:border-cyan-400/50">
                        </div>
                        <div class="w-32 relative neon-border rounded-lg">
                            <span class="absolute left-3 top-2.5 text-gray-400 font-medium text-sm">Rs</span>
                            <input type="number" placeholder="Price" value="${tier.price}" oninput="updateTierField(this, ${index}, 'price')" class="w-full pl-10 p-2.5 bg-slate-900 rounded-lg outline-none text-sm text-white border border-transparent focus:border-cyan-400/50">
                        </div>
                        <button type="button" data-action="remove-tier" data-index="${index}" class="px-3 text-gray-500 hover:text-rose-400 transition-colors" title="Remove Section">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>

                    ${hasCapacityOn ? `
                    <div class="flex flex-col md:flex-row gap-3 md:items-center">
                        <div class="w-full md:w-32 relative neon-border rounded-lg">
                            <input type="number" placeholder="Seats" value="${tier.qty}" oninput="updateTierField(this, ${index}, 'qty')" class="w-full p-2.5 bg-slate-900 rounded-lg outline-none text-sm text-white border border-transparent focus:border-cyan-400/50">
                        </div>
                        <label class="flex items-center gap-2 cursor-pointer w-fit">
                            <input type="checkbox" class="w-4 h-4 accent-fuchsia-500 rounded border-gray-600 bg-slate-800" ${tier.flex ? 'checked' : ''} onchange="updateTierField(this, ${index}, 'flex')">
                            <span class="text-sm text-gray-300">Flexible Seats</span>
                        </label>
                    </div>
                    ` : ''}

                    <div class="relative neon-border rounded-lg">
                        <i data-lucide="sparkles" class="absolute left-3 top-2.5 w-4 h-4 text-fuchsia-400"></i>
                        <input type="text" placeholder="Provided Services (e.g. 2 Free Drinks, Front Row)" value="${tier.services}" oninput="updateTierField(this, ${index}, 'services')" class="w-full pl-9 p-2.5 bg-slate-900 rounded-lg outline-none text-sm text-white border border-transparent focus:border-fuchsia-400/50">
                    </div>
                </div>
            `).join('');
        }
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
        updateRemainingSeatsUI();
    }

    function toggleTicketTypes() {
        const selected = document.querySelector('input[name="ticket_type"]:checked')?.value || 'Free';
        const paidSection = document.getElementById('paid-tiers-section');
        if (!paidSection) return;

        if (selected === 'Paid') {
            paidSection.classList.remove('hidden');
            renderTiers();
        } else {
            paidSection.classList.add('hidden');
        }

        if (currentStep === totalSteps) generatePreview();
    }

    function generatePreview() {
        const title = document.getElementById('event-title')?.value || 'Untitled Event';
        const category = document.getElementById('event-category')?.value || document.getElementById('event-type')?.value || 'General';
        const highlights = document.getElementById('event-highlights')?.value || '';
        const bio = document.getElementById('event-bio')?.value || document.getElementById('post-caption')?.value || 'No description provided.';
        const venue = document.getElementById('event-location')?.value || 'Location TBD';
        const date = document.getElementById('event-date')?.value || '';
        const time = document.getElementById('event-time-display')?.value || document.getElementById('event-time')?.value || '';
        const age = document.getElementById('event-age')?.value || 'All Ages';

        const selectedServices = Array.from(document.querySelectorAll('.service-checkbox:checked')).map(el => el.value);
        const dresscodeOn = document.getElementById('dresscode-toggle')?.checked;
        const dresscode = document.getElementById('inp-dresscode')?.value || '';
        const collabInput = document.getElementById('inp-collabs')?.value || '';
        const promoOn = document.getElementById('promo-toggle')?.checked;
        const promoCode = document.getElementById('inp-promo')?.value || '';

        const capacityOn = document.getElementById('capacity-toggle')?.checked;
        const capacityTotal = document.getElementById('inp-capacity')?.value || '';
        const isTotalFlex = document.getElementById('inp-capacity-flex')?.checked;
        const ticketType = document.querySelector('input[name="ticket_type"]:checked')?.value || 'Free';

        document.getElementById('prev-title').textContent = title;
        document.getElementById('prev-category').textContent = category;
        document.getElementById('prev-venue').innerHTML = `<i data-lucide="map-pin" class="w-3.5 h-3.5 inline"></i> ${venue}`;
        document.getElementById('prev-bio').textContent = bio;
        document.getElementById('prev-age').textContent = age;
        document.getElementById('prev-ticket').textContent = ticketType + ' Event';

        if (date) {
            const dateObj = new Date(date);
            if (!Number.isNaN(dateObj.getTime())) {
                document.getElementById('prev-date').textContent = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            }
        }
        if (time) {
            document.getElementById('prev-time').textContent = time;
        }

        const highlightWrap = document.getElementById('prev-highlights-wrap');
        if (highlights) {
            highlightWrap.classList.remove('hidden');
            document.getElementById('prev-highlights').textContent = highlights;
        } else {
            highlightWrap.classList.add('hidden');
        }

        const tagsHtml = eventTags.map(tag => `<span class="bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500/30 px-2.5 py-1 rounded text-xs font-medium">#${tag}</span>`).join('');
        const servicesHtml = selectedServices.map(s => `<span class="bg-slate-800 text-gray-300 border border-white/10 px-2.5 py-1 rounded text-xs font-medium"><i data-lucide="check" class="w-3 h-3 inline mr-1"></i>${s}</span>`).join('');
        document.getElementById('prev-tags-services').innerHTML = tagsHtml + servicesHtml;

        if (dresscodeOn && dresscode) {
            document.getElementById('prev-dresscode-wrap').classList.remove('hidden');
            document.getElementById('prev-dresscode').textContent = dresscode;
        } else {
            document.getElementById('prev-dresscode-wrap').classList.add('hidden');
        }

        if (capacityOn && capacityTotal) {
            document.getElementById('prev-capacity-wrap').classList.remove('hidden');
            document.getElementById('prev-capacity').textContent = capacityTotal + (isTotalFlex ? ' (Flex)' : ' Seats');
        } else {
            document.getElementById('prev-capacity-wrap').classList.add('hidden');
        }

        if (collabInput) {
            document.getElementById('prev-collabs-wrap').classList.remove('hidden');
            document.getElementById('prev-collabs').textContent = collabInput;
        } else {
            document.getElementById('prev-collabs-wrap').classList.add('hidden');
        }

        if (promoOn && promoCode) {
            document.getElementById('prev-promo-wrap').classList.remove('hidden');
            document.getElementById('prev-promo').textContent = promoCode;
        } else {
            document.getElementById('prev-promo-wrap').classList.add('hidden');
        }

        const tiersWrap = document.getElementById('prev-tiers-wrap');
        if (ticketType === 'Paid' && ticketTiers.length > 0) {
            tiersWrap.classList.remove('hidden');
            document.getElementById('prev-tiers-list').innerHTML = ticketTiers.map(t => `
                <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-white/5">
                    <div>
                        <p class="text-sm font-bold text-white">${t.name || 'Unnamed Section'}
                            <span class="text-xs text-gray-400 font-normal">(${t.qty || 0} seats${t.flex ? ' - Flex' : ''})</span>
                        </p>
                        ${t.services ? `<p class="text-[10px] text-fuchsia-400 mt-1"><i data-lucide="sparkles" class="w-3 h-3 inline"></i> ${t.services}</p>` : ''}
                    </div>
                    <div class="text-cyan-400 font-bold text-sm bg-cyan-500/10 px-3 py-1.5 rounded-lg">Rs ${t.price || 0}</div>
                </div>
            `).join('');
        } else {
            tiersWrap.classList.add('hidden');
        }

        const imgArea = document.querySelector('#step-4 .bg-gradient-to-tr');
        if (imgArea) {
            if (vibeCover) {
                const url = URL.createObjectURL(vibeCover);
                imgArea.style.backgroundImage = `url(${url})`;
                imgArea.style.backgroundSize = 'cover';
                imgArea.style.backgroundPosition = 'center';
                imgArea.innerHTML = `<span id="prev-category" class="absolute top-3 right-3 bg-black/60 backdrop-blur text-xs px-3 py-1 rounded-full border border-white/10 text-cyan-300 shadow-lg">${category}</span>`;
            } else {
                imgArea.style.backgroundImage = 'none';
                imgArea.innerHTML = `<i data-lucide="image" class="w-12 h-12 text-white/20"></i><span id="prev-category" class="absolute top-3 right-3 bg-black/60 backdrop-blur text-xs px-3 py-1 rounded-full border border-white/10 text-cyan-300 shadow-lg">${category}</span>`;
            }
        }

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
