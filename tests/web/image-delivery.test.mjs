import { test } from "node:test";
import assert from "node:assert/strict";
import { imageHtml, imageCss } from "../../scripts/web/image-delivery.mjs";
const assets = {
  "/art/mascot.png": { src: "/art/optimized/mascot-hash.webp" },
};
test("shell image optimization preserves accessibility, dimensions and game URLs", () => {
  const html =
    '<img src="/art/mascot.png" width="140" alt="mascot"><img src="/games/id/hash/sprite.png"><link rel="icon" href="/art/mascot.png">';
  assert.equal(
    imageHtml(html, assets, { 64: "/art/optimized/icon.png" }),
    '<img src="/art/optimized/mascot-hash.webp" width="140" alt="mascot"><img src="/games/id/hash/sprite.png"><link rel="icon" href="/art/optimized/icon.png">',
  );
});
test("CSS artwork keeps crop, sizing and sprite positions with compressed URLs", () => {
  assert.equal(
    imageCss(
      'background:url("art/mascot.png") left center / 200% 100% no-repeat',
      assets,
    ),
    'background:url("/art/optimized/mascot-hash.webp") left center / 200% 100% no-repeat',
  );
  assert.equal(
    imageCss('background:url("/games/id/hash/sprite.png")', assets),
    'background:url("/games/id/hash/sprite.png")',
  );
});
