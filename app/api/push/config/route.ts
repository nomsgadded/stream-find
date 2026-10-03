export async function GET() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY?.trim();
  if (!publicKey) return Response.json({ error: "Device notifications are not configured." }, { status: 503 });
  return Response.json({ publicKey }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
