import type { Locale } from '@/i18n/config'
import { getDictionary } from '@/i18n/dictionaries'

type PostFallbackNoticeProps = {
  locale: Locale
}

export function PostFallbackNotice({ locale }: PostFallbackNoticeProps) {
  const dict = getDictionary(locale)

  return (
    <div className='mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'>
      {dict.blog.fallbackNotice}
    </div>
  )
}
