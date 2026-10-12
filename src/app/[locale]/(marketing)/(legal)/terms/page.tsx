import Link from 'next/link';
import { studioMetadata } from '@/studio/metadata';
import { websiteConfig } from '@/config/website';
import { purchasedCreditValidityMonths } from '@/credits/policy';

export const metadata = studioMetadata({
  title: 'Burning Bridges AI Terms of Service',
  description:
    'Burning Bridges AI terms for photo permissions, AI videos, one-time credit purchases, refunds, content standards and privacy.',
  path: '/terms',
});

export default function TermsPage() {
  const supportEmail = websiteConfig.legal.supportEmail;
  return (
    <article className="bb-article">
      <Link className="bb-text-link" href="/">
        ← Back to Burning Bridges AI
      </Link>
      <h1>Burning Bridges AI terms of service.</h1>
      <div className="bb-article-meta">Updated October 12, 2026</div>
      <p>
        These Terms of Service ("Terms") govern your access to and use of
        Burning Bridges AI, including our website at burningbridgesai.cc and the
        browser-based video generator on it (collectively, the "Service"). By
        using the Service, you agree to these Terms.
      </p>
      <p>
        Related:{' '}
        <Link
          className="text-[var(--bb-lime)] underline underline-offset-4 hover:brightness-110"
          href="/privacy"
        >
          Privacy Policy
        </Link>
        .
      </p>

      <h2>1. Who we are</h2>
      <p>
        Burning Bridges AI turns a photo into an AI-generated video using a
        selected motion template. It runs in your browser with server-side
        processing; no application download is required. This is an independent
        service, without affiliation, sponsorship or endorsement from Drake,
        Migos, Quavo, COLORS, their labels or the rights holders of music
        associated with the trends. Template names identify the creative trend.
        Contact{' '}
        <a className="bb-text-link" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
        .
      </p>

      <h2>2. Eligibility and account responsibility</h2>
      <p>
        You must be at least 18 and legally able to enter this agreement. Use an
        email address or Google account you control and protect your sign-in
        credentials. You are responsible for your uploads, generation requests
        and use of outputs. Contact support about unauthorized access. Do not
        use the service where doing so violates applicable law or applicable
        supplier restrictions, or evade a previous account suspension.
      </p>

      <h2>3. The video service</h2>
      <p>
        You upload a photo and select a template. Generation currently costs 100
        credits at HD 720p and uses a 20-second template with its soundtrack.
        Generation runs through fal.ai, followed by server-side assembly and
        storage. Template previews illustrate the selected motion, not an
        identical outcome guaranteed for your photo. Output is synthetic
        entertainment: it is AI-generated, not real footage of the person
        performing those actions. Likeness, visual quality, movement and exact
        timing or length can vary. Processing can take longer during outages or
        high demand. We may change templates, models, features or availability
        for future requests.
      </p>

      <h2>4. Access and pricing</h2>
      <p>
        Browsing and local photo preview are free. Generating requires signing
        in and enough purchased credits. Registration and login do not award
        credits. The current cost is shown before generation; a request rejected
        before generation, including insufficient balance, is not charged. We
        may queue, rate-limit or restrict requests to protect capacity, security
        and service availability. Credit packs are one-time purchases, not
        subscriptions, and do not renew automatically.
      </p>

      <h2 id="payment-refunds">5. Billing, credit validity and refunds</h2>
      <p>
        Prices are in US dollars. Waffo processes checkout; review the payment
        total and any disclosed taxes before paying. Purchased credits are
        credited after we verify successful payment. A checkout redirect alone
        does not confirm payment. Buying credits does not automatically start
        generation. Purchased credits are valid for{' '}
        {purchasedCreditValidityMonths} months from purchase. Unused credits
        expire at the end of that period.
        Each purchase has its own expiry date; buying another pack does not
        extend the validity of earlier credits. Any new pack price applies only
        to future purchases. Credits are not cash, are not transferable and
        cannot be resold or redeemed for money except
        through an applicable refund.
      </p>
      <p>
        Completed purchases are final. Except for the exceptions below and
        rights required by law, we do not offer a refund, return or cancellation
        of a completed credit-pack payment, including for unused or partly used
        credits or a change of mind. Successfully generated AI output may differ
        from your expectations; dissatisfaction with its likeness or appearance
        does not by itself qualify for a refund.
      </p>
      <p id="generation-refunds">
        The following situations are handled separately:
      </p>
      <ul>
        <li>
          A generation confirmed to have failed: its original 100 credits are
          returned to your account balance automatically. This is a credit
          return, not a refund to your payment method. Returned credits keep
          their original expiry date; credits that have already expired cannot
          be used again.
        </li>
        <li>
          A successful payment whose purchased credits were not delivered:
          contact support so we can investigate and provide the missing credits
          or reverse the payment.
        </li>
        <li>
          A duplicate payment or an incorrect charge caused by our error:
          contact support so we can verify and correct the charge, including an
          appropriate refund.
        </li>
      </ul>
      <p>
        A pending task, connection interruption or uncertain submission must
        first be checked; it is not automatically treated as failed. If your
        request remains unresolved, contact support with the task ID. Credit
        returns are applied only once per failed generation. Payment refunds
        require billing review and are separate from automatic generation credit
        returns.
      </p>
      <p>
        Nothing here removes any mandatory right to a refund, withdrawal,
        cancellation or remedy for non-delivery that applies where you live.
        Email support to exercise those rights. Accepting the generation terms
        is not an automatic waiver of them. Include your account email and order
        ID when reporting a billing problem; never send your password or full
        card number.
      </p>
      <p>
        Please contact support about billing problems so we can help resolve
        them. If you open a bank or card dispute, we may suspend access and hold
        unused credits while that dispute is investigated, subject to law. This
        does not restrict your statutory right to contact your bank or payment
        provider.
      </p>

      <h2>6. Your photos and permission to process them</h2>
      <p>
        Before generating, you confirm: “I only use photos of myself or of
        people who agreed to appear, and I accept the Terms. The video is
        AI-generated, not real footage.” Permission must cover this AI
        alteration and your intended sharing. You must also have permission to
        use the photograph itself. You may upload photos of consenting people or
        pets. You may upload a child's photo only if you are their parent or
        guardian, subject to the content standards below. Photos of celebrities,
        public figures or other identifiable people require their consent.
      </p>
      <p>
        You retain your rights in uploads. You grant us limited, non-exclusive
        permission to store, transmit and process them to fulfill your request,
        including sending them to our AI suppliers. We may inspect relevant
        records or media to resolve support requests, abuse reports or legal
        obligations. This permission does not transfer ownership of your photo.
        You must not submit material that infringes someone else’s rights.
      </p>
      <p>
        Our server-uploaded photos are scheduled for deletion approximately 24
        hours after upload. Finished videos are available for 14 days after
        creation, then access expires and hourly cleanup removes the files.
        Outages may delay deletion. Download videos you want to keep before
        expiry. These periods cover media in our storage, not copies you
        download or share; task, payment and credit records are separate. File
        expiry does not return credits. We do not sell your uploaded photos or
        use them to train our own models. See the{' '}
        <Link className="bb-text-link" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>

      <h2 id="content-standards">
        7. Content standards and prohibited categories
      </h2>

      <p>
        Burning Bridges AI has one purpose: animating photos of real people who
        agreed to be in them, or of pets, with the motion of our reference
        clips. The six categories below are prohibited outright. They apply to
        what you upload, to what you ask us to generate, to the results we
        return, and to what you then download or share. Prohibited means not
        allowed at all — not allowed with a warning, a disclaimer, or a private
        setting.
      </p>

      <ul>
        <li>
          <strong>Sexual and NSFW content.</strong> No nudity, exposed genitals
          or nipples, sexual acts, sexualized posing, fetish material, or
          lingerie and swimwear presented sexually. Do not upload such a photo,
          and do not ask us to turn an ordinary photo into one — including
          undressing, revealing, or sexualizing the person shown.
        </li>
        <li>
          <strong>Violence and gore.</strong> No wounds, blood, mutilation,
          corpses, self-harm, weapons aimed at a person, or threats of violence,
          and no result that makes a real person look injured, beaten, or dead.
        </li>
        <li>
          <strong>Hate speech.</strong> No content that attacks, dehumanizes,
          mocks, or promotes exclusion of or violence against people based on
          race, ethnicity, national origin, immigration status, religion, caste,
          sex, gender identity, sexual orientation, disability, age, or serious
          illness. This covers hate symbols, slurs, and extremist or terrorist
          propaganda, whether in an image you upload or in text you send us.
        </li>
        <li>
          <strong>
            Content unsafe for children, including child sexual abuse material
            (CSAM).
          </strong>{' '}
          Never upload a sexualized image of a person under 18, and never ask
          for a result that sexualizes, undresses, or otherwise endangers a
          minor. Do not upload a photo of a child unless you are their parent or
          guardian. CSAM is illegal: we remove it immediately, terminate the
          account without notice, preserve the evidence, and report it to law
          enforcement and to NCMEC or the equivalent authority where the law
          requires.
        </li>
        <li>
          <strong>Deepfakes and impersonation.</strong> Do not upload a photo of
          a celebrity, public figure, or any other identifiable person without
          their consent, and do not use a result to impersonate someone, imply
          their endorsement, build a fake identity or profile, or pass an
          AI-edited image off as an authentic photograph where that would
          mislead — news, evidence, journalism, identity verification, dating
          profiles, or fraud of any kind.
        </li>
        <li>
          <strong>Copyright and trademark infringement.</strong> Upload only
          photos you took or are licensed to use. Do not upload another person's
          photograph, artwork, or a stock or watermarked image without
          permission, and do not use the Service to reproduce logos, brand
          marks, trade dress, or protected characters you have no rights to, or
          to suggest a brand partnership that does not exist.
        </li>
      </ul>

      <h2>8. Other prohibited conduct</h2>

      <p>Separately from the content standards above, you agree not to:</p>

      <ul>
        <li>
          Upload photos of other people without the rights or consent needed
          where you live.
        </li>
        <li>
          Use the Service for any other unlawful purpose, or to harass, stalk,
          defame, or extort anyone.
        </li>
        <li>
          Attempt to reverse engineer, scrape, overload, or disrupt the Service
          or its infrastructure.
        </li>
        <li>
          Bypass rate limits, safety filters, security controls, or other
          technical restrictions, including prompt wording chosen to evade the
          content standards, and automated or bulk generation we have not
          authorized.
        </li>
        <li>
          Resell or commercially redistribute generated outputs as a competing
          video-generation service without our written permission.
        </li>
      </ul>

      <h2>9. Reporting violations and moderation</h2>

      <p>
        Report anything that breaks these standards — a result someone has
        shared, a photo of you that another person uploaded, or an account you
        believe is abusing the Service — by emailing{' '}
        <a
          className="text-[var(--bb-lime)] underline underline-offset-4 hover:brightness-110"
          href={`mailto:${supportEmail}`}
        >
          {supportEmail}
        </a>{' '}
        with "Content report" in the subject line. Tell us what you saw, where
        you saw it, and, if you have it, the video or the approximate time it
        was generated. You do not need an account to report something, and a
        report made in good faith is never held against you.
      </p>

      <p>
        We acknowledge reports within 3 business days and tell you the outcome
        once the review is finished. Reports about your own likeness, about a
        deepfake, or about content involving a minor jump the queue and are
        reviewed the same day we see them. For a copyright or trademark
        complaint, use the same address and identify the work or mark, the
        material you want removed, and your contact details, and confirm you are
        the rights holder or authorized to act for them.
      </p>

      <p>
        Moderation works in three layers. First, filtering at generation time:
        every request passes through the safety filters of the AI model and the
        platform that serves it, which refuse prompts and photos falling into
        the prohibited categories, so most violating requests fail before an
        image exists. Second, human review: our team reviews every report we
        receive, along with accounts we see repeatedly tripping the model's
        safety filters or flagged by a payment dispute or a legal request, and
        may open the uploads and results attached to that account for the
        purpose of the review. Third, enforcement: confirmed violations are
        handled under "Enforcement and content removal" below, up to immediate
        termination and a report to the authorities.
      </p>

      <p>
        We do not routinely browse uploads that nobody has reported. Your photos
        stay private, and human review is triggered by one of the events named
        above — not by curiosity or by advertising. If a review leads to action
        against your account, you can appeal it under the enforcement section
        below.
      </p>

      <h2>10. Intellectual property</h2>

      <p>
        The Service, including our branding, site design, software, and
        documentation, is owned by Burning Bridges AI or our licensors and is
        protected by intellectual property laws. These Terms do not transfer
        ownership of any of those rights to you.
      </p>

      <p>
        Subject to these Terms, you may download, post, and share the videos you
        generate for personal, non-commercial purposes, including on social
        media. If you want to use outputs commercially beyond personal promotion
        of your own image, contact us first.
      </p>

      <p>
        The reference motion, any AI-generated soundtrack that imitates a
        reference performance, and any music you add are not licensed to you by
        us. If you post a video with a song or a soundtrack resembling one, use
        the licensed sound library of the platform you post to where it offers
        one, and follow that platform's rules.
      </p>

      <h2>11. Third-party services</h2>
      <p>
        We rely on hosting, storage, AI and payment providers. Our generation
        integration uses fal.ai and its model providers, media storage uses
        Cloudflare R2, and checkout uses Waffo. Your relevant information is
        sent to these providers to fulfill the service. Their applicable terms,
        privacy notices and content restrictions also govern their services.
        Further information is in our{' '}
        <Link className="bb-text-link" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>12. Disclaimers</h2>
      <p>
        To the extent permitted by law, the service is provided as available
        without warranties of uninterrupted operation, fitness for a specific
        purpose, error-free output or non-infringement. Results may contain
        artifacts, and uploads or outputs may become unavailable. We do not
        guarantee a flattering likeness, a particular artistic result or that a
        third-party platform will accept your video. Nothing here removes
        warranties or remedies that the law does not allow us to exclude.
      </p>

      <h2>13. Limits of liability</h2>
      <p>
        Where legally permitted, we exclude liability for indirect or
        consequential losses, lost profits, business opportunities or goodwill.
        Our aggregate liability is limited to the greater of US$50 or what you
        paid us in the three months preceding the claim. These limits do not
        exclude liability that cannot lawfully be excluded, including liability
        for fraud or mandatory consumer remedies. Where a limit is invalid, the
        applicable law determines the permitted extent of liability.
      </p>

      <h2>14. Responsibility for third-party claims</h2>
      <p>
        To the extent allowed by law, you are responsible for third-party
        claims, losses and reasonable legal costs directly caused by your
        unlawful uploads, intentional misuse or violation of these terms. This
        does not make you responsible for our own wrongdoing or override
        non-excludable consumer protections.
      </p>

      <h2>15. Enforcement and content removal</h2>
      <p>
        Depending on the seriousness of a confirmed violation, we may warn you,
        remove or restrict content, limit generation, suspend access or close an
        account. We normally explain the reason where appropriate and legally
        permitted. Illegal activity, child exploitation or a serious threat may
        require immediate action without warning and reporting to authorities,
        including the relevant child-protection reporting body where legally
        required. We preserve necessary evidence that is available to us where a
        legal obligation requires it.
      </p>
      <p>
        If you believe a decision was mistaken, email support within 30 days
        with “Appeal”, the account email, decision and supporting information.
        The appeal is considered separately from the original decision, with a
        reviewer not involved in that decision where practicable, and we
        communicate the outcome. Confirmed mistakes are corrected where
        possible, including restoring access or affected credits. Files already
        deleted under the retention policy may not be recoverable.
      </p>

      <h2>16. Suspension and account closure</h2>
      <p>
        You may stop using the service or request account closure through
        support. We may suspend or close accounts for material violations,
        abuse, fraud or legal requirements. If closure results from your breach,
        unused credits are forfeited and are not refunded except where the law
        requires otherwise. A complaint alone is not proof of a breach. If we
        close the service or your account for other reasons, we provide
        reasonable notice where possible and a fair opportunity to use purchased
        credits or another resolution required by law.
      </p>
      <p>
        Account closure is handled under our privacy policy. Necessary billing,
        dispute, security or legally required records may remain. Obligations
        concerning payments, lawful content claims and other matters that need
        to survive closure continue to that extent.
      </p>

      <h2>17. Changes to these terms</h2>
      <p>
        Updates are published here with a revised date. We communicate material
        changes through the service or another appropriate channel where
        required. Continued use after changes take effect constitutes acceptance
        to the extent allowed by law. Changes do not remove mandatory rights or
        rights already accrued.
      </p>

      <h2>18. General terms</h2>
      <p>
        The law applicable where this service principally operates governs these
        terms, subject to mandatory consumer protections where you reside. Any
        non-excludable right to bring a claim in your local courts remains
        available. These terms and their referenced policies form the agreement
        for the service and replace earlier agreements on the same subject. If
        one provision cannot be enforced, the rest remains effective. Failure to
        enforce a provision on one occasion is not a waiver. You may not
        transfer your contractual rights without our consent; we may transfer
        the service and its obligations through a business transfer, subject to
        applicable law and required notice.
      </p>

      <h2>19. Contact</h2>
      <p>
        Send service, billing, content and appeal questions to{' '}
        <a className="bb-text-link" href={`mailto:${supportEmail}`}>
          {supportEmail}
        </a>
        . For information about your data, retention or deletion requests, read
        our{' '}
        <Link className="bb-text-link" href="/privacy">
          Privacy Policy
        </Link>
        .
      </p>
    </article>
  );
}
