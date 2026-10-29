import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/joker')({
  head: () => ({ meta: [
    { title: 'iKout — لعبة الجوكر' },
    { name: 'description', content: 'لعبة الجوكر الاجتماعية بقوانين التخمين والكشف الأصلية.' },
    { property: 'og:title', content: 'iKout — لعبة الجوكر' },
    { property: 'og:description', content: 'طاولة الجوكر الاجتماعية والتخمين بين اللاعبين.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: Joker,
});

function Joker() {
  const navigate = useNavigate();
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === 'joker:home') navigate({ to: '/' }); };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [navigate]);
  return <main className="fixed inset-0 bg-background">
    <iframe src="/joker/index.html" title="لعبة الجوكر" className="h-full w-full border-0" allow="camera; fullscreen" />
    <Button asChild size="icon" variant="secondary" className="absolute right-2 top-2 z-10" aria-label="العودة إلى الألعاب"><Link to="/"><ArrowRight /></Link></Button>
  </main>;
}