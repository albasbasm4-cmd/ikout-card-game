import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Bot, Minus, Plus, User, LogIn } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { newGame, type Difficulty } from "@/lib/uno/engine";
import { clearGame, saveGame } from "@/lib/uno/storage";
import { BOT_NAMES, DIFF_LABEL } from "@/lib/uno/names";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/uno/room")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — إنشاء غرفة" },
      { name: "description", content: "أنشئ غرفة أونو، حدد المقاعد من 1 إلى 10، واختر لاعباً حقيقياً أو بوتاً لكل مقعد." },
      { property: "og:title", content: "أونو — إنشاء غرفة" },
      { property: "og:description", content: "غرفة أونو جماعية مع رمز QR." },
    ],
  }),
  component: () => <ClientOnly><div className="uno-app"><Room /></div></ClientOnly>,
});

type Seat = { type: "human"; occupied: boolean } | { type: "bot"; difficulty: Difficulty };

function Room() {
  const nav = useNavigate();
  const code = useMemo(() => Math.random().toString(36).slice(2, 8).toUpperCase(), []);
  // Seat 0 is always the host.
  const [seats, setSeats] = useState<Seat[]>([{ type: "human", occupied: true }]);
  const setCount = (n: number) => {
    n = Math.max(1, Math.min(10, n));
    setSeats((s) => (n > s.length ? [...s, ...Array.from({ length: n - s.length }, () => ({ type: "bot", difficulty: "medium" }) as Seat)] : s.slice(0, n)));
  };
  const waiting = seats.filter((s) => s.type === "human" && !s.occupied).length;
  const canStart = seats.length >= 2 && waiting === 0;
  const size = seats.length <= 2 ? "w-36" : seats.length <= 4 ? "w-28" : seats.length <= 6 ? "w-24" : "w-20";

  const start = () => {
    if (!canStart) return;
    clearGame();
    let b = 0;
    const g = newGame(seats.map((s, i) => (i === 0 ? { name: "أنت (المستضيف)", isBot: false, difficulty: "easy" as Difficulty } : { name: BOT_NAMES[b++] ?? "بوت", isBot: true, difficulty: s.type === "bot" ? s.difficulty : "medium" })), "room");
    saveGame(g);
    nav({ to: "/uno/play" });
  };

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-8">
      <Link to="/uno" className="inline-flex items-center gap-1 text-sm text-muted-foreground"><ArrowRight className="h-4 w-4" /> أونو</Link>
      <div className="mt-3 flex items-center justify-between">
        <h1 className="font-display text-4xl text-accent">إنشاء غرفة</h1>
        <Button asChild variant="outline"><Link to="/uno/join"><LogIn /> الانضمام لغرفة</Link></Button>
      </div>

      <section className="mt-5 flex flex-wrap items-center gap-5 bg-card p-5">
        <div className="rounded-lg bg-foreground p-2"><QRCodeSVG value={`uno-room:${code}`} size={96} /></div>
        <div>
          <p className="text-sm text-muted-foreground">رمز الغرفة</p>
          <p className="font-display text-4xl tracking-widest" dir="ltr">{code}</p>
        </div>
        <div className="ms-auto flex items-center gap-3">
          <span>المقاعد</span>
          <Button size="icon" variant="secondary" aria-label="إنقاص" onClick={() => setCount(seats.length - 1)} disabled={seats.length <= 1}><Minus /></Button>
          <span className="w-8 text-center text-2xl font-extrabold">{seats.length}</span>
          <Button size="icon" variant="secondary" aria-label="زيادة" onClick={() => setCount(seats.length + 1)} disabled={seats.length >= 10}><Plus /></Button>
        </div>
      </section>

      <section className="mt-5 flex flex-wrap justify-center gap-3">
        {seats.map((seat, i) => (
          <div key={i} className={cn("flex flex-col items-center rounded-xl bg-card p-3 text-center", size)}>
            <div className={cn("flex aspect-square w-3/4 items-center justify-center rounded-full border-4", i === 0 ? "border-accent" : "border-felt-edge", "bg-secondary")}>
              {seat.type === "bot" ? <Bot className="h-1/2 w-1/2" /> : <User className="h-1/2 w-1/2" />}
            </div>
            <p className="mt-2 truncate text-sm font-bold">{i === 0 ? "أنت (المستضيف)" : seat.type === "bot" ? BOT_NAMES[seats.slice(1, i).filter((x) => x.type === "bot").length] : "لاعب حقيقي"}</p>
            <p className="text-xs text-muted-foreground">{i === 0 ? "جاهز" : seat.type === "bot" ? "جاهز" : "بانتظار الانضمام…"}</p>
            {i > 0 && (
              <div className="mt-2 flex w-full flex-col gap-1">
                <div className="flex gap-1">
                  <Button variant="ghost" onClick={() => setSeats((s) => s.map((x, j) => (j === i ? { type: "human", occupied: false } : x)))} className={cn("flex-1 rounded px-1 py-0.5 text-[11px]", seat.type === "human" ? "bg-accent text-accent-foreground" : "bg-secondary")}>لاعب</Button>
                  <Button variant="ghost" onClick={() => setSeats((s) => s.map((x, j) => (j === i ? { type: "bot", difficulty: "medium" } : x)))} className={cn("flex-1 rounded px-1 py-0.5 text-[11px]", seat.type === "bot" ? "bg-accent text-accent-foreground" : "bg-secondary")}>بوت</Button>
                </div>
                {seat.type === "bot" && (
                  <select value={seat.difficulty} onChange={(e) => setSeats((s) => s.map((x, j) => (j === i ? { type: "bot", difficulty: e.target.value as Difficulty } : x)))} className="rounded bg-secondary px-1 py-0.5 text-[11px]">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((d) => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      <Button className="mt-6 h-12 w-full text-base" disabled={!canStart} onClick={start}>بدء المباراة</Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {seats.length < 2 ? "تحتاج مقعدين على الأقل لبدء المباراة" : waiting > 0 ? `بانتظار ${waiting} لاعب حقيقي — لا تبدأ المباراة قبل اكتمال المقاعد` : "الكل جاهز"}
      </p>
      <p className="mt-4 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        ملاحظة: انضمام لاعبين من أجهزة أخرى يحتاج تفعيل الخادم الجماعي، ولم يُفعّل بعد في هذه النسخة.
      </p>
    </main>
  );
}
