import { Spinner } from '@/components/ui/admin-v2'

export default function AdminLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-slate-50">
      <Spinner size="lg" />
    </div>
  )
}
