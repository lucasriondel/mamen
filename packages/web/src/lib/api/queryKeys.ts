export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    detail: (id: number) => ['accounts', id] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (params: object) => ['transactions', 'list', params] as const,
    detail: (id: number) => ['transactions', id] as const,
    count: (params?: object) => ['transactions', 'count', params] as const,
  },
  merchants: {
    all: ['merchants'] as const,
    list: (params?: object) => ['merchants', 'list', params] as const,
    detail: (id: number) => ['merchants', id] as const,
  },
  rules: {
    all: ['rules'] as const,
    list: (params?: object) => ['rules', 'list', params] as const,
    detail: (id: number) => ['rules', id] as const,
    count: (params?: object) => ['rules', 'count', params] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: (params?: object) => ['categories', 'list', params] as const,
    detail: (id: number) => ['categories', id] as const,
  },
  subscriptions: {
    all: ['subscriptions'] as const,
    list: (params?: object) => ['subscriptions', 'list', params] as const,
    detail: (id: number) => ['subscriptions', id] as const,
  },
  settings: {
    all: ['settings'] as const,
  },
  appSettings: {
    all: ['appSettings'] as const,
  },
}
