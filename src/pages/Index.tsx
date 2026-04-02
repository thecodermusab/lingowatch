import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { BookOpen, Brain, Globe, RotateCcw, Star, Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/layout/Footer";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5 } }),
};

function DemoCard() {
  return (
    <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border bg-card shadow-lg">
      <div className="border-b bg-primary/5 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Phrasal Verb
            </span>
            <h3 className="mt-2 text-xl font-bold text-foreground">throttle down</h3>
            <p className="text-sm text-muted-foreground">/ˈθrɒt.əl daʊn/</p>
          </div>
          <Star className="h-5 w-5 text-accent" />
        </div>
      </div>
      <div className="space-y-4 p-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Standard Meaning</p>
          <p className="mt-1 text-sm text-foreground">To reduce speed, power, or intensity</p>
        </div>
        <div className="rounded-lg bg-primary/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Easy Meaning ✨</p>
          <p className="mt-1 text-sm text-foreground">Go slower or use less power</p>
        </div>
        <div className="rounded-lg bg-somali/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-somali">Somali 🇸🇴</p>
          <p className="mt-1 text-sm text-foreground">Xawaaraha hoos u dhig</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Example</p>
          <p className="mt-1 text-sm italic text-muted-foreground">"You should throttle down and take a break."</p>
        </div>
      </div>
    </div>
  );
}

const features = [
  { icon: Sparkles, title: "AI Explanations", desc: "Get instant, simple explanations powered by AI" },
  { icon: Globe, title: "Somali Support", desc: "Meanings and explanations in easy Somali" },
  { icon: Brain, title: "Easy English", desc: "Explanations using very simple words" },
  { icon: RotateCcw, title: "Smart Review", desc: "Flashcards with spaced repetition" },
  { icon: Star, title: "Personal Library", desc: "Save and organize your vocabulary" },
  { icon: CheckCircle2, title: "Track Progress", desc: "See what you learned and what to review" },
];

const benefits = [
  "Dictionaries are not always enough",
  "Understand phrases in easy English",
  "Get Somali support for better understanding",
  "Save and review what you learn",
  "Build vocabulary over time with AI help",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="container relative py-20 lg:py-28">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <motion.div initial="hidden" animate="visible" className="space-y-6">
              <motion.div variants={fadeUp} custom={0}>
                <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-primary shadow-sm">
                  <Sparkles className="h-4 w-4" /> AI-Powered Learning
                </span>
              </motion.div>
              <motion.h1 variants={fadeUp} custom={1} className="text-4xl font-extrabold leading-tight tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Save English phrases.{" "}
                <span className="text-primary">Understand them simply.</span>
              </motion.h1>
              <motion.p variants={fadeUp} custom={2} className="max-w-lg text-lg text-muted-foreground">
                Learn with AI explanations in easy English and Somali support. Perfect for beginner learners who want more than a dictionary.
              </motion.p>
              <motion.div variants={fadeUp} custom={3} className="flex flex-wrap gap-3">
                <Link to="/signup">
                  <Button size="lg" className="gap-2 text-base">
                    Start learning free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a href="#demo">
                  <Button variant="outline" size="lg" className="text-base">
                    See a demo
                  </Button>
                </a>
              </motion.div>
            </motion.div>
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.6 }}>
              <DemoCard />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Section */}
      <section className="border-y bg-card py-16">
        <div className="container">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} className="mx-auto max-w-2xl text-center">
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-bold text-foreground">Why PhrasePal AI?</motion.h2>
            <motion.p variants={fadeUp} custom={1} className="mt-3 text-muted-foreground">
              Regular dictionaries don't explain phrases in a way beginners understand.
            </motion.p>
          </motion.div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {benefits.map((b, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="flex items-start gap-3 rounded-xl border bg-background p-5"
              >
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p className="text-sm font-medium text-foreground">{b}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground">Everything you need to learn phrases</h2>
            <p className="mt-3 text-muted-foreground">Simple tools designed for real learning</p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                custom={i}
                className="rounded-2xl border bg-card p-6 transition-shadow hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo */}
      <section id="demo" className="border-t bg-card py-16">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground">See how it works</h2>
            <p className="mt-3 text-muted-foreground">Here's what a saved phrase looks like</p>
          </div>
          <div className="mt-10">
            <DemoCard />
          </div>
          <div className="mt-8 text-center">
            <Link to="/signup">
              <Button size="lg" className="gap-2">
                Start saving phrases <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
