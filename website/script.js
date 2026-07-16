/* ========================================
    LAKELINES CO. - MINIMAL JAVASCRIPT
    ======================================== */

// Simple form validation for contact form
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.querySelector('.contact-form');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            // Form will be handled by Formspree
            // This is optional validation/enhancement
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();
            
            if (!name || !email || !message) {
                e.preventDefault();
                alert('Please fill out all required fields.');
            }
        });
    }

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add active class to current navigation link
    const currentLocation = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
        let linkPath = link.getAttribute('href').split('/').pop();
        if (linkPath === currentLocation) {
            link.style.color = '#2c5aa0';
            link.style.fontWeight = '600';
        }
    });

    /* FAQ accordion behavior */
    const faqButtons = document.querySelectorAll('.faq-question');
    faqButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const item = this.closest('.faq-item');
            const isOpen = item.classList.contains('open');
            if (isOpen) {
                item.classList.remove('open');
                this.setAttribute('aria-expanded', 'false');
                this.querySelector('.faq-toggle').textContent = '+';
            } else {
                item.classList.add('open');
                this.setAttribute('aria-expanded', 'true');
                this.querySelector('.faq-toggle').textContent = '−';
            }
        });
    });
});

// Optional: Track when users click external CTA links for analytics
document.querySelectorAll('[href*="studio.lakelines.co"]').forEach(link => {
    link.addEventListener('click', function() {
        // This could be extended for analytics tracking
        console.log('User clicked CTA link to:', this.href);
    });
});
