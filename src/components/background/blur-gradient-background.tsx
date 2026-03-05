export function BlurGradientBackground() {
  return (
    <div aria-hidden className='pointer-events-none fixed inset-0 -z-10 overflow-hidden'>
      <div className='absolute inset-0' style={{ background: 'var(--bg-gradient-main)' }} />
      <div className='absolute -top-24 left-[10%] h-72 w-72 animate-drift rounded-full blur-3xl sm:h-96 sm:w-96' style={{ background: 'var(--bg-blob-a)' }} />
      <div className='absolute right-[6%] bottom-[8%] h-72 w-72 animate-drift-reverse rounded-full blur-3xl sm:h-[26rem] sm:w-[26rem]' style={{ background: 'var(--bg-blob-b)' }} />
      <div className='absolute top-[35%] left-[42%] h-56 w-56 animate-pulse-soft rounded-full blur-3xl sm:h-72 sm:w-72' style={{ background: 'var(--bg-blob-c)' }} />
      <div className='absolute top-[8%] right-[24%] h-40 w-40 animate-drift-reverse rounded-full blur-3xl sm:h-52 sm:w-52' style={{ background: 'var(--bg-blob-d)' }} />
      <div className='absolute top-[15%] left-[-8%] h-24 w-[44rem] -rotate-12 blur-3xl sm:h-28' style={{ background: 'var(--bg-ribbon-a)' }} />
      <div className='absolute right-[-12%] bottom-[18%] h-20 w-[36rem] rotate-12 blur-3xl sm:h-24' style={{ background: 'var(--bg-ribbon-b)' }} />
      <div className='absolute inset-0' style={{ background: 'var(--bg-glint-overlay)', opacity: 'var(--bg-glint-opacity)' }} />
    </div>
  )
}
