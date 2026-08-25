import Link from "next/link";
import { ArrowUp, FileText, ShieldCheck } from "lucide-react";

export type LegalSection = {
  id: string;
  title: string;
  content: React.ReactNode;
};

type LegalDocumentProps = {
  kind: "terms" | "privacy";
  title: string;
  description: string;
  effectiveDate: string;
  updatedDate: string;
  highlights: string[];
  sections: LegalSection[];
};

function Contents({ sections, label }: { sections: LegalSection[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="legal-toc-list">
        {sections.map((section, index) => (
          <li key={section.id}>
            <a href={`#${section.id}`}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              {section.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LegalDocument({ kind, title, description, effectiveDate, updatedDate, highlights, sections }: LegalDocumentProps) {
  const otherHref = kind === "terms" ? "/privacy" : "/terms";
  const otherLabel = kind === "terms" ? "Privacy Policy" : "Terms of Service";
  const Icon = kind === "terms" ? FileText : ShieldCheck;

  return (
    <div className="shell legal-shell" id="document-top">
      <header className="legal-hero">
        <div className="legal-icon" aria-hidden="true"><Icon size={22} /></div>
        <div className="eyebrow">Legal · Teich Forum</div>
        <h1>{title}</h1>
        <p className="legal-dek">{description}</p>
        <dl className="legal-dates">
          <div><dt>Effective</dt><dd>{effectiveDate}</dd></div>
          <div><dt>Last updated</dt><dd>{updatedDate}</dd></div>
        </dl>
      </header>

      <section className="legal-highlights" aria-labelledby={`${kind}-highlights-heading`}>
        <div>
          <div className="eyebrow">At a glance</div>
          <h2 id={`${kind}-highlights-heading`}>The short version</h2>
        </div>
        <ul>{highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}</ul>
        <p className="legal-highlights-note">This summary is for convenience. The complete policy below controls if the summary and full text differ.</p>
      </section>

      <details className="legal-mobile-toc card">
        <summary>On this page <span>{sections.length} sections</span></summary>
        <Contents sections={sections} label={`${title} sections`} />
      </details>

      <div className="legal-layout">
        <aside className="legal-sidebar">
          <div className="eyebrow">On this page</div>
          <Contents sections={sections} label={`${title} sections`} />
          <div className="legal-related">
            <span>Related policy</span>
            <Link href={otherHref}>{otherLabel}</Link>
          </div>
        </aside>

        <article className="legal-article">
          {sections.map((section, index) => (
            <section id={section.id} key={section.id} aria-labelledby={`${section.id}-heading`}>
              <div className="legal-section-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
              <h2 id={`${section.id}-heading`}>{section.title}</h2>
              <div className="legal-copy">{section.content}</div>
            </section>
          ))}

          <div className="legal-end card">
            <div>
              <strong>You reached the end.</strong>
              <p>Review the related {otherLabel.toLowerCase()} or return to the forum.</p>
            </div>
            <div className="legal-end-actions">
              <Link className="button button-secondary" href={otherHref}>{otherLabel}</Link>
              <a className="button button-ghost" href="#document-top"><ArrowUp size={15} aria-hidden="true" /> Back to top</a>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
