export const siteMeta = {
  name: 'MLog',
  descriptionZh: 'MLog 是一个双语博客，记录设计、工程和产品思考。',
  descriptionEn: 'MLog is a bilingual blog about design, engineering, and product thinking.'
}

export function getSiteUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!envUrl) {
    return 'http://localhost:3000'
  }

  return envUrl.replace(/\/$/, '')
}
