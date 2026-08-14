const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' },
});

export async function onRequestPost({ request, env }) {
  if (!env.AI) return json({ error: 'Workers AI binding AI is not configured.' }, 503);
  try {
    const incoming = await request.formData();
    const image = incoming.get('input_image_0');
    const prompt = String(incoming.get('prompt') || '').trim();
    if (!prompt || !(image instanceof File)) return json({ error: 'A prompt and reference photo are required.' }, 400);
    if (!image.type.startsWith('image/')) return json({ error: 'The reference must be an image.' }, 400);
    const form = new FormData();
    form.append('prompt', prompt.slice(0, 2048));
    form.append('input_image_0', image, 'reference.jpg');
    form.append('width', String(incoming.get('width') || '1024'));
    form.append('height', String(incoming.get('height') || '1024'));
    form.append('seed', String(incoming.get('seed') || Date.now() % 2147483647));
    const serialized = new Response(form);
    const result = await env.AI.run(MODEL, {
      multipart: { body: serialized.body, contentType: serialized.headers.get('content-type') },
    });
    if (!result?.image) return json({ error: 'Cloudflare returned no image.' }, 502);
    return json({ image: result.image, mimeType: 'image/jpeg' });
  } catch (error) {
    return json({ error: error?.message || 'Cloudflare image generation failed.' }, 500);
  }
}

export function onRequest() {
  return json({ error: 'Use POST for image generation.' }, 405);
}
