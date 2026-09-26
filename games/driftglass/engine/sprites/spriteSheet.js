// Lightweight sprite sheet reader (no createImageBitmap requirement)
export function makeSpriteSheet(image, frameWidth, frameHeight) {
  const cols = Math.max(1, Math.floor(image.width / frameWidth));
  const rows = Math.max(1, Math.floor(image.height / frameHeight));
  return {
    image, fw: frameWidth, fh: frameHeight, cols, rows,
    // returns {sx, sy, sw, sh} for a frame index
    frame(index) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      return { sx: col * frameWidth, sy: row * frameHeight, sw: frameWidth, sh: frameHeight };
    }
  };
}
