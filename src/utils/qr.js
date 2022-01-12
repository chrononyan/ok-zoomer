import jsQR from "jsqr";
import { PNG } from "pngjs";

export function decodePNG(buf) {
  const png = PNG.sync.read(buf);
  const res = jsQR(png.data, png.width, png.height);
  return Buffer.from(res.binaryData);
}
