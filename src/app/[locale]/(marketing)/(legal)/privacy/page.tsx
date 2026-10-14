import { RouteLink as Link } from '@/components/layout/locale-link';
import { studioMetadata } from '@/studio/metadata';
import { paymentProviderLegalLabel as paymentProviderLabel, websiteConfig } from '@/config/website';

export const metadata = studioMetadata({
  title: 'Burning Bridges AI Privacy Policy',
  description:
    `How Burning Bridges AI handles account information, photo uploads, AI videos, ${paymentProviderLabel} payments, media storage and 14-day video access.`,
  path: '/privacy',
  noIndex: true,
});

export default function PrivacyPage() {
  const supportEmail = websiteConfig.legal.supportEmail;
  const policyLinkClassName =
    'text-[var(--bb-lime)] underline underline-offset-4 hover:brightness-110';

  return (
    <article className="bb-article">
      <Link className="bb-text-link" href="/">
        ← Back to Burning Bridges AI
      </Link>
      <h1>Burning Bridges AI privacy policy.</h1>
      <div className="bb-article-meta">Updated October 14, 2026</div>
      <p>
        This Privacy Policy explains how Burning Bridges AI collects, uses and
        shares your information when you use burningbridgesai.cc and its
        browser-based video generator (the "Service").
      </p>
      <p>
        Related:{' '}
        <Link className={policyLinkClassName} href="/terms">
          Terms of Service
        </Link>
        .
      </p>

      <h2>1. Who we are</h2>
      <p>
        Burning Bridges AI provides the video generator at burningbridgesai.cc.
        You upload a photo, choose a template and receive an AI-generated video.
        For questions about your information or requests to access or delete it,
        email{' '}
        <a className={policyLinkClassName} href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
        .
      </p>

      <h2>2. Information we collect</h2>
      <p>
        You can browse without an account. You need to sign in to generate a
        video. We collect the information needed for the features you use:
      </p>
      <ul>
        <li>
          Account details: your name, email address and a password hash if you
          register by email. We do not store your password in plain text. If you
          use Google sign-in, we receive your Google account identifier, name,
          email address and profile photo.
        </li>
        <li>
          Generation details: the photo you submit, your template and quality
          selection, generated videos, task identifiers, processing status and a
          photo hash used to identify the uploaded file.
        </li>
        <li>
          Purchase details: your credit pack, amount, currency, order and
          payment identifiers, payment status and credit transaction history.
          {paymentProviderLabel} handles payment details at checkout. We do not store full card
          numbers.
        </li>
        <li>
          Technical details: requests to our website and infrastructure may
          include your IP address, browser and device information, pages
          requested and timestamps. We also store account session and
          password-reset information.
        </li>
        <li>
          Messages you send us, including support requests, billing questions
          and reports about content or accounts.
        </li>
      </ul>
      <p>
        Selecting a photo first previews it on your device. Selection alone does
        not send it to the video generator. A local browser draft can save your
        photo and selection while you sign in or complete checkout. Section 7
        explains how these drafts work.
      </p>

      <h2>3. How we use information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>
          Create and manage your account, keep you signed in and reset
          passwords.
        </li>
        <li>Generate, store and deliver the videos you request.</li>
        <li>
          Add purchased credits after payment is confirmed, record their use and
          return credits when a generation qualifies under our Terms.
        </li>
        <li>Respond to questions, deletion requests and content reports.</li>
        <li>
          Protect accounts and payments, investigate abuse and enforce our
          content rules. An authorized person may review relevant uploads,
          videos or account records when investigating a report or suspected
          violation.
        </li>
        <li>Meet legal obligations and resolve billing or legal disputes.</li>
      </ul>
      <p>
        We do not publish your photos or finished videos in a public gallery
        without your permission. Where applicable law requires a legal basis, we
        rely on providing the Service you requested, meeting legal obligations
        and our legitimate interests in security and preventing abuse. For uses
        that require consent, we ask for that consent separately.
      </p>

      <h2>4. Photos and AI processing</h2>
      <p>
        We use your photo to make the video you request. We do not use uploaded
        photos to train our own AI models, build facial-recognition systems,
        verify identities or create profiles for sale. We do not sell your
        photos.
      </p>
      <p>
        After you submit a photo, our server prepares it for generation and
        removes embedded metadata, including location data. The processed photo
        is stored privately in Cloudflare R2. We give fal.ai a time-limited link
        to the photo and send the selected reference clips and generation
        settings. fal.ai and the model provider receive these inputs to generate
        your video. We combine the generated parts with the template audio and
        save the finished video in our storage.
      </p>
      <p>
        The AI provider applies its own content rules and may reject a request
        through its safety filters. We receive the task status and may review
        reported content or repeated refusals under our{' '}
        <Link className={policyLinkClassName} href="/terms#content-standards">
          content standards
        </Link>
        . Generated videos are synthetic. They are not real recordings of the
        person performing the actions shown. Only submit photos you have the
        right and permission to use for this purpose.
      </p>

      <h2>5. Storage and retention</h2>
      <p>
        Uploaded photos and finished videos are stored privately. Finished
        videos are available for 14 days after creation, then access expires.
        Uploaded photos and per-generation reference files are scheduled for
        automatic deletion under our storage lifecycle rules one day after
        upload. Finished video files are scheduled for deletion 15 days after
        upload, allowing a buffer beyond the download period. Storage deletion
        is asynchronous and may occur later than the scheduled expiry.
        Download any video you want to keep before access expires.
      </p>
      <p>
        Our media storage is private. Opening a video through your account
        requires sign-in and an ownership check. Playback and downloads use
        short-lived signed links. Anyone who receives one of those links can
        open it until it expires, so avoid sharing it unintentionally. Our
        retention periods do not apply to copies you download or share
        elsewhere.
      </p>
      <p>
        You can ask us to delete an uploaded photo or generated video by
        emailing support. We will delete the relevant file and remove access
        from your account, unless a limited copy must be kept for security, an
        abuse investigation or a legal requirement. We will explain any such
        exception.
      </p>
      <p>
        Account, purchase, credit and support records are separate from media
        files. We keep them for as long as needed to operate your account,
        handle payments and disputes, protect the Service or meet legal
        requirements. Deleting a photo or video does not automatically delete
        its billing record.
      </p>

      <h2>6. When we share information</h2>
      <p>
        We share information needed to provide the Service, handle the
        situations below or comply with the law:
      </p>
      <ul>
        <li>
          Website and database hosting providers, which deliver the site and
          store account, task and transaction records.
        </li>
        <li>
          Cloudflare R2, which stores uploaded photos and finished videos.
        </li>
        <li>
          Google, if you choose Google sign-in, to authenticate your account.
        </li>
        <li>Resend, which delivers account and password-reset emails.</li>
        <li>fal.ai and its model providers, which generate your video.</li>
        <li>
          {paymentProviderLabel}, which processes credit purchases and payment status updates.
        </li>
        <li>
          Professional advisers or authorities when needed to meet legal
          obligations, resolve claims, enforce our Terms or protect rights and
          safety.
        </li>
        <li>
          A buyer or successor if ownership of the Service changes through a
          merger, acquisition or sale. We will provide any notice required by
          applicable law.
        </li>
      </ul>
      <p>
        Service providers receive information relevant to their work. We do not
        sell your personal information. Optional analytics and session replay
        are not currently enabled; Section 7 explains our approach to these
        technologies.
      </p>

      <h2>7. Cookies and similar technology</h2>
      <p>
        We use session cookies to recognize your account and keep you signed in.
        Our hosting providers may also use cookies needed to deliver pages and
        protect the Service. You can block or clear cookies in your browser, but
        blocking session cookies prevents sign-in from working.
      </p>
      <p>
        Local photo drafts are saved in browser storage on your device. A draft
        expires after 24 hours and is deleted when the studio next reads it. It
        is also cleared after submission or when you remove it. Closing your
        browser does not immediately delete the draft. You can clear the site's
        stored data in your browser settings.
      </p>
      <p>
        We do not currently enable optional analytics, advertising trackers or
        session replay. If we introduce tools such as Google Analytics or
        Microsoft Clarity, we will explain what they collect and why, update
        this Policy and obtain consent where required before using them. We do
        not treat agreement to our Terms as consent to optional tracking.
      </p>

      <h2>8. Your choices and rights</h2>
      <p>
        You can browse without an account, sign out from the site header and
        choose not to submit photos. You can download your videos while they
        remain available. To close your account, delete stored Google profile
        information or request deletion of a photo or video, email support.
        Account deletion is currently handled through support.
      </p>
      <p>
        Depending on applicable law, you may have rights to access, correct or
        delete your personal information, receive a copy, restrict its use or
        object to certain processing. Where processing relies on consent, you
        may withdraw it. Withdrawal does not affect processing that was already
        lawful before you withdrew consent. You may also have the right to
        complain to a data-protection authority.
      </p>
      <p>
        Tell us what you need and provide enough information to find the
        relevant account or file, such as your account email, task identifier or
        the approximate generation date. We may need to verify your connection
        to the account or content before acting. If we cannot locate your
        information, we will explain what else we need. If a legal, billing or
        security requirement limits deletion, we will explain that too. You do
        not need an active credit balance to make a privacy request.
      </p>

      <h2>9. Children</h2>
      <p>
        Only adults aged 18 or older may use Burning Bridges AI. A child's photo
        may be submitted only by their parent or guardian and must comply with
        our content standards. Sexualized images of minors and any content that
        exploits or endangers a child are prohibited. If you believe a child is
        using the Service or a child's information or photo was submitted in
        violation of these rules, contact support so we can investigate, remove
        the content and take any action required by law.
      </p>

      <h2>10. International processing</h2>
      <p>
        Our providers may process information outside your country, where
        data-protection laws may differ. We use providers to operate the Service
        and generate the videos you request. Where applicable law requires
        safeguards for international transfers, the transfer must meet those
        requirements. Contact support if you have a question about where your
        information is processed or the safeguards that apply.
      </p>

      <h2>11. Security</h2>
      <p>
        We use technical and organizational measures to protect your
        information, including password hashing, account access controls,
        private media storage and short-lived access links. We remove embedded
        metadata from photos on our server before sending them for AI
        processing. No method of online transmission or storage is completely
        secure. Keep your account credentials and video links private.
      </p>

      <h2>12. Changes to this Policy</h2>
      <p>
        We may update this Policy when the Service or our data practices change.
        We will revise the date at the top of this page and provide additional
        notice of material changes where required by law.
      </p>

      <h2>13. Contact</h2>
      <p>
        For privacy questions, account closure or requests to access, correct or
        delete your information, email{' '}
        <a className={policyLinkClassName} href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
        . For payment and refund rules, see our{' '}
        <Link className={policyLinkClassName} href="/terms#payment-refunds">
          Terms of Service
        </Link>
        .
      </p>
    </article>
  );
}
