import jsQR from "jsqr";
import { PNG } from "pngjs";

export function decodePNG(buf) {
  let png = PNG.sync.read(buf);
  let res = jsQR(png.data, png.width, png.height);
  return Buffer.from(res.binaryData);
}
