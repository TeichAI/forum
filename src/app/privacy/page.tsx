import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";
import { publicMetadata } from "@/lib/metadata";

export const metadata: Metadata = publicMetadata({ title: "Privacy Policy", description: "How Teich Forum collects, uses, discloses, retains, and protects personal information.", path: "/privacy" });

const EFFECTIVE_DATE = "August 25, 2026";

const sections: LegalSection[] = [
  {
    id: "scope",
    title: "Scope and who is responsible",
    content: <>
      <p>This Privacy Policy explains how TeichAI (<strong>“Teich,” “we,” “us,”</strong> or <strong>“our”</strong>) collects, uses, discloses, and retains personal information when you visit or use Teich Forum, join its waitlist, create an account, communicate with community members, submit a report, or interact with related forum features (collectively, the <strong>“Service”</strong>).</p>
      <p>TeichAI is responsible for the forum-specific processing described here. Some companies that support the Service also process information under their own terms and privacy notices, particularly Clerk for identity and account management, GitHub if you choose social sign-in, UploadThing if forum image uploads are enabled, and our hosting and infrastructure providers.</p>
      <p>This Policy does not govern third-party websites, repositories, model hosts, datasets, or services linked from forum posts or other TeichAI projects with their own notices. It also does not cover information processed solely in an employment or contractor relationship.</p>
    </>,
  },
  {
    id: "collection",
    title: "Information we collect",
    content: <>
      <h3>Information you provide</h3>
      <ul>
        <li><strong>Account and identity information:</strong> email address, username, display name, profile photo, authentication method, and, when requested by our identity provider, first and last name, password, verification status, or multifactor settings. The forum application does not store your password; Clerk processes authentication credentials.</li>
        <li><strong>Profile information:</strong> biography, public-facing name, avatar, role, account status, and account preferences.</li>
        <li><strong>Community content:</strong> threads, replies, tags, mentions, edits, upvotes, dislikes, bookmarks, follows, blocks, and the time associated with those actions.</li>
        <li><strong>Communications:</strong> Teich Mail, waitlist submissions, account and support communications, and information you send when contacting us.</li>
        <li><strong>Safety and moderation information:</strong> reports, reasons, supporting details, appeals, staff notes, case assignments, enforcement actions, suspension details, and related records.</li>
        <li><strong>Files and media:</strong> images you upload to posts, replies, Mail drafts, Mail entries, or your account, together with file name, size, storage key, URL, owner, and upload time.</li>
      </ul>
      <h3>Information collected automatically</h3>
      <ul>
        <li><strong>Technical and device data:</strong> IP address, browser and device type, operating system, referring page, request time, pages or routes requested, and diagnostic or security events. The forum’s rate limiter converts a signed-out visitor’s IP address into a one-way keyed hash and does not persist or log the raw IP in the forum database; infrastructure providers may still process IP addresses in ordinary network and security logs.</li>
        <li><strong>Session and security data:</strong> cookies or similar identifiers, session status, authentication events, bot-detection signals, and rate-limit bucket data used to keep accounts and the Service secure.</li>
        <li><strong>Usage data:</strong> content views, notification state, Mail read and folder state, feature interactions, timestamps, and records needed to deliver requested actions. Discussion view counts may be stored in aggregate with the discussion.</li>
      </ul>
      <h3>Information from others</h3>
      <p>We receive account and authentication data from Clerk; profile or account data from GitHub when you choose GitHub sign-in; upload metadata from UploadThing; information about you that other users include in posts, Mail, mentions, or reports; and security or diagnostic information from infrastructure providers. The data received from a social provider depends on your settings and the permissions shown during connection.</p>
    </>,
  },
  {
    id: "sensitive-information",
    title: "Sensitive information and what not to post",
    content: <>
      <p>Private Mail, account credentials handled by Clerk, precise report details, and some User Content may be considered sensitive under certain laws. Teich Forum is not designed to collect government identification numbers, financial account credentials, health records, precise location, biometric templates, or other regulated sensitive data.</p>
      <p>Please do not post secrets, private keys, passwords, verification codes, confidential datasets, government identifiers, payment-card data, medical records, or another person’s sensitive information. If you voluntarily place personal or sensitive information in a public profile or post, it becomes public and may be copied or used by others outside our control.</p>
    </>,
  },
  {
    id: "uses",
    title: "How we use information",
    content: <>
      <p>We use personal information to:</p>
      <ul>
        <li>create, authenticate, secure, and maintain accounts and waitlist entries;</li>
        <li>display profiles and community content and deliver threads, replies, reactions, follows, bookmarks, Mail, mentions, and notifications;</li>
        <li>store and serve uploads, synchronize account changes, and provide settings and account-deletion controls;</li>
        <li>personalize basic forum state, such as whether content is saved, upvoted, disliked, read, or available to your role;</li>
        <li>detect spam, fraud, abuse, attacks, policy evasion, and unauthorized access; enforce rate limits and access controls; and investigate security incidents;</li>
        <li>receive and investigate reports, document moderation decisions, enforce the <Link href="/terms">Terms of Service</Link>, and protect users, Teich, and the public;</li>
        <li>operate, debug, maintain, measure, and improve the Service and develop new features;</li>
        <li>communicate about verification, invitations, security, service changes, moderation, support, and legal notices;</li>
        <li>comply with law, respond to lawful requests, establish or defend legal claims, and enforce agreements; and</li>
        <li>create aggregated or de-identified information that cannot reasonably identify an individual, which we may use for legitimate purposes.</li>
      </ul>
      <p>We do not use private Mail or forum content to train general-purpose artificial-intelligence models. If that practice changes, we will update this Policy and provide any notice or choice required by law before the new use begins.</p>
    </>,
  },
  {
    id: "legal-bases",
    title: "Legal bases for processing",
    content: <>
      <p>If a law requires us to identify a legal basis, we rely on one or more of the following:</p>
      <ul>
        <li><strong>Contract:</strong> processing needed to provide the Service you request and administer our <Link href="/terms">Terms of Service</Link>, such as maintaining an account or delivering Mail.</li>
        <li><strong>Legitimate interests:</strong> operating and improving the community; securing systems; preventing abuse; moderating content; understanding performance; communicating with users; and protecting legal rights. We consider the impact on your rights before relying on this basis.</li>
        <li><strong>Consent:</strong> when you make an optional choice that legally requires consent, such as connecting an optional service or receiving a type of communication that requires opt-in. You may withdraw consent prospectively.</li>
        <li><strong>Legal obligation:</strong> complying with applicable law, lawful requests, recordkeeping duties, and valid legal process.</li>
        <li><strong>Vital or public interests:</strong> in rare cases, protecting someone’s life, safety, or other vital interests, or performing a task recognized in law.</li>
      </ul>
    </>,
  },
  {
    id: "visibility",
    title: "What is public and what is limited-access",
    content: <>
      <p><strong>Public or community-visible information</strong> can include your username, display name, biography, avatar, role badge, join date, threads, replies, tags, edits, upvote and dislike counts, follower relationships, and other visible community activity. Public pages can be indexed, cached, archived, quoted, or copied by users, search engines, and services outside Teich’s control.</p>
      <p><strong>Account-limited information</strong> includes bookmarks, blocks, account settings, email address, sessions, and authentication details. Access is limited to you, authorized staff, and service providers as necessary for their functions. Administrators may have broader access than moderators where needed for account administration.</p>
      <p><strong>Teich Mail</strong> is visible to the two thread participants and is not end-to-end encrypted. Staff BCC sends independent one-to-one threads; recipients do not see one another. Authorized staff may access limited context around a Mail entry when it is reported, reasonably needed for safety, abuse prevention, support, or system integrity, or required by law. Recipients can save or share Mail, so do not treat it as a secure channel.</p>
      <p><strong>Reports and moderation records</strong> are limited to authorized staff and relevant providers. A person affected by a report may receive enough information to understand and appeal an action, but we generally do not disclose a reporter’s identity unless necessary for fairness, safety, law, or with the reporter’s permission.</p>
    </>,
  },
  {
    id: "disclosures",
    title: "How we disclose information",
    content: <>
      <p>We may disclose personal information in these circumstances:</p>
      <ul>
        <li><strong>To other users and the public:</strong> according to the feature you use and the visibility described above.</li>
        <li><strong>To service providers:</strong> companies that provide identity, hosting, database, storage, uploads, email delivery, security, error monitoring, and technical support. They receive information needed to perform services for us and are expected to protect it.</li>
        <li><strong>At your direction:</strong> when you connect a third-party account, follow an external link, post an externally hosted image, or otherwise ask us to interact with another service.</li>
        <li><strong>For safety and legal reasons:</strong> when we reasonably believe disclosure is necessary to comply with law or valid process; investigate violations; detect or prevent fraud, abuse, or security threats; protect rights, property, or safety; or establish, exercise, or defend legal claims.</li>
        <li><strong>During an organizational change:</strong> in connection with financing, due diligence, a merger, acquisition, reorganization, asset transfer, or similar transaction, subject to appropriate confidentiality and any notice required by law.</li>
        <li><strong>With consent:</strong> for another purpose that we clearly describe and you authorize.</li>
      </ul>
      <p><strong>We do not sell personal information for money. We do not share personal information for cross-context behavioral advertising, and we do not use third-party advertising cookies.</strong> We also do not disclose personal information to data brokers. If those practices change, we will update this Policy and provide legally required choices before beginning them.</p>
    </>,
  },
  {
    id: "providers",
    title: "Service providers and external content",
    content: <>
      <ul>
        <li><strong>Clerk</strong> provides account registration, sign-in, sessions, verification, bot protection, profile images, waitlist or invitation workflows, and connected-account management. Clerk may set cookies and process identifiers, credentials, device, security, and account data.</li>
        <li><strong>GitHub</strong> processes information if you choose GitHub social sign-in or visit a linked repository. The permissions screen controls information shared for sign-in.</li>
        <li><strong>UploadThing</strong> processes uploaded forum images and related file metadata when uploads are enabled. Images may be delivered from UploadThing-controlled domains.</li>
        <li><strong>Infrastructure providers</strong> host the application, database, network, and related systems and may process request metadata and logs to deliver and secure them.</li>
      </ul>
      <p>Posts can include links or images hosted by unrelated third parties. When your browser loads external content, the third party may receive your IP address, browser information, and the page or resource requested and may set its own cookies. Teich does not control those practices. Use caution before opening external links or media.</p>
    </>,
  },
  {
    id: "cookies",
    title: "Cookies and similar technologies",
    content: <>
      <p>We and Clerk use cookies, local storage, or similar technologies that are necessary to keep you signed in, remember security and authentication state, route requests, prevent abuse, and support requested features. Our infrastructure may also use short-lived security or load-balancing identifiers.</p>
      <p>Teich Forum currently does not use advertising cookies or third-party behavioral analytics. You can control cookies through your browser, but blocking necessary cookies may prevent registration, sign-in, security checks, or account features from working. Because we do not sell or share personal information for targeted advertising, Global Privacy Control and “Do Not Track” signals do not change current advertising practices. We will revisit this disclosure if our practices change.</p>
    </>,
  },
  {
    id: "communications",
    title: "Emails and notifications",
    content: <>
      <p>We or Clerk may send service communications such as verification codes, invitations, password or account notices, security alerts, moderation updates, and important policy or service changes. These transactional or relationship messages are part of providing and protecting the Service and may not have a marketing unsubscribe option.</p>
      <p>In-product notifications may be generated by replies, mentions, upvotes, follows, and moderation actions. Dislikes do not generate notifications. Mail has a separate unread-thread count. You may mark notifications and Mail as read and can stop some interactions by blocking another member. If we introduce optional promotional email, we will provide any consent and unsubscribe controls required by law.</p>
    </>,
  },
  {
    id: "retention",
    title: "Retention and account deletion",
    content: <>
      <p>We retain personal information only for as long as reasonably necessary for the purposes described here, including providing the Service, preserving community context, resolving disputes, enforcing rules, maintaining security and audit history, and meeting legal obligations. The period depends on the data, its sensitivity, the feature, user expectations, risk, and legal requirements.</p>
      <ul>
        <li><strong>Account data</strong> is generally retained while the account is active. When you delete your account, Clerk deletes or deactivates identity data according to its processes, and the forum marks the local account deleted and clears its stored email address.</li>
        <li><strong>Public profile and attribution data</strong> such as local user ID, username, display name, and avatar URL may remain after account deletion to preserve authorship, integrity, safety, and moderation history. The public member profile becomes unavailable, but previously published contributions may remain visible unless removed separately.</li>
        <li><strong>Threads and replies</strong> remain until you delete them, staff removes them, or they are no longer needed. Deleted or hidden content may remain available to authorized staff for moderation, appeals, safety, and audit purposes.</li>
        <li><strong>Teich Mail</strong> may remain for thread participants and for safety, integrity, and legal purposes after account deletion. Removing your mailbox copy does not recall the other participant’s copy.</li>
        <li><strong>Reports, staff notes, moderation actions, and security records</strong> may be retained after content or account deletion so we can document decisions, detect repeat abuse, resolve appeals, and protect the Service and community.</li>
        <li><strong>Uploads</strong> may remain while associated content or records are retained. Unused drafts and orphaned files may be deleted as part of maintenance, but you should not use draft storage as a permanent archive.</li>
        <li><strong>Rate-limit, request, and diagnostic records</strong> are kept for the duration needed to enforce limits, investigate failures or abuse, and secure infrastructure. Provider logs and backups expire according to operational schedules and may persist temporarily after deletion from live systems.</li>
      </ul>
      <p>To reduce retained public content, delete individual threads or replies using available controls before deleting your account. We may retain information longer when required by law, subject to a preservation request, or necessary for legal claims, fraud prevention, safety, or enforcing agreements. We may retain aggregated or de-identified data that can no longer reasonably identify you.</p>
    </>,
  },
  {
    id: "security",
    title: "Security",
    content: <>
      <p>We use administrative, technical, and organizational safeguards designed for the nature of the Service, such as managed authentication, signed sessions, role-based access controls, reverification for sensitive account actions, input validation, content sanitization, upload restrictions, rate limiting, webhook signature verification, and limited staff permissions.</p>
      <p>No internet service or storage method is perfectly secure. We cannot guarantee that information will never be accessed, lost, altered, or disclosed improperly. Protect your password and verification methods, use multifactor authentication where available, sign out on shared devices, and tell us promptly about suspected compromise. Do not send vulnerability details through a public forum post; request a private reporting channel.</p>
    </>,
  },
  {
    id: "international",
    title: "International data transfers",
    content: <>
      <p>Teich, its contributors, and its providers may process information in the United States and other countries where they operate. Those countries may have privacy laws different from the laws where you live.</p>
      <p>Where required, we use recognized transfer mechanisms and safeguards, such as adequacy decisions, contractual protections, or provider terms incorporating standard contractual clauses. You may contact us for information about safeguards relevant to your information, subject to necessary confidentiality protections.</p>
    </>,
  },
  {
    id: "choices-rights",
    title: "Your choices and privacy rights",
    content: <>
      <p>Depending on where you live and subject to legal exceptions, you may have the right to:</p>
      <ul>
        <li>know whether we process your personal information and access or receive a copy of it;</li>
        <li>correct inaccurate personal information;</li>
        <li>delete personal information;</li>
        <li>restrict or object to certain processing;</li>
        <li>receive portable data you provided in a structured format;</li>
        <li>withdraw consent without affecting earlier lawful processing;</li>
        <li>opt out of sale, targeted advertising, or certain profiling, if those practices apply;</li>
        <li>appeal a refusal of a privacy request where applicable; and</li>
        <li>complain to your local privacy or data-protection authority.</li>
      </ul>
      <p>You can update profile and account information, manage security methods, remove some content, and delete your account through the Service’s settings. For other requests, send Teich Mail to an administrator or moderator with the subject “Privacy Request.” Describe the request and the account involved, but do not send a password or verification code.</p>
      <p>We may need to verify your identity or authority before acting. An authorized agent may submit a request where law permits, but we may request proof of authorization and direct identity confirmation. We will respond within the period required by applicable law. A right may be limited when information must be retained for security, legal compliance, free expression, the rights of others, or another lawful exception. We will not unlawfully discriminate against you for exercising a privacy right.</p>
    </>,
  },
  {
    id: "us-disclosures",
    title: "United States state privacy disclosures",
    content: <>
      <p>This section supplements the rest of the Policy for residents of U.S. states with comprehensive privacy laws. Whether a particular law applies to Teich depends on its scope and thresholds. The table summarizes categories of personal information we have collected through the Service, their sources, and the business purposes for which they may be disclosed.</p>
      <div className="legal-table-wrap">
        <table>
          <thead><tr><th>Category</th><th>Examples</th><th>Sources and purposes</th></tr></thead>
          <tbody>
            <tr><td>Identifiers</td><td>Email, username, display name, account IDs, IP or hashed rate-limit subject</td><td>You, Clerk, GitHub, devices; account access, community features, security</td></tr>
            <tr><td>Customer-record information</td><td>Name, account and contact information</td><td>You and identity providers; account administration and support</td></tr>
            <tr><td>Internet or network activity</td><td>Sessions, requests, views, interactions, security and diagnostic events</td><td>Devices and providers; service delivery, measurement, debugging, safety</td></tr>
            <tr><td>General geolocation</td><td>Approximate region inferred from IP by infrastructure providers</td><td>Network requests; security, routing, and legal compliance</td></tr>
            <tr><td>Audio, electronic, or visual information</td><td>Profile photos and uploaded images; Mail and posts</td><td>You and other users; profiles, content, communication, moderation</td></tr>
            <tr><td>Professional or educational information</td><td>Details you choose to place in a profile, post, or Mail entry</td><td>You and other users; community discussion and networking</td></tr>
            <tr><td>Inferences</td><td>Spam, abuse, trust, or moderation signals based on activity</td><td>Service activity; security, integrity, and policy enforcement</td></tr>
            <tr><td>Sensitive information</td><td>Account credentials handled by Clerk, Mail contents, or report details where legally classified as sensitive</td><td>You, Clerk, and other users; authentication, communication, safety</td></tr>
          </tbody>
        </table>
      </div>
      <p>We disclose these categories as needed to the recipients described in <a href="#disclosures">How we disclose information</a>, including other users for public content and service providers for operational purposes. We do not sell these categories or share them for cross-context behavioral advertising. We do not knowingly sell or share the personal information of people under 16. We do not offer financial incentives for personal information.</p>
      <p>Where applicable, state residents can request access, correction, deletion, or portability and can appeal a denied request by replying to the decision. Because we do not currently sell personal information, use it for targeted advertising, or conduct legally covered profiling for significant decisions, there is no separate opt-out flow for those practices.</p>
    </>,
  },
  {
    id: "children",
    title: "Children’s privacy",
    content: <>
      <p>The Service is not directed to children under 13, and we do not knowingly collect personal information from them. People under 13 may not create an account or submit information to the Service. If local law requires a higher minimum age for a young person to consent independently, that person may use the Service only with legally valid parent or guardian involvement.</p>
      <p>If you believe a child has provided personal information in violation of this section, contact a Teich administrator or moderator through Teich Mail with enough information for us to identify the account or content. We will investigate and delete or otherwise handle the information as required by law.</p>
    </>,
  },
  {
    id: "third-party-rights",
    title: "Information about other people",
    content: <>
      <p>If you post or send information about another person, you are responsible for having a lawful basis and any permission required to do so. Do not publish private contact information, credentials, intimate material, confidential records, or sensitive personal information about someone else.</p>
      <p>If another user has posted your information, use the report control or contact us with the exact location, the nature of the concern, and information needed to evaluate your request. We balance privacy requests with free-expression, public-interest, safety, recordkeeping, and legal obligations.</p>
    </>,
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: <>
      <p>We may update this Policy to reflect changes in the Service, providers, or law. We will change the “Last updated” date and, if changes are material, provide additional notice reasonably suited to the change, such as a prominent notice or account communication. Where required, we will request consent before applying a new practice to previously collected information.</p>
      <p>For privacy questions, rights requests, or general legal questions, send Teich Mail to an administrator or moderator. Visit your <Link href="/mail">Teich Mail</Link> to continue an existing thread. To start one, open a Teich staff member’s profile and choose <strong>Mail</strong>. Use the subject “Privacy Request,” and do not place sensitive personal information in a public post or report.</p>
      <p>If you are in the European Economic Area, United Kingdom, or Switzerland, you may also lodge a complaint with the data-protection authority where you live, work, or believe a violation occurred. We encourage you to contact us first so we have an opportunity to address the concern.</p>
    </>,
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      kind="privacy"
      title="Privacy Policy"
      description="A detailed map of the information Teich Forum handles, why it is needed, who can see it, and the choices available to you."
      effectiveDate={EFFECTIVE_DATE}
      updatedDate={EFFECTIVE_DATE}
      highlights={[
        "We do not sell personal information or use it for cross-context behavioral advertising.",
        "Profiles and forum posts can be public; Teich Mail is limited-access but is not end-to-end encrypted.",
        "Clerk handles authentication, GitHub handles optional social sign-in, and UploadThing handles optional forum image uploads.",
        "Deleting an account clears the forum’s stored email, but contributions and safety records may remain for context and integrity.",
      ]}
      sections={sections}
    />
  );
}
