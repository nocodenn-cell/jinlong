import { redirect } from 'next/navigation'
import { ROUTES } from '@/lib/navigation/routes'

export default function AdminIndexPage() {
  redirect(ROUTES.admin.dashboard)
}
