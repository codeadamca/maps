# Lakelines Co. - Marketing Website

A premium, modern marketing website for Lakelines Co. built with vanilla HTML, CSS, and minimal JavaScript.

## Overview

This is a marketing funnel website designed to guide users to the studio applications:
- **Lakes Studio**: https://studio.lakelines.co/lake
- **Maps Studio**: /map

The site promotes two product lines:
1. **Custom Maps** - Detailed geographic framed wall art
2. **Lake Silhouettes** - Minimal outline designs for mugs, prints, and decor

## Project Structure

```
/website
├── index.html          # Home page
├── gallery.html        # Gallery page with full image grid
├── about.html          # About page with brand story
├── contact.html        # Contact page with form
├── styles.css          # Global styles and responsive design
├── script.js           # Minimal JavaScript for interactivity
└── images/             # Image assets folder
```

## Features

- **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- **Premium Aesthetic**: Light, airy, cottage-inspired design
- **Navigation Bar**: Sticky navigation with links to all pages
- **Floating CTA Bar**: Fixed side panel on desktop with persistent calls-to-action
- **Multiple CTAs**: Strategic placement of buttons linking to studio applications
- **Contact Form**: Simple contact form (configured for Formspree)
- **No External Dependencies**: Pure vanilla HTML, CSS, and JavaScript
- **Fast & Lightweight**: Optimized for performance

## Pages

### Home (index.html)
- Hero section with headline and CTAs
- Two product paths (Maps & Silhouettes)
- How it works section (3 steps)
- Gallery preview (6 featured items)
- Final CTA section

### Gallery (gallery.html)
- Full responsive grid of lifestyle mockups
- 12 gallery items showcasing products
- Ready-to-customize with real images

### About (about.html)
- Brand story and mission
- Focuses on lakes, memories, cottages, and personal places
- Call-to-action buttons

### Contact (contact.html)
- Contact form with fields for name, email, subject, message
- Email link for direct contact
- Responsive form design

## Styling

The design uses:
- **Color Palette**:
  - Primary Blue: `#2c5aa0` - CTAs and accents
  - Warm Neutral: `#e8d4c4` - Secondary buttons
  - Light Background: `#fafaf8` - Soft, warm white
  - Dark Text: `#1a1a1a` to `#4a4a4a` - Readable hierarchy

- **Typography**:
  - System fonts for excellent cross-platform rendering
  - Light font weights (300-400) for premium feel
  - Generous spacing and line heights

- **Layout**:
  - CSS Grid for responsive multi-column layouts
  - Max-width container (1200px) for optimal readability
  - Mobile-first responsive design

## Customization

### Contact Form
The contact form is set up for [Formspree](https://formspree.io/). To enable it:
1. Go to https://formspree.io
2. Create an account and form
3. Replace `YOUR_FORM_ID` in `contact.html` with your Formspree form ID

Example:
```html
<form class="contact-form" action="https://formspree.io/f/xyzabc123" method="POST">
```

### Images
All images use placeholder URLs. To replace with real images:
1. Add images to the `/images` folder
2. Update image `src` attributes throughout the HTML files
3. Update `alt` text to be descriptive

### Colors
To change the color scheme, update the CSS variables in `styles.css`:
- `#2c5aa0` → Primary blue
- `#e8d4c4` → Warm accent
- `#fafaf8` → Light background

### Text Content
Edit text in each HTML file directly. All content is straightforward to modify.

## Browser Support

Works on all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- iOS Safari
- Chrome Mobile

## Performance

- Minimal CSS (no frameworks)
- Minimal JavaScript (vanilla)
- Optimized for fast loading
- All placeholder images are lightweight

## Deployment

### Option 1: Static Hosting (Recommended)
Deploy to any static hosting service:
- **Vercel** - https://vercel.com (recommended)
- **Netlify** - https://netlify.com
- **GitHub Pages** - https://pages.github.com
- **AWS S3 + CloudFront**
- **Cloudflare Pages**

### Option 2: Traditional Web Hosting
Upload all files via FTP to your web host. No server-side processing required.

### Option 3: Local Testing
Open `index.html` directly in your browser, or run:
```bash
python -m http.server 8000
# or
npx http-server
```

Then visit: `http://localhost:8000`

## Notes

- This is a **marketing funnel site**, not an ecommerce store
- No pricing, product catalog, or checkout functionality
- No user accounts or authentication needed
- All CTAs direct users to the studio applications
- The site is intentionally minimal and focused

## License

Created for Lakelines Co. © 2024

## Support

For questions about this website template, refer to the HTML/CSS/JavaScript files which are well-commented and self-explanatory.
