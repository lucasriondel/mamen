export type SettingKey =
  | 'llm_endpoint'
  | 'llm_api_key'
  | 'llm_model'
  | 'currency_symbol'
  | 'date_format'
  | 'anomaly_threshold'

export type Setting = {
  id?: number
  key: SettingKey
  value: string
}
