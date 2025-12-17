const sharp = require('sharp');
const path = require('path');

const sourceImage = path.join(__dirname, '..', 'clearmindlogo.jpg');
const outputDir = path.join(__dirname, '..', 'public');

const sizes = [
  { size: 16, name: 'icon-16.png' },
  { size: 32, name: 'icon-32.png' },
  { size: 144, name: 'icon-144.png' },
  { size: 180, name: 'icon-180.png' },
  { size: 192, name: 'icon-192.png' },
  { size: 512, name: 'icon-512.png' },
  { size: 192, name: 'icon-maskable-192.png' },
  { size: 512, name: 'icon-maskable-512.png' },
  { size: 32, name: 'favicon.png' },
  { size: 180, name: 'apple-touch-icon.png' },
];

async function generateIcons() {
  console.log('Generating PWA icons from:', sourceImage);
  
  try {
    for (const { size, name } of sizes) {
      await sharp(sourceImage)
        .resize(size, size, { fit: 'cover' })
        .png()
        .toFile(path.join(outputDir, name));
      console.log(`✓ Generated ${name} (${size}x${size})`);
    }

    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
