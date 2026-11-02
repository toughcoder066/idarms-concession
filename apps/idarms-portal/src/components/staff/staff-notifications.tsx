import { Bell, Clock3, ShieldCheck } from 'lucide-react';
import type { StaffNotification } from '@/lib/staff';

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function StaffNotifications({
  notifications,
  title,
  description,
}: {
  notifications: StaffNotification[];
  title: string;
  description: string;
}) {
  return (
    <section className="directory-card staff-notifications">
      <div className="directory-heading">
        <div className="directory-title">
          <span className="directory-title-icon"><Bell size={17} aria-hidden="true" /></span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
        <span className="staff-notification-count"><Clock3 size={12} aria-hidden="true" /> {notifications.length}</span>
      </div>
      {notifications.length === 0 ? (
        <div className="staff-notification-empty">
          No Super Admin activity has been recorded for this assembly yet.
        </div>
      ) : (
        <ul className="staff-notification-list">
          {notifications.slice(0, 10).map((notification) => (
            <li key={notification.id}>
              <span className="staff-notification-icon"><ShieldCheck size={14} aria-hidden="true" /></span>
              <div>
                <strong>{notification.message}</strong>
                <small>
                  {notification.actorRole.replaceAll('_', ' ').toLowerCase()}
                  {notification.targetRole ? ` · ${notification.targetRole.replaceAll('_', ' ').toLowerCase()}` : ''}
                  {' · '}{formatTimestamp(notification.createdAt)}
                </small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
