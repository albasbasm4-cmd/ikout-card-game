import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
const UnoLobby = lazy(() => import("@/components/uno/UnoLobby"));

export const Route = createFileRoute("/uno/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — إعداد المباراة" },
      {
        name: "description",
        content: "حدد عدد اللاعبين ومستوى البوت وابدأ مباراة أونو أو أنشئ غرفة.",
      },
      { property: "og:title", content: "أونو — إعداد المباراة" },
      { property: "og:description", content: "العب أونو ضد بوتات سهلة أو متوسطة أو صعبة." },
    ],
  }),
  component: () => (
    <ClientOnly>
      <Suspense fallback={null}>
        <UnoLobby />
      </Suspense>
    </ClientOnly>
  ),
});
