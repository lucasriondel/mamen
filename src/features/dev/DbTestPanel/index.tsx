import { db, useLiveQuery } from '@/lib/db'
import type { Account } from '@/types'

export function DbTestPanel(): React.ReactElement {
  const accounts = useLiveQuery(() => db.accounts.toArray())
  const transactions = useLiveQuery(() => db.transactions.toArray())

  const handleAddTestAccount = async (): Promise<void> => {
    await db.accounts.add({
      name: `Test Account ${Date.now()}`,
      type: 'checking',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const handleAddTestTransaction = async (): Promise<void> => {
    const firstAccount = await db.accounts.toCollection().first()
    if (!firstAccount?.id) return

    await db.transactions.add({
      accountId: firstAccount.id,
      date: new Date(),
      amount: -(Math.random() * 100).toFixed(2) as unknown as number,
      rawMerchantString: `TEST_MERCHANT_${Date.now()}`,
      importedAt: new Date(),
      importMonth: new Date().toISOString().slice(0, 7),
    })
  }

  const handleClearAll = async (): Promise<void> => {
    await db.accounts.clear()
    await db.transactions.clear()
  }

  return (
    <div style={{ padding: '1rem', fontFamily: 'monospace', fontSize: '14px' }}>
      <h2>DB Test Panel (Dev Only)</h2>
      <p>Use this to verify IndexedDB persistence across browser refresh/close.</p>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={handleAddTestAccount}>Add Test Account</button>
        <button onClick={handleAddTestTransaction}>Add Test Transaction</button>
        <button onClick={handleClearAll}>Clear All</button>
      </div>

      <h3>Accounts ({accounts?.length ?? '...'})</h3>
      <ul>
        {accounts?.map((a: Account) => (
          <li key={a.id}>
            [{a.id}] {a.name} ({a.type})
          </li>
        ))}
      </ul>

      <h3>Transactions ({transactions?.length ?? '...'})</h3>
      <ul>
        {transactions?.map((t) => (
          <li key={t.id}>
            [{t.id}] Account#{t.accountId} — {t.rawMerchantString} — ${t.amount}
          </li>
        ))}
      </ul>
    </div>
  )
}
