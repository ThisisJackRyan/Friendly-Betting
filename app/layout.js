import '../src/App.css';
import '../src/base.css';
import '../src/phone/phone.css';

export const metadata = {
  title: 'Friendly Bets',
  description: 'Friendly bets with friends. Text a link, vote once, settle it.',
  applicationName: 'Friendly',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/logo192.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Friendly',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f7f5',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <div className="app-frame">{children}</div>
      </body>
    </html>
  );
}
