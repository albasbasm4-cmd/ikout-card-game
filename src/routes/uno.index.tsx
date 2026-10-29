import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newGame, type Difficulty } from "@/lib/uno/engine";
import { clearGame, loadGame, saveGame } from "@/lib/uno/storage";
import { BOT_NAMES } from "@/lib/uno/names";
import { loadProfile } from "@/utils/profile";

export const Route = createFileRoute("/uno/")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — إعداد المباراة" },
      { name: "description", content: "حدد عدد اللاعبين ومستوى البوت وابدأ مباراة أونو أو أنشئ غرفة." },
      { property: "og:title", content: "أونو — إعداد المباراة" },
      { property: "og:description", content: "العب أونو ضد بوتات سهلة أو متوسطة أو صعبة." },
    ],
  }),
  component: () => <ClientOnly><UnoLobby /></ClientOnly>,
});

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/** The lobby design lives in public/uno/lobby.html (isolated iframe); it posts its button actions here. */
function UnoLobby() {
  const nav = useNavigate();
  const [hasSave, setHasSave] = useState(false);

  useEffect(() => {
    const s = loadGame();
    setHasSave(!!s && s.status !== "matchOver");
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || !e.data || typeof e.data.type !== "string") return;
      const d = e.data as { type: string; players?: number; botLevel?: string };
      if (d.type === "uno:home") nav({ to: "/" });
      else if (d.type === "uno:room") nav({ to: "/uno/room" });
      else if (d.type === "uno:join") nav({ to: "/uno/join" });
      else if (d.type === "uno:start") {
        const players = Math.max(2, Math.min(10, Math.round(Number(d.players) || 4)));
        const level: Difficulty = LEVELS.includes(d.botLevel as Difficulty) ? (d.botLevel as Difficulty) : "medium";
        let myName = "أنت";
        try { myName = loadProfile().name || myName; } catch { /* ignore */ }
        clearGame();
        const g = newGame([
          { name: myName, isBot: false, difficulty: "easy" },
          ...Array.from({ length: players - 1 }, (_, i) => ({ name: BOT_NAMES[i] ?? `بوت ${i + 1}`, isBot: true, difficulty: level })),
        ], "bots");
        saveGame(g);
        nav({ to: "/uno/play" });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [nav]);

  return (
    <div className="uno-app fixed inset-0 bg-background">
      <iframe title="أونو" src="/uno/lobby.html" className="h-full w-full border-0" />
      {hasSave && (
        <Button className="absolute bottom-3 left-3 z-10" onClick={() => nav({ to: "/uno/play" })}>
          <RotateCcw /> استئناف المباراة
        </Button>
      )}
    </div>
  );
}
