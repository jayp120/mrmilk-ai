import { motion, useInView } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useRef } from "react";

const serviceCards = [
  {
    description:
      "We map live requests, customer patterns, market shifts, and operator questions into clear intelligence your team can actually act on.",
    tag: "Signals",
    title: "Research & Insight",
    videoUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4",
  },
  {
    description:
      "From campaign planning to execution-ready outputs, Mr Milk AI OS turns strategy into workflows that feel polished, repeatable, and operationally useful.",
    tag: "Execution",
    title: "Design & Deployment",
    videoUrl:
      "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260324_151826_c7218672-6e92-402c-9e45-f1e0f454bdc4.mp4",
  },
];

const ease = [0.22, 1, 0.36, 1] as const;

export default function ServicesSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const isInView = useInView(sectionRef, { once: true, margin: "-100px" });

  return (
    <section
      id="services"
      ref={sectionRef}
      className="relative overflow-hidden bg-black px-6 py-28 md:py-40"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)]" />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : undefined}
          transition={{ duration: 0.7, ease }}
          className="mb-10 flex items-end justify-between gap-4 md:mb-14"
        >
          <h2 className="font-instrument text-3xl tracking-tight text-white md:text-5xl">What we do</h2>
          <p className="hidden text-sm uppercase tracking-[0.3em] text-white/40 md:block">Core services</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {serviceCards.map((card, index) => (
            <motion.article
              key={card.title}
              initial={{ opacity: 0, y: 50 }}
              animate={isInView ? { opacity: 1, y: 0 } : undefined}
              transition={{ duration: 0.8, delay: 0.15 * index, ease }}
              className="liquid-glass group overflow-hidden rounded-[2rem]"
            >
              <div className="relative aspect-video overflow-hidden">
                <video
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                  src={card.videoUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="auto"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              </div>

              <div className="p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">{card.tag}</p>
                  <div className="liquid-glass rounded-full p-2 text-white">
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                </div>

                <h3 className="font-instrument mb-3 mt-6 text-xl tracking-tight text-white md:text-2xl">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed tracking-[0.03em] text-white/50">
                  {card.description}
                </p>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
