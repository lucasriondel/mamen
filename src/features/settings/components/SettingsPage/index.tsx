import { Settings } from 'lucide-react'
import { LLMConfigForm } from '../LLMConfigForm'
import { AnomalySettingsForm } from '@/features/anomalies/components/AnomalySettingsForm'
import { DataExport } from '../DataExport'

export function SettingsPage(): React.ReactElement {
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6" />
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>

      <div className="space-y-6 max-w-2xl">
        <LLMConfigForm />
        <AnomalySettingsForm />
        <DataExport />
      </div>
    </div>
  )
}
