import { Suspense } from "react";
import { DemoApp } from "@/components/DemoApp";
import { tabSchema, type Tab } from "@/lib/contract";

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense fallback={<DemoApp />}>
      <HomeTab searchParams={props.searchParams} />
    </Suspense>
  );
}

async function HomeTab({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const params = await searchParams;
  return <DemoApp initialTab={readTab(params.tab)} />;
}

function readTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = tabSchema.safeParse(raw);
  return parsed.success ? parsed.data : "phishing";
}
