import { Suspense } from "react";
import { DemoApp } from "@/components/DemoApp";
import { parseTabParam } from "@/lib/tab-param";

export default function Home(props: PageProps<"/">) {
  return (
    <Suspense fallback={<DemoApp initialTab={null} />}>
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
  // `/` with no tab is the overview. Sign-in with no `next` lands here.
  // A valid `?tab=` still opens that demo, including the post-401 return path.
  return <DemoApp initialTab={parseTabParam(params.tab)} />;
}
