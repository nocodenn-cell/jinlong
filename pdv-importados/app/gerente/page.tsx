import { redirect } from 'next/navigation'
import { ROUTES } from '@shared-core/navigation/routes'

export default function GerentePage() {
  redirect(ROUTES.admin.dashboard)
}
