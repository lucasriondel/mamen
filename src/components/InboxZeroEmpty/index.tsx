import { CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from '@tanstack/react-router'

export function InboxZeroEmpty(): React.ReactElement {
  return (
    <div
      role="status"
      className="flex flex-col items-center justify-center py-16 px-4"
    >
      <CheckCircle className="h-16 w-16 text-green-500 mb-4" />
      <h2 className="text-2xl font-semibold mb-2">All caught up!</h2>
      <p className="text-muted-foreground mb-6">
        No unmatched transactions. Great job!
      </p>
      <Button asChild>
        <Link to="/">View Dashboard</Link>
      </Button>
    </div>
  )
}
