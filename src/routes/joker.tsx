import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
const JokerApp = lazy(() => import('@/joker/JokerApp'));

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
  return <ClientOnly><Suspense fallback={null}><JokerApp /></Suspense></ClientOnly>;
}