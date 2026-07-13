import { AppProvider, useApp } from './context/AppContext.jsx';
import SessionSetup from './components/SessionSetup.jsx';
import KaraokeRoom from './components/KaraokeRoom.jsx';
import Notification from './components/Notification.jsx';

function AppContent() {
  const { roomId } = useApp();
  return (
    <div className="h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {roomId ? <KaraokeRoom /> : <SessionSetup />}
      <Notification />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
