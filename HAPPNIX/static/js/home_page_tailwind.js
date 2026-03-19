tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        slate: { 850: '#151e2e', 900: '#0f172a' },
                    },
                    animation: {
                        'spin-slow': 'spin 3s linear infinite',
                        'fade-in': 'fadeIn 0.2s ease-out',
                      'slide-up': 'slideUp 0.3s ease-out',
                        'floatOrb': 'floatOrb 14s ease-in-out infinite alternate',
                        'floatOrbReverse': 'floatOrb 18s ease-in-out infinite alternate-reverse',
                        'floatOrbSlow': 'floatOrbSlow 22s ease-in-out infinite alternate'
                    },
                    keyframes: {
                        fadeIn: {
                            '0%': { opacity: '0' },
                            '100%': { opacity: '1' },
                        },
                        slideUp: {
                            '0%': { transform: 'translateY(20px)', opacity: '0' },
                            '100%': { transform: 'translateY(0)', opacity: '1' },
                        },
                        floatOrb: {
                            '0%': { transform: 'translateY(0) translateX(0) scale(1)' },
                            '33%': { transform: 'translateY(-30px) translateX(20px) scale(1.05)' },
                            '66%': { transform: 'translateY(15px) translateX(-20px) scale(0.95)' },
                            '100%': { transform: 'translateY(0) translateX(0) scale(1)' },
                        },
                        floatOrbSlow: {
                            '0%': { transform: 'translate(-50%, 0) scale(1)' },
                            '50%': { transform: 'translate(-45%, -40px) scale(1.1)' },
                            '100%': { transform: 'translate(-50%, 0) scale(1)' },
                        }
                    }
                }
            }
        }

