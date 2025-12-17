const sharp = require('sharp');
const path = require('path');

const sourceImage = path.join(__dirname, '..', 'clearmindlogo.jpg');
const outputDir = path.join(__dirname, '..', 'public');

async function generateIcons() {
  console.log('Generating PWA icons from:', sourceImage);
  
  try {
    // Generate 192x192 icon
    await sharp(sourceImage)
      .resize(192, 192, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'icon-192.png'));
    console.log('✓ Generated icon-192.png');

    // Generate 512x512 icon
    await sharp(sourceImage)
      .resize(512, 512, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'icon-512.png'));
    console.log('✓ Generated icon-512.png');

    // Generate favicon (32x32)
    await sharp(sourceImage)
      .resize(32, 32, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));
    console.log('✓ Generated favicon.png');

    // Generate apple-touch-icon (180x180)
    await sharp(sourceImage)
      .resize(180, 180, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));
    console.log('✓ Generated apple-touch-icon.png');

    console.log('\nAll icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
