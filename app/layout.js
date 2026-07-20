import './globals.css';
import RegisterServiceWorker from './register-sw';

export const metadata = {
  title: 'Household Bills',
  description: 'Split household bills fairly, as membership changes over time.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Bills',
  },
};

export const viewport = {
  themeColor: '#16303A',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="font-sans">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
