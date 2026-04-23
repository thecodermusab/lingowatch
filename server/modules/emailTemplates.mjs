const APP_NAME = "LingoWatch";
const APP_URL = "https://lingowatch.com";
const LOGO_URL = `${APP_URL}/branding/logo-mark.svg`;
const BRAND = {
  ink: "#1B202A",
  panel: "#FFFFFF",
  background: "#EEF2FF",
  purple: "#6D5EF5",
  teal: "#0EA5A4",
  text: "#101828",
  muted: "#667085",
  soft: "#E9ECF5",
  success: "#4CBF86",
};

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSocialIcon(label) {
  switch (label) {
    case "linkedin":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><circle cx="6" cy="6" r="1.6" fill="#ffffff"/><rect x="4.8" y="9" width="2.4" height="10" rx="0.8" fill="#ffffff"/><rect x="10" y="9" width="2.4" height="10" rx="0.8" fill="#ffffff"/><path d="M12.4 13c0-2.4 1.4-4 3.8-4 2.3 0 3.8 1.5 3.8 4.5V19h-2.4v-5.2c0-1.5-.7-2.5-2-2.5-1.4 0-2.6 1-2.6 3V19h-2.4z" fill="#ffffff"/></svg>`;
    case "tiktok":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><path d="M14.6 4.5h2.4c.2 1.8 1.5 3.1 3.1 3.4v2.4c-1.8-.1-3.2-.7-4.4-1.9v5.7a4.8 4.8 0 1 1-4.8-4.8c.3 0 .7 0 1 .1v2.5a2.2 2.2 0 1 0 1.7 2.2z" fill="#ffffff"/></svg>`;
    case "facebook":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><path d="M13.8 20v-6.2h2.1l.4-2.6h-2.5V9.6c0-.8.3-1.4 1.5-1.4H16V5.9c-.3 0-.9-.1-1.8-.1-2.6 0-4 1.4-4 4v1.4H8v2.6h2.4V20z" fill="#ffffff"/></svg>`;
    case "instagram":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><rect x="4.5" y="4.5" width="15" height="15" rx="4" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="16.8" cy="7.8" r="1.1" fill="#ffffff"/></svg>`;
    case "youtube":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><path d="M20 8.8c-.2-1.2-1.1-2.1-2.3-2.3-1.8-.3-3.8-.5-5.7-.5s-3.9.2-5.7.5C5.1 6.7 4.2 7.6 4 8.8c-.3 1.9-.3 4.5 0 6.4.2 1.2 1.1 2.1 2.3 2.3 1.8.3 3.8.5 5.7.5s3.9-.2 5.7-.5c1.2-.2 2.1-1.1 2.3-2.3.3-1.9.3-4.5 0-6.4Z" fill="none" stroke="#ffffff" stroke-width="2"/><path d="M10 9.6v4.8l4-2.4z" fill="#ffffff"/></svg>`;
    case "whatsapp":
      return `<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" style="display:block"><path d="M12 4.8a7.2 7.2 0 0 1 6.2 10.8A7.2 7.2 0 0 1 9.6 18l-4.1 1 1.1-3.8A7.2 7.2 0 0 1 12 4.8Z" fill="none" stroke="#ffffff" stroke-width="2"/><path d="M9.4 9.7c.2 1.1 1.8 2.7 2.9 2.9.6.1 1-.1 1.4-.5l.6-.6 1.3.7-.4 1c-.4.9-1.3 1.4-2.3 1.1-2.1-.6-4.7-3.2-5.3-5.3-.3-1 .2-1.9 1.1-2.3l1-.4.7 1.3-.6.6c-.4.4-.6.8-.4 1.5Z" fill="#ffffff"/></svg>`;
    default:
      return "";
  }
}

function renderSocialFooter(links = {}) {
  const items = [
    { key: "linkedin", href: links.linkedin || APP_URL },
    { key: "tiktok", href: links.tiktok || APP_URL },
    { key: "facebook", href: links.facebook || APP_URL },
    { key: "instagram", href: links.instagram || APP_URL },
    { key: "youtube", href: links.youtube || APP_URL },
    { key: "whatsapp", href: links.whatsapp || APP_URL },
  ];

  const pills = items
    .map(
      (item) => `
        <a href="${escapeHtml(item.href)}" style="display:inline-flex;align-items:center;justify-content:center;margin:0 6px 6px 0;height:24px;width:24px;border-radius:6px;background:#111827;text-decoration:none;">
          ${renderSocialIcon(item.key)}
        </a>
      `
    )
    .join("");

  return `
    <div style="border-top:1px solid #e4e7ec;padding-top:16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td valign="middle" style="font-size:12px;font-weight:700;color:${BRAND.text};white-space:nowrap;">Follow us</td>
          <td width="14"></td>
          <td valign="middle">${pills}</td>
        </tr>
      </table>
    </div>
  `;
}

function renderCardShell(innerHtml) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin:0;padding:0;background:#ececec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${BRAND.text};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="padding:28px 14px;background:#ececec;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;">
            <tr>
              <td style="background:#ffffff;border-radius:22px;overflow:hidden;">
                ${innerHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderResetHero() {
  return `
    <div style="text-align:center;padding:8px 0 20px 0;">
      <svg width="206" height="88" viewBox="0 0 206 88" aria-hidden="true" style="display:inline-block;">
        <g opacity="0.35" fill="#D0D5DD">
          <text x="28" y="46" font-size="22" font-weight="900">*</text>
          <text x="49" y="46" font-size="22" font-weight="900">*</text>
          <text x="148" y="46" font-size="22" font-weight="900">*</text>
          <text x="169" y="46" font-size="22" font-weight="900">*</text>
        </g>
        <g transform="translate(72 4)">
          <path d="M31 12a26 26 0 1 1-18.4 44.3" fill="none" stroke="${BRAND.success}" stroke-width="4" stroke-linecap="round"/>
          <path d="M31 64A26 26 0 0 1 11.6 20.7" fill="none" stroke="${BRAND.success}" stroke-width="4" stroke-linecap="round"/>
          <path d="M38 20v-5l7 5-7 5v-5" fill="${BRAND.success}"/>
          <path d="M24 58v5l-7-5 7-5v5" fill="${BRAND.success}"/>
          <rect x="23" y="28" width="16" height="16" rx="3" fill="none" stroke="${BRAND.success}" stroke-width="4"/>
          <path d="M27 28v-4a4 4 0 0 1 8 0v4" fill="none" stroke="${BRAND.success}" stroke-width="4" stroke-linecap="round"/>
        </g>
      </svg>
    </div>
  `;
}

function renderVerifyHero() {
  return `
    <div style="background:${BRAND.purple};padding:30px 32px 42px 32px;text-align:center;">
      <svg width="78" height="78" viewBox="0 0 78 78" aria-hidden="true" style="display:inline-block;">
        <path d="M39 7 48 11l10-1 4 9 9 4-1 10 4 9-7 7-1 10-10 1-7 7-9-4-10 1-4-9-9-4 1-10-4-9 7-7 1-10 10-1 7-7Z" fill="none" stroke="#111111" stroke-width="4" stroke-linejoin="round"/>
        <path d="m29 39 7 7 14-15" fill="none" stroke="#111111" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <h1 style="margin:18px auto 0 auto;max-width:390px;font-size:34px;line-height:1.2;font-weight:900;color:#111111;">Verify your email to finish signing up!</h1>
    </div>
    <div style="height:18px;background:
      radial-gradient(circle at 9px -1px, transparent 10px, #ffffff 10px) 0 0 / 18px 18px repeat-x;"></div>
  `;
}

function renderEmailLayout({
  headline,
  subtitle = "",
  eyebrow = "",
  bodyHtml,
  ctaLabel = "",
  ctaUrl = "",
  accent = BRAND.purple,
  heroHtml = "",
  footerHtml = "",
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(headline)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${BRAND.text};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.ink};padding:30px 14px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;">
            <tr>
              <td align="center" style="padding-bottom:16px;">
                <img src="${LOGO_URL}" alt="${APP_NAME}" width="52" height="52" style="display:block;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="border-radius:32px;background:linear-gradient(180deg, #ffffff 0%, ${BRAND.background} 100%);padding:1px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius:31px;background:${BRAND.panel};overflow:hidden;">
                  ${heroHtml ? `<tr><td>${heroHtml}</td></tr>` : ""}
                  <tr>
                    <td style="padding:32px 32px 14px 32px;">
                      ${eyebrow ? `<p style="margin:0 0 14px 0;font-size:11px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:${accent};">${escapeHtml(eyebrow)}</p>` : ""}
                      <h1 style="margin:0;font-size:34px;line-height:1.12;font-weight:800;color:${BRAND.text};">${escapeHtml(headline)}</h1>
                      ${subtitle ? `<p style="margin:14px 0 0 0;font-size:16px;line-height:1.7;color:${BRAND.muted};">${escapeHtml(subtitle)}</p>` : ""}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 32px 0 32px;">
                      ${bodyHtml}
                    </td>
                  </tr>
                  ${ctaLabel && ctaUrl ? `
                  <tr>
                    <td style="padding:26px 32px 10px 32px;">
                      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;border-radius:999px;background:${accent};padding:14px 24px;color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;">
                        ${escapeHtml(ctaLabel)}
                      </a>
                    </td>
                  </tr>` : ""}
                  <tr>
                    <td style="padding:22px 32px 30px 32px;">
                      ${footerHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:18px;">
                <p style="margin:0;font-size:12px;line-height:1.65;color:#98a2b3;">${APP_NAME} · Learn faster with subtitles, stories, and saved words</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderSupportBlock(text) {
  return `
    <div style="margin:0 0 18px 0;border-radius:22px;background:#f7f8fc;padding:18px 18px 16px 18px;">
      <p style="margin:0;font-size:14px;line-height:1.75;color:${BRAND.muted};">${text}</p>
    </div>
  `;
}

function renderFooterWithFollowUs(note) {
  return `
    <p style="margin:0 0 16px 0;font-size:13px;line-height:1.75;color:${BRAND.muted};">${note}</p>
    ${renderSocialFooter()}
  `;
}

export function renderPasswordResetEmail({
  recipientName = "Learner",
  resetUrl = `${APP_URL}/reset-password`,
  expiresInMinutes = 30,
} = {}) {
  return renderCardShell(`
    <div style="padding:42px 52px 30px 52px;">
      ${renderResetHero()}
      <h1 style="margin:0 0 28px 0;font-size:34px;line-height:1.15;font-weight:900;color:${BRAND.text};">Forgotten your password?</h1>
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;font-weight:700;color:${BRAND.text};">Hello ${escapeHtml(recipientName)},</p>
      <p style="margin:0 0 28px 0;font-size:16px;line-height:1.8;color:${BRAND.text};">
        We received a request to reset your password for your LingoWatch account. Just click the link below to reset your password.
      </p>
      <a href="${escapeHtml(resetUrl)}" style="display:inline-block;border-radius:12px;background:${BRAND.purple};padding:16px 28px;color:#ffffff;font-size:15px;font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:0.02em;">Reset password</a>
      <p style="margin:34px 0 0 0;font-size:15px;line-height:1.9;color:${BRAND.text};">
        For security purposes, this link will expire in ${escapeHtml(expiresInMinutes)} minutes or after you reset your password.
        If you didn't request a password reset, please ignore this email.
      </p>
      <p style="margin:28px 0 0 0;font-size:15px;line-height:1.8;color:${BRAND.text};">Thank you,<br />LingoWatch.</p>
      <div style="padding-top:38px;">
        ${renderSocialFooter()}
      </div>
    </div>
  `);
}

export function renderWelcomeEmail({
  recipientName = "Learner",
  ctaUrl = `${APP_URL}/dashboard`,
} = {}) {
  return renderCardShell(`
    <div style="padding:36px 32px 28px 32px;text-align:center;">
      <p style="margin:0 0 18px 0;font-size:17px;line-height:1.7;font-weight:800;color:${BRAND.text};">Hello ${escapeHtml(recipientName)},</p>
      <p style="margin:0 auto 10px auto;max-width:470px;font-size:16px;line-height:1.85;color:${BRAND.text};">
        Welcome to the LingoWatch family! We're delighted to have you as part of our community.
        Thanks for trusting us, and here's a little something to get you started:
      </p>
      <p style="margin:0 auto 24px auto;max-width:430px;font-size:16px;line-height:1.85;color:${BRAND.text};">
        As we begin this beautiful journey,<br />you can avail your exclusive welcome gift!
      </p>

      <div style="margin:0 auto 28px auto;max-width:480px;position:relative;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
          <tr>
            <td width="50%" style="background:${BRAND.purple};padding:18px 20px;text-align:center;position:relative;">
              <span style="position:absolute;left:-10px;top:50%;margin-top:-10px;height:20px;width:20px;border-radius:999px;background:#ffffff;display:block;"></span>
              <span style="position:absolute;right:-10px;top:50%;margin-top:-10px;height:20px;width:20px;border-radius:999px;background:#ffffff;display:block;"></span>
              <p style="margin:0;font-size:18px;line-height:1.2;font-weight:800;color:#ffffff;">Get started with</p>
              <p style="margin:8px 0 0 0;font-size:44px;line-height:1;font-weight:900;color:#ffffff;">3</p>
              <p style="margin:8px 0 0 0;font-size:15px;line-height:1.4;font-weight:800;color:#ffffff;">saved words today</p>
            </td>
            <td width="50%" style="background:#f6f7fb;padding:18px 20px;text-align:center;border-left:2px dashed #d9def0;">
              <p style="margin:0 0 10px 0;font-size:16px;line-height:1.4;color:${BRAND.text};">Use code</p>
              <span style="display:inline-block;background:${BRAND.text};padding:10px 14px;border-radius:8px;color:#ffffff;font-size:22px;font-weight:900;letter-spacing:0.04em;">FIRSTSTEP</span>
            </td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 16px 0;font-size:18px;line-height:1.4;font-weight:800;color:${BRAND.text};">Explore Our Best Features:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:500px;margin:0 auto 26px auto;">
        <tr>
          <td width="33.33%" style="padding:0 6px;">
            <div style="border-radius:14px;background:#f3f4f8;padding:10px 8px;">
              <div style="height:100px;border-radius:10px;background:linear-gradient(135deg, #d7d0ff 0%, #b1a6ff 100%);"></div>
              <p style="margin:10px 0 0 0;font-size:14px;font-weight:800;color:${BRAND.text};">Words</p>
            </div>
          </td>
          <td width="33.33%" style="padding:0 6px;">
            <div style="border-radius:14px;background:#f3f4f8;padding:10px 8px;">
              <div style="height:100px;border-radius:10px;background:linear-gradient(135deg, #c8f4ee 0%, #71d8c6 100%);"></div>
              <p style="margin:10px 0 0 0;font-size:14px;font-weight:800;color:${BRAND.text};">Stories</p>
            </div>
          </td>
          <td width="33.33%" style="padding:0 6px;">
            <div style="border-radius:14px;background:#f3f4f8;padding:10px 8px;">
              <div style="height:100px;border-radius:10px;background:linear-gradient(135deg, #d7d0ff 0%, #8b7fff 100%);"></div>
              <p style="margin:10px 0 0 0;font-size:14px;font-weight:800;color:${BRAND.text};">Review</p>
            </div>
          </td>
        </tr>
      </table>

      <p style="margin:0 auto 24px auto;max-width:470px;font-size:16px;line-height:1.8;color:${BRAND.text};">
        We can’t wait to help you find exactly what you need. We’re so happy to have you with us!
      </p>
      <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;border-radius:12px;background:${BRAND.teal};padding:15px 28px;color:#ffffff;font-size:15px;font-weight:900;text-decoration:none;text-transform:uppercase;">Open dashboard</a>
      <p style="margin:28px 0 0 0;font-size:15px;line-height:1.8;color:${BRAND.text};">
        Have questions? Reach out to our friendly support team at<br />
        <span style="font-weight:800;">hello@finalproject.app</span>
      </p>
      <div style="padding-top:36px;">
        ${renderSocialFooter()}
      </div>
    </div>
  `);
}

export function renderVerifyEmail({
  recipientName = "Learner",
  verifyUrl = `${APP_URL}/verify-email`,
  expiresInHours = 48,
} = {}) {
  return renderCardShell(`
    ${renderVerifyHero()}
    <div style="padding:34px 32px 28px 32px;">
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.7;font-weight:700;color:${BRAND.text};">Hello ${escapeHtml(recipientName)},</p>
      <p style="margin:0 0 18px 0;font-size:16px;line-height:1.85;color:${BRAND.text};">
        Welcome to LingoWatch. We're excited to have you with us.
      </p>
      <p style="margin:0 0 22px 0;font-size:16px;line-height:1.85;color:${BRAND.text};">
        To complete your login process, please confirm your email address by clicking on the button below within ${escapeHtml(expiresInHours)} hours.
      </p>
      <a href="${escapeHtml(verifyUrl)}" style="display:inline-block;border-radius:12px;background:${BRAND.teal};padding:16px 26px;color:#ffffff;font-size:15px;font-weight:900;text-decoration:none;text-transform:uppercase;">Verify email address</a>
      <p style="margin:28px 0 0 0;font-size:15px;line-height:1.9;color:${BRAND.text};">
        Don't share this link or email with anyone. If you didn't request verification, you can ignore this.
        For any issues, feel free to reach out at <span style="font-weight:800;">hello@finalproject.app</span>.
      </p>
      <p style="margin:24px 0 0 0;font-size:16px;line-height:1.8;color:${BRAND.text};font-weight:800;">Thank you for choosing LingoWatch!</p>
      <p style="margin:14px 0 0 0;font-size:16px;line-height:1.8;color:${BRAND.text};">Best Regards,<br />LingoWatch.</p>
      <div style="padding-top:36px;">
        ${renderSocialFooter()}
      </div>
    </div>
  `);
}

export function renderAnnouncementEmail({
  headline = "A better way to learn with LingoWatch",
  intro = "We shipped a cleaner, faster experience for your saved words, stories, and listening tools.",
  bullets = [
    "Faster audio playback for saved words and examples",
    "Improved stories experience with resume and restart",
    "Cleaner reading flow across books and saved vocabulary",
  ],
  ctaLabel = "Open LingoWatch",
  ctaUrl = `${APP_URL}/dashboard`,
  signoff = "Thanks for learning with us.",
} = {}) {
  const bulletHtml = bullets
    .map(
      (item) => `
        <tr>
          <td valign="top" style="padding:0 0 10px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td valign="top" style="padding:6px 10px 0 0;">
                  <span style="display:inline-block;height:8px;width:8px;border-radius:999px;background:${BRAND.teal};"></span>
                </td>
                <td style="font-size:15px;line-height:1.7;color:${BRAND.muted};">${escapeHtml(item)}</td>
              </tr>
            </table>
          </td>
        </tr>
      `
    )
    .join("");

  const heroHtml = `
    <div style="padding:28px 32px 0 32px;">
      <div style="border-radius:28px;background:linear-gradient(135deg, ${BRAND.teal} 0%, ${BRAND.purple} 100%);padding:26px 24px 22px 24px;text-align:left;">
        <p style="margin:0 0 8px 0;font-size:11px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;color:#e6fcfb;">Product update</p>
        <h2 style="margin:0;font-size:28px;line-height:1.2;font-weight:800;color:#ffffff;">Fresh improvements for your learning flow</h2>
      </div>
    </div>
  `;

  const bodyHtml = `
    <p style="margin:0 0 18px 0;font-size:15px;line-height:1.75;color:${BRAND.muted};">${escapeHtml(intro)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px 0;">
      ${bulletHtml}
    </table>
    ${renderSupportBlock(escapeHtml(signoff))}
  `;

  return renderEmailLayout({
    heroHtml,
    eyebrow: "Announcement",
    headline,
    subtitle: "Everything important, centered and easy to scan in Gmail.",
    bodyHtml,
    ctaLabel,
    ctaUrl,
    accent: BRAND.teal,
    footerHtml: renderFooterWithFollowUs("You are receiving this because you use LingoWatch."),
  });
}
