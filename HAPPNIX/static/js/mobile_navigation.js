const navContainer = document.getElementById('nav-container');
const centerLogo = document.getElementById('center-logo');
const allNavBtns = document.querySelectorAll('.nav-btn');

let isShrunk = false;
let idleTimer;
const IDLE_TIMEOUT_MS = 5000;

if (navContainer) {
    document.addEventListener('click', (event) => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;
        const action = actionEl.dataset.action;
        if (action === 'nav-click') {
            handleNavClick(actionEl, actionEl.dataset.tab, actionEl.dataset.color);
        } else if (action === 'nav-center') {
            handleCenterClick(actionEl);
        }
    });
}

    document.addEventListener('DOMContentLoaded', () => {
        startIdleTimer();
        setTimeout(() => {
            const homeBtn = document.querySelector('[data-target=\"home\"]');
            if (homeBtn) triggerNeonBorder(homeBtn, 'rgba(71, 232, 255, 0.9)', false);
        }, 500);
    });

    function triggerNeonBorder(buttonElement, color, isCenter = false) {
        if (!navContainer) return;
        if (isCenter) {
            navContainer.style.borderColor = 'rgba(98, 91, 214, 0.7)';
            navContainer.style.boxShadow = `
                0 10px 32px rgba(6, 10, 22, 0.7),
                0 0 20px rgba(98, 91, 214, 0.7),
                0 0 40px rgba(98, 91, 214, 0.7),
                inset 0 0 12px rgba(98, 91, 214, 0.7)
            `;
        } else {
            navContainer.style.borderColor = color;
            navContainer.style.boxShadow = `
                0 10px 32px rgba(6, 10, 22, 0.5),
                0 0 20px ${color},
                0 0 40px ${color},
                inset 0 0 12px ${color}
            `;
        }

        allNavBtns.forEach((btn) => {
            btn.classList.remove('active');
            btn.style.color = '';
            btn.style.filter = '';
        });

        if (buttonElement && buttonElement.classList.contains('nav-btn')) {
            buttonElement.classList.add('active');
            buttonElement.style.color = color;
            buttonElement.style.filter = `drop-shadow(0 4px 6px rgba(0,0,0,0.4)) drop-shadow(0 0 12px ${color})`;
        }

        if (isCenter && centerLogo) {
            centerLogo.classList.add('active');
            setTimeout(() => centerLogo.classList.remove('active'), 600);
        }
    }

    function handleNavClick(buttonElement, tabId, color) {
        if (isShrunk) {
            expandNav();
            return;
        }

        resetIdleTimer();
        triggerNeonBorder(buttonElement, color);
        if (typeof switchTab === 'function') {
            switchTab(tabId);
        }
    }

    function handleCenterClick(buttonElement) {
        if (isShrunk) {
            expandNav();
            return;
        }

        resetIdleTimer();
        triggerNeonBorder(buttonElement, null, true);
        allNavBtns.forEach(btn => btn.classList.remove('active'));
        if (typeof switchTab === 'function') {
            switchTab('add');
        }
    }

    function startIdleTimer() {
        idleTimer = setTimeout(() => {
            shrinkNav();
        }, IDLE_TIMEOUT_MS);
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        if (!isShrunk) {
            startIdleTimer();
        }
    }

    function shrinkNav() {
        if (!navContainer) return;
        if (isShrunk) return;
        isShrunk = true;
        navContainer.classList.add('shrunk');
    }

    function expandNav() {
        if (!navContainer) return;
        if (!isShrunk) return;
        isShrunk = false;
        navContainer.classList.remove('shrunk');
        resetIdleTimer();
    }

    ['touchstart', 'click', 'mousemove', 'scroll'].forEach((eventName) => {
        document.addEventListener(eventName, resetIdleTimer, { passive: true });
    });

    function triggerNotificationPop() {
        if (!navContainer) return;
        const oldBoxShadow = navContainer.style.boxShadow;
        const oldBorderColor = navContainer.style.borderColor;

        navContainer.classList.remove('heartbeat-active');
        void navContainer.offsetWidth;
        navContainer.classList.add('heartbeat-active');

        navContainer.style.borderColor = 'rgba(255, 255, 255, 1)';
        navContainer.style.boxShadow = `
            0 10px 32px rgba(6, 10, 22, 0.5),
            0 0 25px rgba(255, 255, 255, 0.9),
            0 0 45px rgba(255, 79, 216, 0.8),
            inset 0 0 15px rgba(255, 255, 255, 0.7)
        `;

        setTimeout(() => {
            navContainer.classList.remove('heartbeat-active');
            navContainer.style.boxShadow = oldBoxShadow;
            navContainer.style.borderColor = oldBorderColor;
        }, 1000);
    }
