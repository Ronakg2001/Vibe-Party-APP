document.addEventListener("DOMContentLoaded", () => {
    const statusText = document.getElementById("splash-status-text");
    const hyperDrive = document.getElementById("hyper-drive");

    // Phase 1: Initial load. The speaker is pumping, text says "Tuning the party vibe..."

    // Phase 2: Change text after 1.5 seconds to build anticipation
    setTimeout(() => {
        if (statusText) {
            statusText.style.color = "#34d399";
            statusText.textContent = "Vibe Check Passed.";
        }
    }, 1500);

    // Phase 3: The "Drop". Flash the screen white and redirect
    setTimeout(() => {
        if (hyperDrive) {
            hyperDrive.classList.add("active");
        }

        // Wait just a split second for the flash to cover the screen, then redirect
        setTimeout(() => {
            window.location.href = "/signin/";
        }, 200);
    }, 2800);
});
