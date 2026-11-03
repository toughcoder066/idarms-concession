import { ShieldCheck } from 'lucide-react';

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
    <section className="auth-page" aria-labelledby="auth-title">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-mark"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span>
            <span className="brand-name">iDARMS</span>
            <span className="brand-caption">Concessionaire workspace</span>
          </span>
        </div>
        <h1 id="auth-title">{title}</h1>
        {intro && <p className="muted">{intro}</p>}
        {notice && <p className="auth-alert auth-alert-success" role="status">{notice}</p>}
        {children}
        {footer && <div className="auth-footer">{footer}</div>}
      </div>
    </section>
  );
}
