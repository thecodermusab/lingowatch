import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/shared/BrandLogo";

const SECTIONS = [
  {
    title: "1. Acceptance of Terms",
    body: [
      "By installing the LingoWatch Chrome extension, creating an account, or using any part of the LingoWatch service, you agree to be bound by these Terms and Conditions.",
      "If you do not agree to these terms, please do not use the service.",
    ],
  },
  {
    title: "2. Description of Service",
    body: [
      "LingoWatch is a language learning tool consisting of a Chrome browser extension and a companion web application. The extension adds dual-language subtitles, word lookup, and vocabulary tracking to YouTube videos.",
      "The web application provides vocabulary management, spaced repetition review, reading import, and learning progress features.",
      "LingoWatch is designed primarily for Somali speakers learning English, with support for additional languages planned in the future.",
    ],
  },
  {
    title: "3. User Accounts",
    body: [
      "You must provide a valid email address to create an account. You are responsible for keeping your login credentials secure.",
      "You may not share your account with others or use another person's account without their permission.",
      "We reserve the right to suspend or terminate accounts that violate these terms or are used in ways that harm other users or the service.",
    ],
  },
  {
    title: "4. Acceptable Use",
    body: [
      "You may use LingoWatch only for personal, non-commercial language learning purposes unless you have our written consent for other uses.",
      "You may not attempt to reverse engineer, scrape, overload, or interfere with the LingoWatch service or its underlying APIs.",
      "You may not use LingoWatch to process content that you do not have the right to access, including copyrighted material in ways that exceed fair use.",
      "Automated or scripted use of LingoWatch's AI, translation, or text-to-speech features is prohibited without prior written consent.",
    ],
  },
  {
    title: "5. Intellectual Property",
    body: [
      "LingoWatch, including its extension, web application, branding, and underlying technology, is owned by Musab Mohamed Ali. All rights are reserved.",
      "Your saved vocabulary, imported texts, and other content you create remain yours. By using LingoWatch, you grant us a limited licence to store and process this content to provide the service.",
      "You may not reproduce, distribute, or create derivative works from LingoWatch's code, design, or branding without explicit written permission.",
    ],
  },
  {
    title: "6. Third-Party Services",
    body: [
      "LingoWatch uses third-party services to provide features, including Google Translate, Amazon Polly, Google Cloud Text-to-Speech, Neon (database), DigitalOcean Spaces (storage), and various AI providers.",
      "These services have their own terms and privacy policies. LingoWatch is not responsible for the practices or content of third-party services.",
      "YouTube content accessed through the extension is subject to YouTube's Terms of Service. LingoWatch does not store or redistribute YouTube video content.",
    ],
  },
  {
    title: "7. Disclaimers",
    body: [
      "LingoWatch is provided \"as is\" without warranties of any kind, express or implied. We do not guarantee that the service will be uninterrupted, error-free, or that translations and AI-generated content will be accurate.",
      "AI-generated vocabulary explanations, translations, and example sentences are for learning purposes only and may contain errors. Always verify important information from authoritative sources.",
      "We are not responsible for content available on YouTube or other websites accessed through the extension.",
    ],
  },
  {
    title: "8. Limitation of Liability",
    body: [
      "To the fullest extent permitted by law, LingoWatch and its owner shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.",
      "Our total liability for any claim related to LingoWatch shall not exceed the amount you paid for the service in the twelve months prior to the claim, or £50, whichever is less.",
    ],
  },
  {
    title: "9. Changes to Terms",
    body: [
      "We may update these Terms and Conditions from time to time. When we do, we will update the date at the top of this page.",
      "Continued use of LingoWatch after changes are posted constitutes your acceptance of the updated terms.",
    ],
  },
  {
    title: "10. Contact",
    body: [
      "If you have questions about these terms, please contact us at maahir.engineer@gmail.com.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0b0d10", color: "#f3f4f6", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ maxWidth: "740px", margin: "0 auto", padding: "48px 24px 80px" }}>
        <div style={{ marginBottom: "40px" }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", color: "rgba(255,255,255,0.55)", fontSize: "14px", marginBottom: "32px" }}>
            <BrandLogo width={28} height={28} />
            LingoWatch
          </Link>
          <h1 style={{ fontSize: "32px", fontWeight: 600, color: "#fff", margin: "0 0 8px" }}>Terms and Conditions</h1>
          <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", margin: 0 }}>Last updated: April 2026</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "40px" }}>
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, color: "#fff", marginBottom: "12px" }}>{section.title}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {section.body.map((para, i) => (
                  <p key={i} style={{ color: "rgba(255,255,255,0.7)", lineHeight: 1.7, fontSize: "15px", margin: 0 }}>{para}</p>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "56px", paddingTop: "24px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", gap: "24px" }}>
          <Link to="/privacy" style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", textDecoration: "none" }}>Privacy Policy</Link>
          <Link to="/" style={{ color: "rgba(255,255,255,0.45)", fontSize: "14px", textDecoration: "none" }}>Back to Home</Link>
        </div>
      </div>
    </div>
  );
}
