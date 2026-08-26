import './globals.css';

export const metadata = {
  title: {
    default: 'Birvo | Golf League Operations Platform',
    template: '%s | Birvo',
  },
  description: 'A web-based platform for golf courses to manage leagues, scoring operations, player experiences, and clubhouse publishing from one place.',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-US">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <div id="main-content" tabIndex={-1}>{children}</div>
      </body>
    </html>
  );
}
