import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

const sections = [
  {
    title: "Information We Collect",
    body: [
      "LingoWatch may collect account information such as your name, email address, and sign-in details when you create or use an account.",
      "When you use the website or Chrome extension, we may process subtitle text, words you save, reading content you import, and basic usage activity needed to provide learning features.",
      "We may also receive technical information such as browser type, device information, and log data for security, troubleshooting, and service reliability.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "We use your information to provide translation, subtitle learning, saved vocabulary, reading import, account access, and other LingoWatch features.",
      "We use technical and usage information to keep the service working, improve performance, prevent abuse, and diagnose problems.",
      "If you contact us, we may use your information to respond to support requests and service questions.",
    ],
  },
  {
    title: "Chrome Extension Data",
    body: [
      "The LingoWatch PhrasePal Chrome extension may access webpage content, YouTube subtitles, and page text only to provide features you actively use, such as subtitle translation, word lookup, Lingowatch connection, and importing reading content.",
      "The extension stores local settings such as subtitle preferences and connection state in your browser storage.",
      "We do not sell your personal information. We do not use webpage content for advertising.",
    ],
  },
  {
    title: "Sharing",
    body: [
      "We may use service providers that help us operate the product, such as hosting, authentication, email delivery, analytics, database, storage, and language or speech APIs.",
      "We may share information when required by law, to protect users, or to enforce our terms and security.",
    ],
  },
  {
    title: "Data Retention",
    body: [
      "We keep information for as long as needed to operate LingoWatch, comply with legal obligations, resolve disputes, and maintain security.",
      "If you request deletion of your account or stored content, we will work to remove or anonymize the relevant data within a reasonable period, unless we must retain some records for legal or security reasons.",
    ],
  },
  {
    title: "Your Choices",
    body: [
      "You can stop using the extension at any time by disabling or removing it from Chrome.",
      "You can contact us if you want help accessing, correcting, or deleting account-related information.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about this Privacy Policy, contact LingoWatch through maahir03.me.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#161b24] text-white">
      <div className="mx-auto max-w-5xl px-6 py-6 sm:px-8 lg:px-10">
        <header className="mb-10 flex flex-col gap-6 rounded-[28px] border border-white/10 bg-white/[0.03] px-6 py-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <BrandLogo width={72} height={72} className="h-14 w-14 shrink-0 object-contain" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">LingoWatch</p>
              <h1 className="mt-1 text-3xl font-medium tracking-tight text-white sm:text-4xl">Privacy Policy</h1>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white/80 transition-colors hover:border-white/30 hover:text-white"
            >
              Back to Home
            </Link>
            <a
              href="https://maahir03.me"
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-[#161b24] transition-colors hover:bg-white/90"
            >
              Visit maahir03.me
            </a>
          </div>
        </header>

        <section className="rounded-[32px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] px-6 py-8 shadow-[0_24px_64px_rgba(0,0,0,0.22)] sm:px-8 sm:py-10">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#9fb2d9]">Effective date</p>
            <p className="mt-2 text-lg text-white/80">April 23, 2026</p>
            <p className="mt-6 text-base leading-8 text-white/78 sm:text-lg">
              This Privacy Policy explains how LingoWatch collects, uses, and protects information when you use the
              LingoWatch website at <span className="text-white">maahir03.me</span> and the LingoWatch PhrasePal Chrome
              extension.
            </p>
          </div>

          <div className="mt-10 grid gap-6">
            {sections.map((section) => (
              <article
                key={section.title}
                className="rounded-[24px] border border-white/8 bg-black/10 px-5 py-5 sm:px-6 sm:py-6"
              >
                <h2 className="text-xl font-medium tracking-tight text-white">{section.title}</h2>
                <div className="mt-4 space-y-4 text-sm leading-7 text-white/75 sm:text-base">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-10 rounded-[24px] border border-[#9fb2d9]/20 bg-[#89a6d8]/8 px-5 py-5 text-sm leading-7 text-white/75 sm:px-6 sm:text-base">
            <p>
              We may update this policy from time to time. When we do, we will publish the updated version on this
              page.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
