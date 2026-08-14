const KEY_STORAGE = 'wp_gemini_key';
const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export const getKey = () => localStorage.getItem(KEY_STORAGE) || '';
export const setKey = (key) => key?.trim() ? localStorage.setItem(KEY_STORAGE, key.trim()) : localStorage.removeItem(KEY_STORAGE);

async function toInlineData(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not read the reference image (${response.status}).`);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mimeType: blob.type || 'image/jpeg', data: btoa(binary) };
}

function promptFor(preset, variation) {
  const scene = preset.prompt.replaceAll('{PRODUCT}', 'the reusable cloth sanitary pad shown in the reference image');
  return `${scene}\nCamera: ${preset.angle}. Lighting: ${preset.lighting}. Aspect ratio: ${preset.aspect}. Variation ${variation}: make a subtle composition change. Avoid: ${preset.negative}.\nCRITICAL: Preserve the exact product shape, colors, print, proportions, stitching and snap button. Never redesign the product.`;
}

export async function generateOne({ preset, referenceSrc, variation = '1', instruction = '', signal }) {
  const key = getKey();
  if (!key) throw new Error('Add your Gemini API key first.');
  const inlineData = await toInlineData(referenceSrc);
  const text = instruction ? `${instruction}\nKeep the referenced product and everything not mentioned unchanged.` : promptFor(preset, variation);
  const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(key)}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, signal,
    body:JSON.stringify({ contents:[{role:'user',parts:[{text},{inlineData}]}], generationConfig:{responseModalities:['IMAGE'],temperature:.85} }),
  });
  if (!response.ok) {
    let message = `Generation failed (${response.status}).`;
    try { message = (await response.json())?.error?.message || message; } catch { /* retain fallback */ }
    throw new Error(message);
  }
  const json = await response.json();
  const part = json?.candidates?.[0]?.content?.parts?.find((item) => item.inlineData?.data);
  if (!part) throw new Error('Gemini returned no image. Try a different photo or scene.');
  return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
}
