// Script to generate PWA icons from SVG
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <!-- Background circle -->
  <rect width="512" height="512" rx="100" fill="url(#bgGrad)"/>
  <!-- Brain emoji representation -->
  <text x="256" y="290" font-size="280" text-anchor="middle" fill="white">🧠</text>
  <!-- Sparkle effects -->
  <circle cx="400" cy="120" r="12" fill="white" opacity="0.9"/>
  <circle cx="430" cy="160" r="8" fill="white" opacity="0.7"/>
  <circle cx="100" cy="400" r="10" fill="white" opacity="0.8"/>
</svg>`;

// Better SVG that renders properly with sharp
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <!-- Rounded square background -->
  <rect width="512" height="512" rx="96" fill="url(#bgGrad)"/>
  <!-- Abstract brain/mind design -->
  <g transform="translate(256, 256)">
    <!-- Left hemisphere -->
    <path d="M-30,-100 C-100,-100 -140,-50 -140,20 C-140,70 -110,110 -60,130 C-40,138 -20,140 0,140" 
          fill="none" stroke="white" stroke-width="24" stroke-linecap="round"/>
    <!-- Right hemisphere -->
    <path d="M30,-100 C100,-100 140,-50 140,20 C140,70 110,110 60,130 C40,138 20,140 0,140" 
          fill="none" stroke="white" stroke-width="24" stroke-linecap="round"/>
    <!-- Center connection -->
    <path d="M0,-100 L0,140" fill="none" stroke="white" stroke-width="16" stroke-linecap="round" opacity="0.6"/>
    <!-- Neural dots -->
    <circle cx="-70" cy="-40" r="16" fill="white"/>
    <circle cx="70" cy="-40" r="16" fill="white"/>
    <circle cx="-50" cy="50" r="12" fill="white"/>
    <circle cx="50" cy="50" r="12" fill="white"/>
    <circle cx="0" cy="-60" r="14" fill="white"/>
  </g>
  <!-- Sparkle effects -->
  <circle cx="420" cy="100" r="14" fill="white" opacity="0.9"/>
  <circle cx="450" cy="150" r="9" fill="white" opacity="0.7"/>
  <circle cx="90" cy="420" r="11" fill="white" opacity="0.8"/>
</svg>`;

async function generateIcons() {
  const publicDir = path.join(__dirname, 'public');
  
  // Ensure public directory exists
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Generate 192x192 icon
  await sharp(Buffer.from(svgIcon))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'icon-192.png'));
  console.log('✓ Generated icon-192.png');

  // Generate 512x512 icon
  await sharp(Buffer.from(svgIcon))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'icon-512.png'));
  console.log('✓ Generated icon-512.png');

  // Also update the SVG icon
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon);
  console.log('✓ Updated icon.svg');

  console.log('\n✅ All PWA icons generated successfully!');
}

generateIcons().catch(console.error);
