import { getBeloBalance } from '@/lib/belo'

export const dynamic = 'force-dynamic'

export async function GET() {
  const balance = await getBeloBalance()
  return Response.json(balance)
}
