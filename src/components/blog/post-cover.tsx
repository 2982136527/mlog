import Image from 'next/image'
import { isAllowedPublicMediaUrl } from '@/lib/media/public-url'

type PostCoverProps = {
  src?: string
  alt: string
  priority?: boolean
  className?: string
  trusted?: boolean
}

export function PostCover({ src, alt, priority = false, className = '', trusted = false }: PostCoverProps) {
  if (!src || (!trusted && !isAllowedPublicMediaUrl(src))) {
    return null
  }

  return (
    <div className={`relative overflow-hidden bg-white/45 ${className}`}>
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes='(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 720px'
        className='object-cover'
        unoptimized={src.toLowerCase().endsWith('.svg')}
      />
    </div>
  )
}
