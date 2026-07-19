import { Loading } from '@/components/ui/feedback/Loading'

export default function AdminLoading() {
  return (
    <div className="min-h-[40vh] bg-jl-surface-soft" aria-hidden>
      <Loading />
    </div>
  )
}
