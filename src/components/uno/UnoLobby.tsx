import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, ChevronLeft, ChevronRight, Globe, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileEditor } from '@/components/ProfileEditor';
import { newGame, type Difficulty } from '@/lib/uno/engine';
import { clearGame, loadGame, saveGame } from '@/lib/uno/storage';
import { BOT_NAMES } from '@/lib/uno/names';
import { characterFace, useProfile } from '@/utils/profile';
import { useSettings } from '@/store/useSettings';
import { useStageFit } from '@/hooks/use-stage-fit';
import { CitySkyline, Clouds } from '@/components/HomeScreen';
import './lobby.css';

const LEVELS: Difficulty[] = ['easy', 'medium', 'hard'];
const LABELS = ['سهل', 'متوسط', 'صعب'];
export interface UnoLobbyProps {
  onBack?: () => void;
  onStartPlay?: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
}

export default function UnoLobby({ onBack, onStartPlay, onCreateRoom, onJoinRoom }: UnoLobbyProps = {}) {
  const nav = useNavigate();
  const profile = useProfile();
  const { settings } = useSettings();
  const stage = useRef<HTMLDivElement>(null);
  useStageFit(stage, 2400, 1080, settings.orientationPreference);
  const [players, setPlayers] = useState(4);
  const [level, setLevel] = useState(1);
  const [hasSave, setHasSave] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { const s = loadGame(); setHasSave(!!s && s.status !== 'matchOver'); }, []);
  const start = () => {
    clearGame();
    saveGame(newGame([{ name: profile.name || 'أنت', isBot: false, difficulty: 'easy' }, ...Array.from({ length: players - 1 }, (_, i) => ({ name: BOT_NAMES[i] ?? `بوت ${i + 1}`, isBot: true, difficulty: LEVELS[level] }))], 'bots'));
    if (onStartPlay) onStartPlay();
    else nav({ to: '/uno/play' });
  };
  return <main className="uno-lobby" dir="rtl"><div id="st" ref={stage}>
    <div className="uno-lobby-scenery"><Clouds /><CitySkyline /></div>
    <Button id="prof" variant="ghost" aria-label="خيارات اللاعب" onClick={() => setProfileOpen(true)}><div className="av"><img src={characterFace(profile.characterId)} alt="" /></div><span className="un">{profile.name}</span></Button>
    <Button id="back" variant="ghost" aria-label="رجوع" onClick={() => { if (onBack) onBack(); else nav({ to: '/' }); }}><ArrowRight /></Button>
    <div id="card"><div className="hd">تدريب</div><div className="bd"><div className="rp"><div className="rq">الإعدادات المختارة</div><div className="rb"><div className="inf-row"><span className="inf-lbl">اللاعبون:</span><b className="inf-val">{players}</b></div><div className="inf-bot">البوت: <em>{LABELS[level]}</em></div></div><Button className="btn red" onClick={start}>مباراة جديدة</Button></div><div className="col">
      <div className="lb" style={{ top: 4 }}>اللاعبين:</div><div className="sp" style={{ top: 40 }}><Button className="ab l" aria-label="تقليل اللاعبين" disabled={players <= 2} onClick={() => setPlayers(p => p - 1)}><ChevronLeft /></Button><div className="nm">{players}</div><Button className="ab r" aria-label="زيادة اللاعبين" disabled={players >= 10} onClick={() => setPlayers(p => p + 1)}><ChevronRight /></Button></div>
      <div className="lb" style={{ top: 118 }}>مستوى البوتات:</div><div className="sp" style={{ top: 154 }}><Button className="ab l" aria-label="مستوى أسهل" disabled={level === 0} onClick={() => setLevel(l => l - 1)}><ChevronLeft /></Button><div className="nm t">{LABELS[level]}</div><Button className="ab r" aria-label="مستوى أصعب" disabled={level === 2} onClick={() => setLevel(l => l + 1)}><ChevronRight /></Button></div><Button className="btn nb" onClick={start}>ابدأ</Button>
    </div></div></div>
    <div id="net"><div className="hd">لعب مشترك</div><div className="bd"><div className="ic"><Globe /></div><Button className="btn red c1" onClick={() => { if (onCreateRoom) onCreateRoom(); else nav({ to: '/uno/room' }); }}>إنشاء غرفة</Button><Button className="btn red" onClick={() => { if (onJoinRoom) onJoinRoom(); else nav({ to: '/uno/join' }); }}>الانضمام إلى غرفة</Button></div></div>
    {hasSave && <Button className="resume" onClick={() => { if (onStartPlay) onStartPlay(); else nav({ to: '/uno/play' }); }}><RotateCcw />استئناف المباراة</Button>}
    {profileOpen && <ProfileEditor onClose={() => setProfileOpen(false)} />}
  </div></main>;
}