const analogClockState = {
    mode: 'hour',
    focus: 'hour',
    period: 'PM',
    hour: 10,
    minute: 0,
    second: 0,
    liveMode: false,
    targetInputId: 'event-time-display'
};
const analogHourDialOrder = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
let analogDialDragging = false;
let analogLastRenderedPeriod = '';
let analogLiveTickerId = null;
const eventCalendarState = {
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    selectedDate: '',
    targetInputId: 'event-date-display'
};

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

    if (/^\\d+$/.test(raw)) {
        const minutesOnly = Number(raw);
        return Number.isFinite(minutesOnly) && minutesOnly > 0 ? minutesOnly : 0;
    }

    const compact = raw.replace(/\\s+/g, '');
    const bothMatch = /^(\\d+)h(?:ours?)?(\\d+)m(?:in(?:ute)?s?)?$/.exec(compact);
    if (bothMatch) {
        const h = Number(bothMatch[1]);
        const m = Number(bothMatch[2]);
        const total = (h * 60) + m;
        return Number.isFinite(total) && total > 0 ? total : 0;
    }

    const hourMatch = /^(\\d+)h(?:ours?)?$/.exec(compact);
    if (hourMatch) {
        const h = Number(hourMatch[1]);
        const total = h * 60;
        return Number.isFinite(total) && total > 0 ? total : 0;
    }

    const minMatch = /^(\\d+)m(?:in(?:ute)?s?)?$/.exec(compact);
    if (minMatch) {
        const m = Number(minMatch[1]);
        return Number.isFinite(m) && m > 0 ? m : 0;
    }

    const clockMatch = /^(\\d{1,2}):(\\d{1,2})$/.exec(raw);
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

document.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;

        switch (action) {
            case 'close-analog-time':
                closeAnalogTimeModal();
                break;
            case 'set-analog-mode':
                setAnalogMode(actionEl.dataset.mode || 'hour');
                break;
            case 'toggle-analog-period':
                toggleAnalogPeriod();
                break;
            case 'save-analog-time':
                saveAnalogTimeSelection();
                break;
            case 'clear-analog-time':
                clearAnalogTimeSelection();
                break;
            case 'close-event-date':
                closeEventDateModal();
                break;
            case 'change-event-month':
                changeEventCalendarMonth(Number(actionEl.dataset.step || 0));
                break;
            case 'toggle-month-year':
                toggleEventMonthYearPicker();
                break;
            case 'change-event-year':
                changeEventCalendarYear(Number(actionEl.dataset.step || 0));
                break;
            case 'save-event-date':
                saveEventDateSelection();
                break;
            case 'clear-event-date':
                clearEventDateSelection();
                break;
            default:
                break;
        }
    });
    const analogTimeModal = document.getElementById('analog-time-modal');
    if (analogTimeModal) {
        analogTimeModal.addEventListener('click', (event) => {
            if (event.target === analogTimeModal) {
                closeAnalogTimeModal();
            }
        });
    }
    const eventDateModal = document.getElementById('event-date-modal');
    if (eventDateModal) {
        eventDateModal.addEventListener('click', (event) => {
            if (event.target === eventDateModal) {
                closeEventDateModal();
            }
        });
    }
    document.addEventListener('click', (event) => {
        const picker = document.getElementById('event-month-year-picker');
        if (!picker || picker.classList.contains('hidden')) return;
        const labelBtn = document.getElementById('event-calendar-month-label');
        const target = event.target;
        if (target instanceof Element && (target.closest('#event-month-year-picker') || target.closest('#event-calendar-month-label'))) {
            return;
        }
        closeEventMonthYearPicker();
    });
    initEventDateTimePicker();
    initAnalogClockInteractions();
    initEventCalendarKeyboardNavigation();
    const durationDisplay = document.getElementById('event-duration-display');
    if (durationDisplay) {
        durationDisplay.addEventListener('input', syncDurationHiddenFromDisplay);
        durationDisplay.addEventListener('blur', () => {
            if (durationDisplay.readOnly) return;
            const parsedMinutes = parseDurationDisplayToMinutes(durationDisplay.value);
            if (parsedMinutes > 0) {
                if (parsedMinutes < 30) {
                    const durationHidden = document.getElementById('event-duration-minutes');
                    if (durationHidden) durationHidden.value = '';
                    setLocationStatus('Duration must be at least 30 minutes.', true);
                    return;
                }
                if (parsedMinutes > 24 * 60) {
                    const durationHidden = document.getElementById('event-duration-minutes');
                    if (durationHidden) durationHidden.value = '';
                    setLocationStatus('Duration cannot be more than 24 hours.', true);
                    return;
                }
                durationDisplay.value = formatDurationMinutes(parsedMinutes);
                setLocationStatus('');
            }
            syncDurationHiddenFromDisplay();
        });
    }
});
