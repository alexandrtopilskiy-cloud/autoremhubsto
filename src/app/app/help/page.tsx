import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/ui";
import { helpCategories } from "./materials";

export default async function HelpPage({ searchParams }: { searchParams: Promise<{ topic?: string | string[] }> }) {
  const { topic } = await searchParams;
  const materials = helpCategories.flatMap((category) => category.materials);
  const selected = topic === undefined ? materials[0] : materials.find((material) => material.id === topic);
  if (!selected) notFound();
  const { Content } = selected;

  return (
    <div className="flex flex-col gap-5">
      <PageTitle>Справка — FAQ</PageTitle>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)]">
        <nav aria-label="Темы справки" className="rounded-md border border-slate-200 bg-slate-50 p-3 lg:sticky lg:top-0">
          {helpCategories.map((category) => {
            const active = category.materials.some((material) => selected.id === material.id);
            return (
              <details key={category.title} open={active}>
                <summary className="cursor-pointer rounded px-2 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100">
                  {category.title}
                </summary>
                <ul className="ml-4 space-y-1 border-l border-slate-200 pl-2">
                  {category.materials.map((material) => {
                    const current = selected.id === material.id;
                    return (
                      <li key={material.id}>
                        <Link
                          aria-current={current ? "page" : undefined}
                          className={`block rounded px-2 py-2 text-sm ${current ? "bg-blue-100 font-medium text-blue-900" : "text-slate-700 hover:bg-slate-100"}`}
                          href={{ pathname: "/app/help", query: { topic: material.id } }}
                        >
                          {material.title}
                        </Link>
                        {current && (
                          <ul className="my-1 ml-2 space-y-0.5 border-l border-slate-200 pl-2">
                            {material.sections.map((section) => (
                              <li key={section.id}>
                                <a href={`#${section.id}`} className="block rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                                  {section.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </nav>
        <article aria-labelledby="help-article-title" className="min-w-0 max-w-4xl rounded-md border border-slate-200 bg-white p-4 sm:p-7">
          <h2 id="help-article-title" className="mb-4 text-2xl font-semibold text-slate-900">{selected.title}</h2>
          <Content />
        </article>
      </div>
    </div>
  );
}
