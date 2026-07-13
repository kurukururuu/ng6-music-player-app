import { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';

const STYLES = {
  success: 'bg-green-500 text-white',
  error:   'bg-red-500 text-white',
  warning: 'bg-yellow-500 text-white',
  info:    'bg-primary-500 text-white',
};

const ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

export default function Notification() {
  const { notification, clearNotification } = useApp();

  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(clearNotification, 3000);
    return () => clearTimeout(t);
  }, [notification, clearNotification]);

  if (!notification) return null;

  const style = STYLES[notification.type] ?? STYLES.info;
  const icon  = ICONS[notification.type]  ?? ICONS.info;

  return (
    <div
      className={`
        fixed bottom-5 left-1/2 -translate-x-1/2 z-50
        flex items-center gap-2
        px-4 py-2.5 rounded-xl shadow-xl
        text-sm font-medium
        animate-fade-in
        ${style}
      `}
      role="status"
      aria-live="polite"
    >
      <span className="font-bold">{icon}</span>
      {notification.message}
    </div>
  );
}
