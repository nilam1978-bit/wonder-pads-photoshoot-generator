const ENDPOINT = '/api/generate';

async function referenceBlob(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error('Could not read the reference photo.');
  const original = await response.blob();
  const bitmap = await createImageBitmap(original);
  const scale = Math.min(500 / bitmap.width, 500 / bitmap.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Could not prepare the reference photo.')),
    'image/jpeg', 0.92,
  ));
}

function promptFor(preset, variation) {
  const scene = preset.prompt.replaceAll('{PRODUCT}', 'the reusable cloth sanitary pad in reference image 0');
  return `${scene}\nCamera: ${preset.angle}. Lighting: ${preset.lighting}. Variation ${variation}: make a subtle composition change. Use image 0 as the exact product reference. Preserve its shape, colors, print, proportions, stitching, label and snap button. Change only the surrounding photoshoot scene. Do not redesign, duplicate, fold or crop the product. Avoid: ${preset.negative}.`;
}

function friendlyError(status, message) {
  if (status === 404) return 'Cloudflare generation is not connected yet. Upload the new function and redeploy.';
  if (/binding|AI is not defined|undefined/i.test(message || '')) return 'The Cloudflare AI binding is missing. Add a Workers AI binding named AI, then redeploy.';
  if (status === 429 || /limit|quota|neurons/i.test(message || '')) return 'Today’s free Cloudflare AI allowance has been used. Try again after the daily reset.';
  return message || `Cloudflare generation failed (${status}).`;
}

export async function generateOne({ preset, referenceSrc, variation = '1', instruction = '', signal }) {
  const form = new FormData();
  form.append('input_image_0', await referenceBlob(referenceSrc), 'reference.jpg');
  form.append('prompt', instruction
    ? `${instruction}\nUse image 0 as the exact product reference. Keep the product shape, colors, print, stitching, label and snap button unchanged.`
    : promptFor(preset, variation));
  form.append('width', '1024');
  form.append('height', '1024');
  form.append('seed', String(Math.floor(Math.random() * 2147483647)));
  const response = await fetch(ENDPOINT, { method: 'POST', body: form, signal });
  let payload = {};
  try { payload = await response.json(); } catch { /* retain fallback */ }
  if (!response.ok) throw new Error(friendlyError(response.status, payload.error));
  if (!payload.image) throw new Error('Cloudflare returned no image. Try another scene.');
  return `data:${payload.mimeType || 'image/jpeg'};base64,${payload.image}`;
}
