import { BrandMark } from '@/components/brand-mark';

export function AuthCard({
  title,
  intro,
  notice,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  notice?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="auth-page" aria-labelledby="auth-title">
      <div className="auth-card">
        <div className="auth-brand"><BrandMark /></div>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="muted">{intro}</p>}
        {notice && <p className="auth-alert auth-alert-success" role="status">{notice}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
      <p className="auth-legal">For authorised concessionaire staff only.</p>
    </main>
  );
}
