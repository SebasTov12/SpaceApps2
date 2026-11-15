// Run manually with `node scripts/generate-brand-icon.mjs` from frontend/.
// Cinzel 500 is also used by the SAROS title (SIL Open Font License).
// https://fonts.google.com/specimen/Cinzel
import { writeFile } from "node:fs/promises";
import { ImageResponse } from "next/og.js";
import { createElement } from "react";
import sharp from "sharp";

const cssResponse = await fetch("https://fonts.googleapis.com/css2?family=Cinzel:wght@500");
if (!cssResponse.ok) throw new Error(`Font CSS: ${cssResponse.status}`);
const css = await cssResponse.text();
const fontUrl = css.match(/src: url\(([^)]+)\) format\('(truetype|opentype)'\)/)?.[1];
if (!fontUrl) throw new Error("Expected the Cinzel TrueType font.");
const fontResponse = await fetch(fontUrl);
if (!fontResponse.ok) throw new Error(`Font: ${fontResponse.status}`);
const glyph = new ImageResponse(
  createElement("div", {
    style: { width: 512, height: 512, display: "flex", justifyContent: "center", alignItems: "center", fontFamily: "Cinzel", fontWeight: 500, fontSize: 580, color: "white", lineHeight: 1 },
  }, "S"),
  { width: 512, height: 512, fonts: [{ name: "Cinzel", data: await fontResponse.arrayBuffer(), weight: 500, style: "normal" }] },
);
// Trim the font's line metrics, preserving the exact glyph's proportions.
const mask = await sharp(Buffer.from(await glyph.arrayBuffer())).trim().resize(448, 448, { fit: "inside" }).toBuffer();
const maskMeta = await sharp(mask).metadata();
const alpha = await sharp({ create: { width: 512, height: 512, channels: 4, background: "transparent" } })
  .composite([{ input: mask, left: Math.round((512 - maskMeta.width) / 2), top: Math.round((512 - maskMeta.height) / 2) }]).png().toBuffer();
// Same stops as .ticker-label in saros.css; no frame or background.
const gradient = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2=".466"><stop stop-color="#00d4ff"/><stop offset="24%" stop-color="#1e40af"/><stop offset="62%" stop-color="#681993"/><stop offset="84%" stop-color="#86198f"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs><path fill="url(#g)" d="M0 0h512v512H0z"/></svg>`);
const png = await sharp(gradient).composite([{ input: alpha, blend: "dest-in" }]).png().toBuffer();
await writeFile(new URL("../src/app/icon.png", import.meta.url), png);

// ICO with PNG frames keeps browsers requesting /favicon.ico on the same brand.
const sizes = [16, 32, 48, 64, 256];
const frames = await Promise.all(sizes.map(size => sharp(png).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
frames.forEach((frame, index) => {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = sizes[index] % 256;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frame.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
});
await writeFile(new URL("../src/app/favicon.ico", import.meta.url), Buffer.concat([directory, ...frames]));
console.log("Created SAROS icon.png and favicon.ico using Cinzel 500 and the news gradient.");
