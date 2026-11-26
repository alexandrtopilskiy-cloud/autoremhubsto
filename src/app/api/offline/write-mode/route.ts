import { currentSession } from "@/lib/auth";

export async function GET() {
  const session = await currentSession();
  return Response.json({ readOnly: session?.cloudReadOnly ?? true }, {
    status: session ? 200 : 401,
    headers: { "Cache-Control": "private, no-store" },
  });
}
