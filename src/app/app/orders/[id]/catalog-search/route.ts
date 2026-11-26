import { currentSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s || s.cloudReadOnly || !can(s.perms, "orders", "EDIT")) return new Response(null, { status: 403 });
  const { id } = await params;
  const order = await prisma.workOrder.findFirst({
    where: { id, companyId: s.companyId, status: "DRAFT" }, select: { id: true },
  });
  if (!order) return new Response(null, { status: 404 });

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const fragments = (searchParams.get("q") ?? "").slice(0, 160).trim().split(/\s+/).filter(Boolean).slice(0, 12);
  if (!fragments.length) return Response.json([]);
  const contains = (value: string) => ({ contains: value.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" as const });
  const orderBy = [{ name: "asc" as const }, { id: "asc" as const }];
  if (kind === "WORK") {
    const works = await prisma.work.findMany({
      where: { companyId: s.companyId, AND: fragments.map((word) => ({ name: contains(word) })) },
      orderBy, take: 20, select: { id: true, name: true, group: { select: { name: true } } },
    });
    return Response.json(works.map(({ id, name, group }) => ({ id, name, detail: group?.name })));
  }
  if (kind === "ITEM") {
    const products = await prisma.product.findMany({
      where: { companyId: s.companyId, AND: fragments.map((word) => {
        const term = contains(word);
        return { OR: [{ name: term }, { article: term }, { brand: term }, { barcode: term }] };
      }) },
      orderBy, take: 20, select: { id: true, name: true, article: true, brand: true },
    });
    return Response.json(products.map(({ id, name, article, brand }) => ({ id, name, detail: [article, brand].filter(Boolean).join(" · ") })));
  }
  return new Response(null, { status: 400 });
}
