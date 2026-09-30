import { redirect } from 'next/navigation'
import { ROUTES } from '@/lib/navigation/routes'

export default function GerentePage() {
  redirect(ROUTES.admin.dashboard)
}
