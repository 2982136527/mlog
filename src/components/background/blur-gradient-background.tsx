export function BlurGradientBackground() {
  return (
    <div aria-hidden className='pointer-events-none fixed inset-0 -z-10 overflow-hidden'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,#f7c36b_0%,#f7c36b00_45%),radial-gradient(circle_at_90%_15%,#f08f58_0%,#f08f5800_45%),radial-gradient(circle_at_35%_80%,#fbe8c8_0%,#fbe8c800_60%),linear-gradient(160deg,#fff6ea_0%,#fde7d4_42%,#f7dcc8_100%)]' />
      <div className='absolute -top-24 left-[10%] h-72 w-72 animate-drift rounded-full bg-[#ffe2ba]/80 blur-3xl sm:h-96 sm:w-96' />
      <div className='absolute right-[6%] bottom-[8%] h-72 w-72 animate-drift-reverse rounded-full bg-[#f9b58f]/55 blur-3xl sm:h-[26rem] sm:w-[26rem]' />
      <div className='absolute top-[35%] left-[42%] h-56 w-56 animate-pulse-soft rounded-full bg-[#fff0d2]/85 blur-3xl sm:h-72 sm:w-72' />
    </div>
  )
}
