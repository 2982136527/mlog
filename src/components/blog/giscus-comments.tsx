'use client'

import Giscus from '@giscus/react'

const config = {
  repo: process.env.NEXT_PUBLIC_GISCUS_REPO,
  repoId: process.env.NEXT_PUBLIC_GISCUS_REPO_ID,
  category: process.env.NEXT_PUBLIC_GISCUS_CATEGORY,
  categoryId: process.env.NEXT_PUBLIC_GISCUS_CATEGORY_ID,
  mapping: process.env.NEXT_PUBLIC_GISCUS_MAPPING ?? 'pathname'
}

export function GiscusComments() {
  const enabled = Boolean(config.repo && config.repoId && config.category && config.categoryId)

  if (!enabled) {
    return null
  }

  return (
    <div className='mt-10 rounded-2xl border border-white/60 bg-white/55 p-5 backdrop-blur'>
      <Giscus
        id='comments'
        repo={config.repo as `${string}/${string}`}
        repoId={config.repoId!}
        category={config.category!}
        categoryId={config.categoryId!}
        mapping={config.mapping as 'pathname' | 'url' | 'title' | 'og:title' | 'specific'}
        reactionsEnabled='1'
        emitMetadata='0'
        inputPosition='top'
        theme='light'
        lang='en'
        loading='lazy'
      />
    </div>
  )
}
