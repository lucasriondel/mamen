import type { Subscription, SubscriptionFrequency } from '@mamen/shared'
import type { BaseRepository } from './base.port'

export type SubscriptionRepository = BaseRepository<Subscription> & {
  getByMerchantId: (merchantId: number) => Promise<Subscription[]>
  getFirstByMerchantId: (merchantId: number) => Promise<Subscription | undefined>
  getByMerchantIdAndFrequency: (merchantId: number, frequency: SubscriptionFrequency) => Promise<Subscription | undefined>
  getByStatus: (status: string) => Promise<Subscription[]>
}
