import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell site-footer-inner">
        <p>Built with the Teich community.</p>
        <nav aria-label="Legal">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
      </div>
    </footer>
  );
}
