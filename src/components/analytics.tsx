import Script from 'next/script'

const scriptUrl = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL
const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID

export function Analytics() {
  const enabled = process.env.NODE_ENV === 'production' && Boolean(scriptUrl) && Boolean(websiteId)

  if (!enabled) {
    return null
  }

  return <Script defer src={scriptUrl} data-website-id={websiteId} strategy='afterInteractive' />
}
