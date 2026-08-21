// worker/products.js
// Server-side mirror of assets/js/products.js — id -> { name, price }.
// The charge handler must never trust a client-supplied dollar amount (the
// browser cart is plain localStorage, editable via devtools); it recomputes
// the real total itself from this table before ever calling Clover. Keep
// this in sync whenever a product or price changes in the browser file.
export const PRODUCT_PRICES = {
  'love-hurts-sweatpants': { name: 'Love Hurts Flame Sweatpants', price: 72 },
  'flame-zip-hoodie': { name: 'Flame Sleeve Zip Hoodie', price: 92 },
  'love-hurts-hoodie': { name: 'Love Hurts Hoodie', price: 92 },
  'chaos-heart-tee': { name: 'Chaos Heart Tee', price: 58 },
  'lightning-monogram-tee': { name: 'Lightning Monogram Tee', price: 54 },
  'cream-heart-tee': { name: 'Cream Heart Tee', price: 50 },
  'gray-wordmark-heart-tee': { name: 'Gray Wordmark Heart Tee', price: 48 },
  'wordmark-only-tee': { name: 'Wordmark Tee', price: 46 },
  'stitched-heart-tee': { name: 'Stitched Heart Tee', price: 58 },
  'ember-monogram-tee': { name: 'Ember Monogram Tee', price: 58 },
  'clean-wordmark-hoodie': { name: 'Clean Wordmark Hoodie', price: 88 }
};
