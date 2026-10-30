import { ClientOnly, createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, RotateCw, RotateCcw, Megaphone, Hand, Smartphone, Maximize, Minimize, Volume2, VolumeX, Home } from "lucide-react";
import { useSettings } from "@/store/useSettings";
import { useStageFit } from "@/hooks/use-stage-fit";
import { playTapSound, playCardSound } from "@/utils/audio";
import { LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { UnoHand } from '@/components/uno/UnoHand';
import { CARD_FLIGHT_SECONDS } from '@/utils/cardFlight';
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UnoCard } from "@/components/uno/UnoCard";
import { canPlay, catchUno, COLORS, dealRound, drawCard, passTurn, playCard, sayUno, top, type Color, type GameState, type Result } from "@/lib/uno/engine";
import { botAwareness, chooseMove } from "@/lib/uno/bot";
import { clearGame, loadGame, saveGame } from "@/lib/uno/storage";
import { DIFF_LABEL } from "@/lib/uno/names";
import { cn } from "@/lib/utils";
import { characterFace, CHARACTER_IDS, tableImage, useProfile } from "@/utils/profile";

export const Route = createFileRoute("/uno/play")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "iKout — أونو — الطاولة" },
      { name: "description", content: "طاولة مباراة أونو: العب بطاقاتك، اجمع العقوبات وقل أونو." },
      { property: "og:title", content: "أونو — الطاولة" },
      { property: "og:description", content: "طاولة مباراة أونو ضد البوتات." },
    ],
  }),
  component: () => <ClientOnly><div className="uno-app"><Play /></div></ClientOnly>,
});

const ME = 0;
const STAGE_H = 450;
const COLOR_BG: Record<Color, string> = { red: "bg-uno-red", blue: "bg-uno-blue", green: "bg-uno-green", yellow: "bg-uno-yellow" };
const COLOR_AR: Record<Color, string> = { red: "أحمر", blue: "أزرق", green: "أخضر", yellow: "أصفر" };

export interface PlayProps {
  onBack?: () => void;
  onGoHome?: () => void;
}

export function Play({ onBack, onGoHome }: PlayProps = {}) {
  const nav = useNavigate();
  const profile = useProfile();
  const reduced = useReducedMotion();
  const [s, setS] = useState<GameState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [wildFor, setWildFor] = useState<string | null>(null);
  const busy = useRef(false);
  const { settings, toggleSound, toggleOrientationPreference } = useSettings();
  const stageRef = useRef<HTMLDivElement>(null);
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);
  const [stageW, setStageW] = useState(800);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const calc = () => {
      const vw = window.visualViewport?.width ?? window.innerWidth;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const rotated = settings.orientationPreference === "landscape" && vh > vw;
      const ratio = rotated ? vh / vw : vw / vh;
      setStageW(Math.round(Math.min(1050, Math.max(700, STAGE_H * ratio))));
    };
    const fs = () => setIsFullscreen(!!document.fullscreenElement);
    calc();
    window.addEventListener("resize", calc);
      window.visualViewport?.addEventListener('resize', calc);
    document.addEventListener("fullscreenchange", fs);
    return () => { window.removeEventListener("resize", calc); window.visualViewport?.removeEventListener('resize', calc); document.removeEventListener("fullscreenchange", fs); };
  }, [settings.orientationPreference]);
  useStageFit(stageRef, stageW, STAGE_H, settings.orientationPreference);
  const toggleFullscreen = async () => {
    playTapSound();
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.();
        const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
        o?.lock?.("landscape").catch(() => {});
      } else await document.exitFullscreen?.();
    } catch { /* not supported */ }
  };

  useEffect(() => { setS(loadGame()); setLoaded(true); }, []);

  const apply = useCallback((r: Result, silent = false) => {
    if (!r.ok) { if (!silent) toast.error(r.error); return false; }
    setS(r.state);
    saveGame(r.state);
    return true;
  }, []);

  // Bot turns
  useEffect(() => {
    if (!s || s.status !== "playing") return;
    const p = s.players[s.current];
    if (!p.isBot) return;
    const t = setTimeout(() => {
      let st = s;
      if (st.unoVulnerable !== null && st.unoVulnerable !== st.current && Math.random() < botAwareness(p.difficulty) * .8) {
        const caught = catchUno(st, st.current);
        if (caught.ok) { st = caught.state; toast.warning('تم كشف نسيان أونو — سحب بطاقتين'); }
      }
      if (p.hand.length === 2 && Math.random() < botAwareness(p.difficulty)) {
        const r = sayUno(st, st.current); if (r.ok) st = r.state;
      }
      const m = chooseMove(st, st.current);
      const r = m.type === "play" ? playCard(st, st.current, m.cardId, m.color, st.version)
        : m.type === "draw" ? drawCard(st, st.current, st.version) : passTurn(st, st.current, st.version);
      apply(r, true);
    }, 900);
    return () => clearTimeout(t);
  }, [s, apply]);

  if (!loaded) return <div className="min-h-screen" />;
  if (!s) return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <p>لا توجد مباراة محفوظة.</p>
      <Button onClick={() => { if (onBack) onBack(); else nav({ to: "/uno" }); }}>إلى إعداد أونو</Button>
    </main>
  );

  const me = s.players[ME];
  const myTurn = s.current === ME && s.status === "playing";
  const guard = (fn: () => void) => { if (busy.current) return; busy.current = true; try { fn(); } finally { setTimeout(() => (busy.current = false), 250); } };

  const onCard = (id: string) => guard(() => {
    if (!myTurn) { toast.error("ليس دورك"); return; }
    const card = me.hand.find((c) => c.id === id);
    if (!card) return;
    if (!canPlay(s, card)) { apply(playCard(s, ME, id, undefined, s.version)); return; }
    if (card.kind === "wild" || card.kind === "wild4") { setWildFor(id); return; }
    if (apply(playCard(s, ME, id, undefined, s.version))) playCardSound();
  });
  const onColor = (c: Color) => guard(() => { if (wildFor && apply(playCard(s, ME, wildFor, c, s.version))) playCardSound(); setWildFor(null); });

  const opponents = s.players.map((p, i) => ({ p, i })).filter((x) => x.i !== ME);
  const n = opponents.length;
  const avatar = n <= 3 ? 58 : n <= 6 ? 50 : 42;
  const faceFor = (i: number) => characterFace(i === ME ? profile.characterId : CHARACTER_IDS[(i * 5 + 2) % CHARACTER_IDS.length]);
  const t = top(s);
  const cardW = Math.max(40, Math.min(62, (stageW * 0.56) / Math.max(1, me.hand.length) + 30));

  return (
    <LayoutGroup><div dir="rtl" className="fixed inset-0 select-none overflow-hidden bg-background">
      <div
        ref={stageRef}
        // useStageFit owns the centering transform; Tailwind translate utilities would double it.
        style={{ width: `${stageW}px`, height: `${STAGE_H}px` }}
        className="uno-room uno-stage absolute left-1/2 top-1/2 overflow-hidden"
      >
        <img className="uno-table-image" src={tableImage(profile.table)} alt="" aria-hidden="true" />

        <div className="kt-tools" dir="ltr">
          <Button type="button" onClick={() => { playTapSound(); toggleOrientationPreference(); }} aria-label="تدوير الشاشة" title="تدوير الشاشة">
            <Smartphone className={settings.orientationPreference === "landscape" ? "rotate-90" : ""} />
          </Button>
          <Button type="button" onClick={toggleFullscreen} aria-label="ملء الشاشة" title="ملء الشاشة">
            {isFullscreen ? <Minimize /> : <Maximize />}
          </Button>
          <Button type="button" onClick={() => { playTapSound(); toggleSound(); }} aria-label="كتم/تشغيل الصوت" title="كتم/تشغيل الصوت">
            {settings.soundEnabled ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button type="button" onClick={() => { if (onBack) onBack(); else nav({ to: "/uno" }); }} aria-label="الخروج (محفوظة)" title="الخروج (محفوظة)"><ArrowRight /></Button>
          <Button type="button" onClick={() => { if (onGoHome) onGoHome(); else if (onBack) onBack(); else nav({ to: "/" }); }} aria-label="الشاشة الرئيسية" title="الشاشة الرئيسية"><Home /></Button>
        </div>
        <span className="uno-score absolute right-2 top-2 z-40 text-xs">الجولة {s.round} · الهدف {s.rules.targetScore}</span>

        {opponents.map(({ p, i }, k) => {
          // Seats run around the table edge from the right side, over the top, to the left side.
          const ang = (Math.PI * (k + 0.5)) / n;
          const x = 50 + 36 * Math.cos(ang);
          const y = 54 - 40 * Math.sin(ang);
          const active = s.current === i && s.status === "playing";
          return (
            <div key={p.id} className={cn("kt-opp absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center", active && "kt-active")} style={{ left: `${x}%`, top: `${y}%` }}>
              <div className="relative">
                <div className="kt-avatar" style={{ width: avatar, height: avatar }}><img src={faceFor(i)} alt={p.name} draggable={false} /></div>
                <span className="absolute -bottom-1 -left-1 rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{p.hand.length}</span>
                {p.hand.length === 1 && p.saidUno && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-accent px-1 text-[10px] font-extrabold text-accent-foreground">UNO</span>}
              </div>
              <div className="kt-name"><span>{p.name}</span></div>
              <span className="uno-sub text-[10px]">{DIFF_LABEL[p.difficulty]} · {p.score}</span>
              {s.unoVulnerable === i && (
                <Button size="sm" variant="destructive" className="mt-1 h-6 px-2 text-xs" onClick={() => apply(catchUno(s, ME))}><Hand className="h-3 w-3" /> كشف</Button>
              )}
            </div>
          );
        })}

        <div className="absolute left-1/2 top-[50%] z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-4" dir="ltr">
          <Button variant="ghost" onClick={() => guard(() => apply(drawCard(s, ME, s.version)))} disabled={!myTurn || !!s.drawnCardId} className="uno-draw relative h-auto p-0" aria-label="اسحب">
            <UnoCard faceDown className={cn("w-12", myTurn && !s.drawnCardId && "ring-2 ring-accent")} />
            <span className="absolute -bottom-4 inset-x-0 text-center text-[10px] uno-sub">{s.drawPile.length}</span>
          </Button>
          <div className="relative">
            <motion.div key={t.id} layoutId={`uno-${t.id}`} transition={{ duration: reduced ? 0 : CARD_FLIGHT_SECONDS }}><UnoCard card={t} className="w-14" /></motion.div>
            <span className={cn("absolute -top-2 -right-2 h-5 w-5 rounded-full border-2 border-foreground", COLOR_BG[s.activeColor])} title={COLOR_AR[s.activeColor]} />
          </div>
          <div className="flex flex-col items-center gap-1 text-accent">
            {s.direction === 1 ? <RotateCw className="h-6 w-6" /> : <RotateCcw className="h-6 w-6" />}
            {s.pendingDraw > 0 && <span className="rounded-full bg-destructive px-2 py-0.5 text-xs font-extrabold text-destructive-foreground">+{s.pendingDraw}</span>}
          </div>
        </div>
        <p className="uno-log absolute inset-x-0 top-[66%] z-20 text-center text-[11px]">{s.log.at(-1)}</p>

        {/* Local player: avatar bottom-right, actions bottom-left, hand across the bottom like Kout/187 */}
        <div className={cn("kt-team absolute bottom-3 right-3 z-30 flex flex-col items-center", myTurn && "kt-active")}>
          <div className="kt-avatar" style={{ width: 54, height: 54 }}><img src={faceFor(ME)} alt={me.name} draggable={false} /></div>
          <div className="kt-name"><span>{me.name}</span></div>
          <span className="uno-sub text-[10px]">نقاطك {me.score}</span>
        </div>
        <div className="absolute bottom-3 left-3 z-30 flex flex-col items-start gap-1.5">
          <span className={cn("rounded-full px-3 py-1 text-xs font-bold", myTurn ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground")}>
            {myTurn ? (s.pendingDraw > 0 ? `دورك — العب +2/+4 أو اسحب ${s.pendingDraw}` : "دورك") : `دور ${s.players[s.current].name}`}
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant={me.hand.length <= 2 ? "default" : "secondary"} onClick={() => apply(sayUno(s, ME))}><Megaphone /> أونو</Button>
            {myTurn && s.drawnCardId && <Button size="sm" variant="outline" onClick={() => guard(() => apply(passTurn(s, ME, s.version)))}>تمرير</Button>}
          </div>
        </div>
        <UnoHand cards={me.hand} width={stageW * .56} cardWidth={cardW} enabled={myTurn} isLegal={c => canPlay(s, c)} onPlay={onCard} />
        <div ref={setDialogHost} className="uno-dialog-host" />
      </div>

      <Dialog open={!!wildFor} onOpenChange={(o) => !o && setWildFor(null)}>
        <DialogContent container={dialogHost} className="max-w-xs uno-stage-dialog" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>اختر اللون</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {COLORS.map((c) => (
              <Button variant="ghost" key={c} onClick={() => onColor(c)} className={cn("h-20 rounded-xl text-lg font-extrabold text-background", COLOR_BG[c])}>{COLOR_AR[c]}</Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={s.status !== "playing"}>
        <DialogContent container={dialogHost} className="max-w-sm uno-stage-dialog" aria-describedby={undefined} onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader><DialogTitle>{s.status === "matchOver" ? "انتهت المباراة" : "انتهت الجولة"}</DialogTitle></DialogHeader>
          <p className="text-center text-lg">{s.roundWinner !== null && s.players[s.roundWinner].name} {s.roundWinner === ME ? "فزت 🎉" : "فاز"}</p>
          <ul className="space-y-1">
            {[...s.players].sort((a, b) => b.score - a.score).map((p) => (
              <li key={p.id} className="flex justify-between rounded bg-secondary px-3 py-1"><span>{p.name}</span><b>{p.score}</b></li>
            ))}
          </ul>
          {s.status === "roundOver"
            ? <Button onClick={() => { const n2 = dealRound(s); setS(n2); saveGame(n2); }}>الجولة التالية</Button>
            : <Button onClick={() => { clearGame(); if (onBack) onBack(); else nav({ to: "/uno" }); }}>مباراة جديدة</Button>}
        </DialogContent>
      </Dialog>
    </div></LayoutGroup>
  );
}
