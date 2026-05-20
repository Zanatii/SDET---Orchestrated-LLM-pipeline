export const maxDuration = 300;

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const upstream = await fetch(`${API_BASE}/runs/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await upstream.text();
  return new Response(data, {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
