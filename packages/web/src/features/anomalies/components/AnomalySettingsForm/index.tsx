import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { settingsApi, queryKeys, invalidateEntity } from '@/lib/api'
import { detectHighAmountAnomalies, getAnomalySettings } from '../../services/anomalyDetector'
import type { AnomalySettings } from '@/types'

const DEFAULT_SETTINGS: AnomalySettings = {
  multiplierThreshold: 2,
  absoluteThreshold: null,
  minTransactionsForDetection: 5,
}

export function AnomalySettingsForm(): React.ReactElement {
  // Use array wrapper to distinguish loading (undefined) from no result (empty array)
  const { data: settingsResult, isLoading } = useQuery({
    queryKey: [...queryKeys.settings.all, 'anomaly_settings'],
    queryFn: () => settingsApi.getByKey('anomaly_settings' as any).then(s => [s]).catch(() => []),
  })
  const storedSetting = settingsResult?.[0]

  const currentSettings: AnomalySettings = storedSetting?.value
    ? (() => { try { return JSON.parse(storedSetting.value) } catch { return DEFAULT_SETTINGS } })()
    : DEFAULT_SETTINGS

  const [multiplier, setMultiplier] = useState('')
  const [absolute, setAbsolute] = useState('')
  const [minTx, setMinTx] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!isLoading && !initialized) {
      setMultiplier(String(currentSettings.multiplierThreshold))
      setAbsolute(currentSettings.absoluteThreshold != null ? String(currentSettings.absoluteThreshold) : '')
      setMinTx(String(currentSettings.minTransactionsForDetection))
      setInitialized(true)
    }
  }, [isLoading, currentSettings, initialized])

  const handleSave = useCallback(async () => {
    const multiplierVal = parseFloat(multiplier)
    const absoluteVal = absolute.trim() === '' ? null : parseFloat(absolute)
    const minTxVal = parseInt(minTx, 10)

    if (isNaN(multiplierVal) || multiplierVal < 1) {
      toast.error('Multiplier threshold must be at least 1')
      return
    }
    if (absoluteVal !== null && (isNaN(absoluteVal) || absoluteVal <= 0)) {
      toast.error('Absolute threshold must be a positive number')
      return
    }
    if (isNaN(minTxVal) || minTxVal < 3 || minTxVal > 20) {
      toast.error('Min transactions must be between 3 and 20')
      return
    }

    const newSettings: AnomalySettings = {
      multiplierThreshold: multiplierVal,
      absoluteThreshold: absoluteVal,
      minTransactionsForDetection: minTxVal,
    }

    const existing = await settingsApi.getByKey('anomaly_settings' as any).catch(() => undefined)
    if (existing) {
      await settingsApi.putByKey({ ...existing, value: JSON.stringify(newSettings) })
    } else {
      await settingsApi.putByKey({ key: 'anomaly_settings' as any, value: JSON.stringify(newSettings) })
    }

    invalidateEntity('settings')
    toast.success('Anomaly settings saved')

    // Re-run detection with new thresholds
    detectHighAmountAnomalies().then(result => {
      invalidateEntity('transactions')
      if (result.flagged > 0) {
        toast.info(`${result.flagged} transaction(s) flagged with new thresholds`)
      }
    })
  }, [multiplier, absolute, minTx])

  if (isLoading) {
    return <div className="text-muted-foreground">Loading...</div>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Anomaly Detection</CardTitle>
        <CardDescription>
          Configure thresholds for flagging unusual transactions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="multiplier-threshold">Multiplier threshold</Label>
          <div className="flex items-center gap-2">
            <Input
              id="multiplier-threshold"
              type="number"
              min="1"
              step="0.5"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="w-24"
            />
            <span className="text-sm text-muted-foreground">x average</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Flag transactions exceeding this multiple of the category average
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="absolute-threshold">Absolute threshold (optional)</Label>
          <div className="flex items-center gap-2">
            <Input
              id="absolute-threshold"
              type="number"
              min="0"
              step="50"
              value={absolute}
              onChange={(e) => setAbsolute(e.target.value)}
              placeholder="e.g., 500"
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">EUR</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Flag any transaction above this amount, leave empty to disable
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="min-transactions">Min. transactions for detection</Label>
          <Input
            id="min-transactions"
            type="number"
            min="3"
            max="20"
            value={minTx}
            onChange={(e) => setMinTx(e.target.value)}
            className="w-24"
          />
          <p className="text-xs text-muted-foreground">
            Categories need this many transactions before anomalies are detected
          </p>
        </div>

        <Button onClick={handleSave}>Save</Button>
      </CardContent>
    </Card>
  )
}
