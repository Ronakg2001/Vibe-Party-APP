const container = document.getElementById('container');
const wrapper = document.getElementById('wrapper');
const logoImg = document.querySelector('.main-logo');

if (logoImg) {
    logoImg.addEventListener('error', () => {
        const fallback = logoImg.dataset.fallbackSrc;
        if (fallback && logoImg.src !== fallback) {
            logoImg.src = fallback;
        }
    });
}

        // 3D Tilt Interaction (Subtle enough to not break the flat background illusion)
        container.addEventListener('mousemove', (e) => {
            const x = e.clientX;
            const y = e.clientY;
            
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            
            const deltaX = (x - centerX) / centerX;
            const deltaY = (y - centerY) / centerY;
            
            // Softer rotation for the light theme
            const rotateX = deltaY * -6; 
            const rotateY = deltaX * 6;
            
            wrapper.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        });

        // Reset gently on mouse leave
        container.addEventListener('mouseleave', () => {
            wrapper.style.transform = `rotateX(0deg) rotateY(0deg) scale(1)`;
        });
