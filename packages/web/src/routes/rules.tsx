import { createFileRoute } from '@tanstack/react-router'
import { RulesPage } from '@/features/rules'

export const Route = createFileRoute('/rules')({
  component: RulesPage,
})
