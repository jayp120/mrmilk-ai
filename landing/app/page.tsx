import { Nav } from '@/components/Nav';
import { Hero } from '@/components/Hero';
import { Method } from '@/components/Method';
import { Replaces } from '@/components/Replaces';
import { Signals } from '@/components/Signals';
import { Manifest } from '@/components/Manifest';
import { Footer } from '@/components/Footer';
import { Reveal } from '@/components/Reveal';

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Reveal>
          <Method />
        </Reveal>
        <Reveal>
          <Replaces />
        </Reveal>
        <Reveal>
          <Signals />
        </Reveal>
        <Reveal>
          <Manifest />
        </Reveal>
      </main>
      <Footer />
    </>
  );
}
