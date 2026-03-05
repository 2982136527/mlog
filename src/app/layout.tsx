import type { Metadata } from 'next'
import '@/app/globals.css'
import { Analytics } from '@/components/analytics'
import { getSiteUrl, siteMeta } from '@/lib/site'
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme'

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: siteMeta.name,
    template: `%s | ${siteMeta.name}`
  },
  description: siteMeta.descriptionZh
}

const themeInitScript = `
  (function () {
    try {
      var key = '${THEME_STORAGE_KEY}';
      var value = window.localStorage.getItem(key);
      if (value === 'classic' || value === 'ornate') {
        document.documentElement.dataset.theme = value;
        return;
      }
    } catch (error) {}
    document.documentElement.dataset.theme = '${DEFAULT_THEME}';
  })();
`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='zh-CN' suppressHydrationWarning data-theme={DEFAULT_THEME}>
      <body className='antialiased'>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
