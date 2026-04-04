(function () {
  const DEFAULT_FRONTEND_CONFIG = {
    messaging: {
      statusDot: {
        positionClass: 'absolute bottom-3 right-3',
        sizeClass: 'h-2.5 w-2.5',
        transitionClass: 'transition-all duration-500 ease-out',
        states: {
          sending: {
            label: 'Sending',
            className: 'bg-white/80 ring-1 ring-white/35 animate-pulse shadow-none scale-95',
          },
          failed: {
            label: 'Failed to send',
            className: 'bg-rose-500 animate-pulse shadow-[0_0_10px_rgba(244,63,94,0.95),0_0_20px_rgba(244,63,94,0.45)]',
          },
          sent: {
            label: 'Sent',
            className: 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.95),0_0_20px_rgba(255,255,255,0.45)]',
          },
          delivered: {
            label: 'Delivered',
            className: 'bg-amber-300 animate-pulse shadow-[0_0_10px_rgba(252,211,77,0.95),0_0_20px_rgba(252,211,77,0.45)]',
          },
          read: {
            label: 'Read',
            className: 'bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.95),0_0_20px_rgba(74,222,128,0.45)]',
          },
        },
      },
    },
    events: {
      statusTickerIntervalMs: 1000,
      status: {
        detailToneByKey: {
          cancelled: 'text-red-200/80',
          ended: 'text-rose-200/80',
          live: 'text-emerald-200/80',
          upcoming: 'text-white/80',
        },
        states: {
          cancelled: {
            label: 'Cancelled',
            shellClass: 'border-red-500/30 bg-red-950/45 text-red-200',
            dotClass: 'bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.95),0_0_22px_rgba(239,68,68,0.5)]',
            detail: 'This event was cancelled.',
          },
          ended: {
            label: 'Ended',
            shellClass: 'border-rose-800/45 bg-rose-950/40 text-rose-200',
            dotClass: 'bg-rose-800 shadow-[0_0_10px_rgba(136,19,55,0.95),0_0_20px_rgba(190,24,93,0.35)]',
            detail: 'This event has ended.',
          },
          live: {
            label: 'Live now',
            shellClass: 'border-emerald-700/45 bg-emerald-950/55 text-emerald-200',
            dotClass: 'bg-emerald-700 animate-pulse shadow-[0_0_10px_rgba(4,120,87,0.95),0_0_22px_rgba(16,185,129,0.5)]',
            detail: 'Happening now',
          },
          upcoming: {
            label: 'Upcoming',
            shellClass: 'border-white/20 bg-white/10 text-white',
            dotClass: 'bg-white animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.95),0_0_22px_rgba(255,255,255,0.45)]',
          },
        },
      },
      countdown: {
        fallbackDateText: 'Date TBD',
        todayPrefix: 'Today',
        tomorrowPrefix: 'Tomorrow',
        separator: ' | ',
        thisWeekendLabel: 'This weekend',
        thisWeekLabel: 'This week',
        thisMonthLabel: 'This month',
        nextMonthLabel: 'Next month',
        nextYearLabel: 'Next year',
        prefixIn: 'In',
        conjunction: 'and',
        unitLabels: {
          year: 'year',
          years: 'years',
          month: 'month',
          months: 'months',
          day: 'day',
          days: 'days',
        },
        daysPattern: 'In {count} days',
        weeksPattern: 'In {count} week{suffix}',
        monthsDaysPattern: 'In {months} month{monthSuffix} {days} days',
        yearsMonthsDaysPattern: 'In {years} year{yearSuffix}, {months} month{monthSuffix}, {days} days',
      },
      liveCard: {
        badgeLabel: 'Live now',
      },
      liveProgress: {
        endingSoonThreshold: 0.7,
        endTimerThreshold: 0.85,
        endingSoonText: 'Event will end soon',
        endsSameDayPattern: 'Ends in {time}',
        endsMultiDayPattern: 'Ends in {days} day{daySuffix} {time}',
      },
    },
  };

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== 'object' || Array.isArray(extra)) {
      return base;
    }
    const output = Array.isArray(base) ? base.slice() : { ...(base || {}) };
    Object.keys(extra).forEach((key) => {
      const baseValue = output[key];
      const extraValue = extra[key];
      if (
        baseValue &&
        typeof baseValue === 'object' &&
        !Array.isArray(baseValue) &&
        extraValue &&
        typeof extraValue === 'object' &&
        !Array.isArray(extraValue)
      ) {
        output[key] = deepMerge(baseValue, extraValue);
        return;
      }
      output[key] = extraValue;
    });
    return output;
  }

  function readBootManifest() {
    const bootEl = document.getElementById('home-page-boot-config');
    if (!bootEl) return {};
    try {
      const boot = JSON.parse(bootEl.textContent || '{}');
      return boot && typeof boot === 'object' ? boot.manifestData || {} : {};
    } catch (_error) {
      return {};
    }
  }

  function getByPath(source, path, fallbackValue) {
    const keys = Array.isArray(path) ? path : String(path || '').split('.').filter(Boolean);
    let current = source;
    for (const key of keys) {
      if (!current || typeof current !== 'object' || !(key in current)) {
        return fallbackValue;
      }
      current = current[key];
    }
    return current === undefined ? fallbackValue : current;
  }

  const manifestData = readBootManifest();
  const frontendManifest = manifestData && typeof manifestData === 'object' ? manifestData.frontend || {} : {};
  const resolvedConfig = deepMerge(DEFAULT_FRONTEND_CONFIG, frontendManifest);

  window.HappnixFrontendConfig = {
    defaults: DEFAULT_FRONTEND_CONFIG,
    manifest: frontendManifest,
    resolved: resolvedConfig,
    get(path, fallbackValue) {
      return getByPath(resolvedConfig, path, fallbackValue);
    },
  };
})();
