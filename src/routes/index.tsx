import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const IkoutApp = lazy(() => import("@/components/IkoutApp"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "iKout - كوت بوستة" },
      {
        name: "description",
        content:
          "العب كوت بوستة بقواعدها المخصصة، وشخصياتها وطاولتها الحجرية، مع مزايدة ولعب فردي وجماعي.",
      },
      { property: "og:title", content: "iKout - كوت بوستة" },
      {
        property: "og:description",
        content:
          "العب كوت بوستة بقواعدها المخصصة، وشخصياتها وطاولتها الحجرية، مع مزايدة ولعب فردي وجماعي.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly fallback={<div className="table-felt min-h-screen" />}>
      <Suspense fallback={<div className="table-felt min-h-screen" />}>
        <IkoutApp />
      </Suspense>
    </ClientOnly>
  );
}
