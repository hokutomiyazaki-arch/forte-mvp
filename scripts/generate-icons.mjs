import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = resolve(__dirname, '../public/images/icon.png');

const sizes = [
  { name: 'icon-16.png', size: 16 },
  { name: 'icon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
];

for (const { name, size } of sizes) {
  await sharp(source)
    .resize(size, size)
    .png()
    .toFile(resolve(__dirname, '../public', name));
  console.log(`Generated: public/${name}`);
}

// favicon.ico = 32x32 PNG renamed (modern browsers support this)
await sharp(source)
  .resize(32, 32)
  .png()
  .toFile(resolve(__dirname, '../public', 'favicon.ico'));
console.log('Generated: public/favicon.ico');
