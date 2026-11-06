/**
 * Lossless PCD2 browser decoder. The caller first removes the gzip container.
 *
 * This is a transport codec, not another point-cloud reconstruction method:
 * prediction corrections restore every original float32 XYZ bit and RGB byte.
 * Pixel order is the original row-major image lattice sampled by `stride`.
 */
export function decodePcd2(binary, expected = {}) {
  if (!(binary instanceof ArrayBuffer)) {
    throw new TypeError('PCD2 input must be a decompressed ArrayBuffer');
  }
  if (binary.byteLength < 96) throw new Error('Truncated PCD2 header');
  const header = new DataView(binary);
  const word = index => header.getUint32(index * 4, true);
  if (word(0) !== 0x32444350 || word(1) !== 1 || word(10) !== 7) {
    throw new Error('Unsupported PCD2 format');
  }
  if ([8, 9, 12, 13, 14, 15].some(index => word(index) !== 0)) {
    throw new Error('Unsupported PCD2 reserved fields');
  }
  const count = word(2), source = word(3), stride = word(4);
  const width = word(5), height = word(6), maskBytes = word(7);
  if (!width || !height || ![1, 2, 4].includes(stride)) {
    throw new Error('Invalid PCD2 image dimensions or sampling stride');
  }
  const gridWidth = Math.ceil(width / stride), gridHeight = Math.ceil(height / stride);
  const gridCount = gridWidth * gridHeight;
  if (!Number.isSafeInteger(gridCount) || count > gridCount ||
      maskBytes !== Math.ceil(gridCount / 8)) {
    throw new Error('Invalid PCD2 pixel mask dimensions');
  }
  const payloadBytes = maskBytes + count * 15;
  if (word(11) !== payloadBytes || binary.byteLength !== 96 + payloadBytes) {
    throw new Error('PCD2 payload length differs from its header');
  }
  const expectedSource = expected.source_index ?? expected.source;
  for (const [name, actual, declared] of [
    ['count', count, expected.count], ['source', source, expectedSource],
    ['stride', stride, expected.stride], ['width', width, expected.width],
    ['height', height, expected.height],
  ]) {
    if (declared !== undefined && actual !== declared) {
      throw new Error(`PCD2 ${name} differs from the manifest`);
    }
  }
  const fx = header.getFloat64(64, true), fy = header.getFloat64(72, true);
  const cx = header.getFloat64(80, true), cy = header.getFloat64(88, true);
  if (![fx, fy, cx, cy].every(Number.isFinite) || fx <= 0 || fy <= 0) {
    throw new Error('Invalid PCD2 camera intrinsics');
  }
  const bytes = new Uint8Array(binary);
  const maskStart = 96, zStart = maskStart + maskBytes;
  const rgbStart = zStart + count * 4, xStart = rgbStart + count * 3;
  const yStart = xStart + count * 4;
  // Padding does not represent an image pixel and must never carry a point.
  const remaining = gridCount % 8;
  if (remaining && (bytes[maskStart + maskBytes - 1] >>> remaining)) {
    throw new Error('PCD2 mask has nonzero padding bits');
  }
  let maskCount = 0;
  for (let i = 0; i < maskBytes; i++) {
    let value = bytes[maskStart + i];
    while (value) { value &= value - 1; maskCount++; }
  }
  if (maskCount !== count) throw new Error('PCD2 mask point count differs');

  const positions = new Float32Array(count * 3);
  const positionBits = new Uint32Array(positions.buffer);
  const colors = new Uint8Array(count * 3);
  const scratch = new ArrayBuffer(4);
  const scratchFloat = new Float32Array(scratch), scratchBits = new Uint32Array(scratch);
  const planeWord = (start, i) => (
    bytes[start + i] | (bytes[start + count + i] << 8) |
    (bytes[start + count * 2 + i] << 16) | (bytes[start + count * 3 + i] << 24)
  ) >>> 0;
  let point = 0, previousZ = 0, red = 0, green = 0, blue = 0;
  for (let pixel = 0; pixel < gridCount; pixel++) {
    if (!(bytes[maskStart + (pixel >>> 3)] & (1 << (pixel & 7)))) continue;
    previousZ = (previousZ ^ planeWord(zStart, point)) >>> 0;
    scratchBits[0] = previousZ;
    const z = scratchFloat[0];
    const u = (pixel % gridWidth) * stride;
    const v = Math.floor(pixel / gridWidth) * stride;
    const output = point * 3;
    // Keep this operation order identical to the encoder's float64 prediction.
    scratchFloat[0] = Math.fround((u - cx) * z / fx);
    positionBits[output] = (scratchBits[0] ^ planeWord(xStart, point)) >>> 0;
    scratchFloat[0] = Math.fround((v - cy) * z / fy);
    positionBits[output + 1] = (scratchBits[0] ^ planeWord(yStart, point)) >>> 0;
    positionBits[output + 2] = previousZ;
    red = (red + bytes[rgbStart + point]) & 255;
    green = (green + bytes[rgbStart + count + point]) & 255;
    blue = (blue + bytes[rgbStart + count * 2 + point]) & 255;
    colors[output] = red; colors[output + 1] = green; colors[output + 2] = blue;
    point++;
  }
  return { count, positions, colors, source, stride, width, height };
}
