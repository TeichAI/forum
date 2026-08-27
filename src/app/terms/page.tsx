import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument, type LegalSection } from "@/components/legal/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules and conditions that govern access to and use of Teich Forum.",
};

const EFFECTIVE_DATE = "August 25, 2026";

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement to these Terms",
    content: <>
      <p>These Terms of Service (the <strong>“Terms”</strong>) are a binding agreement between you and TeichAI, the operator of Teich Forum (<strong>“Teich,” “we,” “us,”</strong> or <strong>“our”</strong>). They govern your access to and use of the Teich Forum website, accounts, discussions, profiles, Teich Mail, uploads, moderation tools, and related services (collectively, the <strong>“Service”</strong>).</p>
      <p>By visiting the Service, creating an account, joining a waitlist, or otherwise using the Service, you agree to these Terms and acknowledge our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not access or use the Service. If you use the Service for an organization, you represent that you have authority to bind that organization, and “you” includes that organization.</p>
      <p>Some features may display additional rules or requirements. Those feature-specific terms become part of these Terms when you use the feature. If they conflict with these Terms, the more specific terms control for that feature.</p>
    </>,
  },
  {
    id: "eligibility",
    title: "Eligibility and age requirements",
    content: <>
      <p>You must be at least 13 years old to use the Service. If the law where you live requires a higher age to consent to an online service, you may use the Service only with the valid consent of a parent or legal guardian. You must also be legally capable of entering into these Terms and not prohibited from using the Service under applicable law.</p>
      <p>The Service is not directed to children under 13, and they may not create accounts or submit personal information. A parent or guardian who believes a child has used the Service should contact the Teich team through the forum promptly so we can investigate and take appropriate action.</p>
    </>,
  },
  {
    id: "accounts",
    title: "Accounts, access, and security",
    content: <>
      <p>You must provide accurate, current information and keep it updated. You may not impersonate another person, misrepresent your affiliation, create an account for someone without permission, sell or transfer an account, or use an account that has been suspended or terminated. Usernames and display names must not infringe rights, deceive others, or violate these Terms.</p>
      <p>You are responsible for activity under your account and for protecting your credentials and devices. Notify us immediately if you suspect unauthorized access. Authentication is provided through Clerk and may include passwords, verification codes, social sign-in, multifactor authentication, bot protection, and session controls. We may require reverification before sensitive actions.</p>
      <p>Access may be open, invitation-only, or waitlisted. An invitation or waitlist approval is personal, does not guarantee continued access, and may be revoked. We may reclaim usernames, reject registrations, limit account creation, or require additional verification to protect the community and Service.</p>
    </>,
  },
  {
    id: "community-rules",
    title: "Community standards and acceptable use",
    content: <>
      <p>Help keep Teich Forum useful, lawful, and safe. You may disagree strongly, but you must engage in good faith and treat people as people.</p>
      <h3>You may not use the Service to:</h3>
      <ul>
        <li>break the law, encourage unlawful conduct, or facilitate fraud, trafficking, exploitation, or other harm;</li>
        <li>threaten, harass, stalk, bully, defame, shame, or target people with hateful or discriminatory abuse;</li>
        <li>post sexual exploitation material, any sexual content involving minors, non-consensual intimate material, or content that facilitates grooming or abuse;</li>
        <li>promote or coordinate violence, terrorism, credible threats, self-harm, or dangerous conduct;</li>
        <li>publish another person’s private or sensitive information without a lawful basis and appropriate permission;</li>
        <li>impersonate a person or organization, manipulate identity or engagement, or coordinate deceptive activity;</li>
        <li>spam, run scams, distribute malware, phish, advertise deceptively, or post repetitive or irrelevant promotions;</li>
        <li>infringe copyright, trademark, privacy, publicity, confidentiality, contractual, or other rights;</li>
        <li>bypass access controls, probe or exploit vulnerabilities, disrupt the Service, overload infrastructure, or interfere with another user;</li>
        <li>scrape, crawl, harvest, or collect content or personal data at scale without our written permission, except ordinary indexing by public search engines that follow our published controls;</li>
        <li>automate account creation or actions, evade rate limits or moderation, or help a suspended user regain access without permission; or</li>
        <li>use content from the Service to identify, profile, surveil, or make consequential decisions about people without a lawful basis and their permission.</li>
      </ul>
      <p>Context matters. Educational, documentary, scientific, newsworthy, counterspeech, and safety-focused content may be allowed when presented responsibly, but those labels do not excuse conduct that creates an unreasonable risk of harm.</p>
    </>,
  },
  {
    id: "user-content",
    title: "Your content and the license you give us",
    content: <>
      <p><strong>You keep ownership of content you submit.</strong> “User Content” includes threads, replies, profile information, Mail, reports, images, feedback, and other material you provide. You are responsible for your User Content and for having all rights and permissions needed to submit it.</p>
      <p>You grant Teich a worldwide, non-exclusive, royalty-free license to host, store, reproduce, format, adapt for technical purposes, display, perform, and distribute your User Content only as reasonably necessary to operate, secure, improve, and promote the Service. For content you publish publicly, this license includes displaying it to visitors and in previews or examples that promote the Teich community. For private Mail and non-public reports, the license is limited to delivering the feature, safety and moderation, support, legal compliance, and enforcing these Terms.</p>
      <p>This license lasts while your content is available through the Service and for a reasonable period afterward in backups, security records, legal records, and materials already shared outside our control. Removing content does not require others to delete copies they made while it was public. We will not claim ownership of your User Content merely because you post it.</p>
      <p>You represent that your User Content and our permitted use of it do not violate law, these Terms, or anyone else’s rights. Do not submit confidential information, trade secrets, access credentials, regulated data, or material you are not comfortable sharing with the intended audience.</p>
    </>,
  },
  {
    id: "public-private",
    title: "Public posts, Mail, and community interactions",
    content: <>
      <p>Profiles, usernames, display names, biographies, avatars, threads, replies, tags, upvotes, dislikes, follower relationships, and similar community activity may be visible to other users or the public. Public content may be indexed by search engines, quoted, linked, archived, or copied by others.</p>
      <p>Direct Teich Mail is intended for the participants in each private thread, but it is not end-to-end encrypted and is not guaranteed to be confidential. Staff BCC creates separate one-to-one threads. Mail addressed to the shared Staff Mailbox is visible to all current moderators and administrators, including messages sent before a staff member was promoted; staff members who leave those roles lose access. Staff replies identify the moderator or administrator who wrote them. Recipients can copy or share Mail. Authorized staff or service providers may access limited Mail data when it is reported, needed to investigate abuse or a technical issue, required to protect users or the Service, or required by law.</p>
      <p>Mentions, replies, upvotes, follows, reports, and moderation actions can generate notifications. Dislikes do not generate notifications. Mail uses its own unread count. Blocking limits certain interactions but cannot erase prior content, prevent every indirect interaction, or control activity outside the Service.</p>
    </>,
  },
  {
    id: "moderation",
    title: "Moderation, reports, and enforcement",
    content: <>
      <p>We may review, label, move, lock, hide, restore, limit, or remove content; restrict features; suspend or terminate accounts; preserve evidence; and take other proportionate action when we reasonably believe it is necessary to enforce these Terms, protect people or the Service, comply with law, or maintain community quality. We may act on reports or on our own initiative and may use automated signals such as rate limits alongside human review.</p>
      <p>We are not required to monitor all content and cannot guarantee that objectionable material will be removed immediately. Moderation decisions require judgment and may be imperfect. Repeated violations, severe harm, evasion, or risk to others may lead to stronger action without prior warning. Staff roles and permissions do not create employment, agency, or a promise of continued status.</p>
      <p>Use the in-product report feature for content or conduct concerns. Include enough context for a fair review and do not submit knowingly false or abusive reports. If you believe an action was mistaken, send Teich Mail to an administrator or moderator with your username, the affected content or action, and a concise explanation. We may limit repetitive, abusive, or bad-faith appeals.</p>
    </>,
  },
  {
    id: "intellectual-property",
    title: "Teich materials, open source, and feedback",
    content: <>
      <p>The Service, including its design, branding, software, and original content, is owned by Teich or its licensors and is protected by intellectual-property and other laws. Subject to these Terms, we give you a limited, personal, revocable, non-exclusive, non-transferable right to access and use the hosted Service for its intended community purposes.</p>
      <p>Some Teich software, models, datasets, documentation, or other projects may be released under separate open-source or content licenses. Those licenses—not these Terms—govern your use of the separately distributed materials. These Terms still govern the hosted forum and your account.</p>
      <p>If you send ideas, suggestions, or general feedback, you grant us a perpetual, worldwide, royalty-free right to use it without restriction or compensation. This does not give us ownership of your unrelated User Content or confidential information.</p>
    </>,
  },
  {
    id: "copyright",
    title: "Copyright and rights complaints",
    content: <>
      <p>We respect intellectual-property rights. If you believe content on the Service infringes your copyright, use the content’s report control and send Teich Mail to an administrator containing: your forum username; identification of the protected work; the exact location of the allegedly infringing material; a statement of your good-faith belief that the use is unauthorized; a statement, under penalty of perjury, that the notice is accurate and you are authorized to act; and your physical or electronic signature.</p>
      <p>We may forward a complaint to the affected user. If your content was removed by mistake or misidentification, you may send a counter-notice identifying the removed material and explaining your lawful basis to use it. Knowingly material misrepresentations may create liability. Trademark, privacy, or other rights complaints should identify the right, the material, and the requested action with comparable detail.</p>
    </>,
  },
  {
    id: "third-parties",
    title: "Third-party services and links",
    content: <>
      <p>The Service depends on third parties, including Clerk for identity and account services, GitHub when you choose social sign-in, UploadThing when image uploads are enabled, and hosting, database, security, and infrastructure providers. Their products may be governed by separate terms and privacy notices. We are not responsible for third-party services, content, availability, or practices.</p>
      <p>Users may post links, embedded images, code, models, datasets, and other third-party material. A link or integration is not an endorsement. Evaluate third-party material before using it, and use appropriate safeguards before downloading files, running code, or sharing information.</p>
    </>,
  },
  {
    id: "service-changes",
    title: "Service availability and changes",
    content: <>
      <p>We may add, change, limit, suspend, or discontinue any part of the Service. The Service may be unavailable because of maintenance, failures, security events, provider outages, legal requirements, or circumstances outside our control. We do not promise a particular uptime, feature set, storage period, or that content will never be lost.</p>
      <p>You are responsible for keeping copies of content you need. We may set technical limits, archive inactive areas, reject uploads, or remove abandoned drafts. We will try to give reasonable notice of material changes or discontinuation when practical, but urgent security or legal changes may occur without advance notice.</p>
    </>,
  },
  {
    id: "termination",
    title: "Ending use, account deletion, and survival",
    content: <>
      <p>You may stop using the Service at any time and may request account deletion through account settings when available. Before deleting your account, remove public content you do not want to remain, where those controls are available. Account deletion disables access and removes or disconnects certain account data, but it does not necessarily erase all User Content, Mail delivered to others, moderation records, reports, security records, or backups. See the <Link href="/privacy#retention">Privacy Policy’s retention section</Link> for details.</p>
      <p>We may suspend or terminate access if you breach these Terms, create risk or legal exposure, fail to maintain an account, or if we discontinue the Service. Where appropriate, we may give notice or an opportunity to appeal; we are not required to do so when immediate action is reasonably necessary.</p>
      <p>Provisions that by their nature should survive termination do survive, including ownership, content licenses for retained copies, moderation and record retention, disclaimers, limitations of liability, indemnity, disputes, and general terms.</p>
    </>,
  },
  {
    id: "disclaimers",
    title: "Disclaimers",
    content: <>
      <p><strong>THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.”</strong> To the fullest extent permitted by law, Teich and its contributors, moderators, service providers, and licensors disclaim all express and implied warranties, including merchantability, fitness for a particular purpose, title, non-infringement, security, availability, accuracy, and quiet enjoyment.</p>
      <p>Community content reflects its authors’ views, not necessarily Teich’s. We do not verify every claim and do not guarantee that content, code, links, models, datasets, or advice are accurate, safe, lawful, complete, or suitable for your purpose. The Service does not provide legal, medical, financial, safety, or other professional advice. You assume the risks of relying on community content, interacting with users, or running code and files obtained through the Service.</p>
      <p>Some jurisdictions do not allow certain warranty exclusions, so some of the above may not apply to you. Nothing in these Terms excludes a warranty or right that cannot lawfully be excluded.</p>
    </>,
  },
  {
    id: "liability",
    title: "Limitation of liability",
    content: <>
      <p>To the fullest extent permitted by law, Teich and its contributors, moderators, service providers, and licensors will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages; loss of profits, revenue, goodwill, data, or opportunities; or damages arising from content, conduct, unauthorized access, service interruption, or third-party services, even if advised that such damages are possible.</p>
      <p>To the fullest extent permitted by law, the total aggregate liability of Teich and the related parties for all claims arising out of or relating to the Service or these Terms will not exceed the greater of (a) the amount you paid Teich for the Service during the 12 months before the event giving rise to the claim or (b) US $100.</p>
      <p>These limits apply to all theories of liability and allocate risk between you and Teich. They do not limit liability that cannot lawfully be limited, such as liability for fraud, willful misconduct, or personal injury caused by negligence where applicable law prohibits the limitation.</p>
    </>,
  },
  {
    id: "indemnity",
    title: "Responsibility for claims",
    content: <>
      <p>If you use the Service on behalf of a business or organization, that organization will defend, indemnify, and hold harmless Teich and its contributors, moderators, service providers, and licensors from third-party claims, damages, losses, liabilities, and reasonable legal fees arising from its User Content, its misuse of the Service, or its violation of these Terms or another person’s rights.</p>
      <p>This obligation does not apply to the extent a claim results from Teich’s own unlawful conduct, and it is limited wherever applicable law requires. We may control the defense of a covered claim, and you agree to cooperate reasonably. You may not settle a claim in a way that admits fault by or imposes obligations on Teich without our written consent.</p>
    </>,
  },
  {
    id: "disputes",
    title: "Governing law and disputes",
    content: <>
      <p>Before filing a formal claim, you and Teich agree to try in good faith to resolve the dispute informally for at least 30 days after written notice. The notice must describe the issue, relevant account, requested relief, and how to contact the sender. Either party may seek urgent injunctive or protective relief when necessary.</p>
      <p>These Terms are governed by the laws of the jurisdiction where TeichAI is principally established, without regard to conflict-of-law rules, except that mandatory consumer protections in your home jurisdiction remain available. Claims may be brought in a court of competent jurisdiction with authority over the parties and dispute. Nothing in these Terms prevents you from contacting a regulator or using a small-claims process where available.</p>
    </>,
  },
  {
    id: "general",
    title: "General terms",
    content: <>
      <p>These Terms, the <Link href="/privacy">Privacy Policy</Link>, and any applicable feature-specific terms are the entire agreement about the Service. If a provision is unenforceable, it will be limited to the minimum extent necessary and the rest remains effective. Our failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a reorganization, transfer, or operation of the Service.</p>
      <p>Headings and summaries are for convenience. “Including” means “including without limitation.” These Terms do not create a partnership, employment, agency, fiduciary, or third-party-beneficiary relationship. We are not responsible for delay caused by events beyond reasonable control. Electronic notices and records satisfy legal writing requirements where permitted.</p>
    </>,
  },
  {
    id: "changes-contact",
    title: "Changes and contact",
    content: <>
      <p>We may update these Terms as the Service or law changes. We will change the “Last updated” date and, for material changes, provide additional notice reasonably suited to the change, such as a prominent Service notice or account communication. Unless stated otherwise, revised Terms apply when posted. If you continue using the Service after they take effect, you accept the revised Terms.</p>
      <p>Questions, legal notices, copyright complaints, and dispute notices should be sent through Teich Mail to an administrator or moderator. Visit your <Link href="/mail">Teich Mail</Link> to continue an existing thread. To start one, open a Teich staff member’s profile and choose <strong>Mail</strong>. Do not include passwords, verification codes, or unnecessary sensitive information.</p>
    </>,
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      kind="terms"
      title="Terms of Service"
      description="The agreement for using Teich Forum, written to make the important rules understandable without hiding the details."
      effectiveDate={EFFECTIVE_DATE}
      updatedDate={EFFECTIVE_DATE}
      highlights={[
        "You keep ownership of what you create and give us only the license needed to run the forum.",
        "Be lawful, honest, and respectful. Harassment, exploitation, doxxing, scams, malware, and evasion are prohibited.",
        "Public posts are public. Teich Mail is limited-access, but it is not end-to-end encrypted.",
        "We may moderate content and accounts to enforce these rules and protect the community.",
      ]}
      sections={sections}
    />
  );
}
