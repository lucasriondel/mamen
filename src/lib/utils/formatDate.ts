export const formatDate = (date: Date): string => {
  const now = new Date()
  const isCurrentYear = date.getFullYear() === now.getFullYear()

  if (isCurrentYear) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
