import dayjs from 'dayjs';
import { salesQueries } from '../db/sales';
import { productQueries } from '../db/products';
import { getSetting } from '../db/settings';

export type InsightType = 'highlight' | 'trend' | 'alert' | 'recommendation';

export interface Insight {
  type: InsightType;
  title: string;
  insight: string;
}

export async function getApiKey(): Promise<string | null> {
  return getSetting('anthropic_api_key');
}

export async function generateInsights(businessName: string): Promise<Insight[]> {
  const apiKey = await getApiKey();
  if (!apiKey?.trim()) throw new Error('No API key set. Add your Anthropic API key in Settings → Integrations.');

  const today = dayjs().format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');

  const [summary, topProducts, trend, outOfStock, lowStock, expiring] = await Promise.all([
    salesQueries.getDailySummary(today),
    salesQueries.getTopProducts(weekStart, today, 5),
    salesQueries.getRevenueTrend(7),
    productQueries.getOutOfStock(),
    productQueries.getLowStock(),
    productQueries.getExpiring(30),
  ]);

  const trendLines = (trend ?? [])
    .map((t) => `  ${dayjs(t.date).format('ddd D MMM')}: KES ${t.revenue.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`)
    .join('\n') || '  No data';

  const topLines = (topProducts ?? [])
    .map((p, i) => `  ${i + 1}. ${p.product_name} — ${p.total_qty} sold, KES ${p.total_revenue.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`)
    .join('\n') || '  No sales this week';

  const prompt = `You are a business analyst for a small retail shop in Kenya. Analyze this data and return exactly 4 JSON business insights.

Business: ${businessName || 'My Shop'}
Date: ${dayjs().format('dddd, D MMM YYYY')}

TODAY'S PERFORMANCE:
- Transactions: ${summary?.total_sales ?? 0}
- Revenue: KES ${(summary?.total_revenue ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
- Cash: KES ${(summary?.cash_total ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
- M-Pesa: KES ${(summary?.mpesa_total ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
- Credit sales: KES ${(summary?.credit_total ?? 0).toLocaleString('en-KE', { maximumFractionDigits: 0 })}

LAST 7 DAYS REVENUE:
${trendLines}

TOP PRODUCTS THIS WEEK:
${topLines}

INVENTORY ALERTS:
- Out of stock: ${outOfStock.length} product${outOfStock.length !== 1 ? 's' : ''}${outOfStock.length > 0 ? ` (${outOfStock.slice(0, 3).map((p) => p.name).join(', ')})` : ''}
- Low stock: ${lowStock.length} product${lowStock.length !== 1 ? 's' : ''}
- Expiring within 30 days: ${expiring.length} product${expiring.length !== 1 ? 's' : ''}

Return ONLY a JSON array of exactly 4 objects — no explanation, no markdown, just the array:
[
  {"type":"highlight","title":"...","insight":"..."},
  {"type":"trend","title":"...","insight":"..."},
  {"type":"alert","title":"...","insight":"..."},
  {"type":"recommendation","title":"...","insight":"..."}
]

Rules:
- type must be one of: highlight (positive win), trend (revenue/sales pattern), alert (urgent concern needing attention), recommendation (specific action to take)
- Keep each insight to 1-2 sentences. Be specific with numbers from the data.
- Use KES currency. Write for a busy shop owner who reads quickly.
- If today has 0 transactions, focus on inventory and week trends instead.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey.trim(),
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any;
    const msg = body?.error?.message ?? `API error ${res.status}`;
    if (res.status === 401) throw new Error('Invalid API key. Check your key in Settings.');
    if (res.status === 429) throw new Error('Rate limit reached. Try again in a moment.');
    throw new Error(msg);
  }

  const data = await res.json() as any;
  const raw: string = data?.content?.[0]?.text ?? '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Unexpected response from AI. Please try again.');

  const insights = JSON.parse(match[0]) as Insight[];
  if (!Array.isArray(insights) || insights.length === 0) throw new Error('Empty response from AI.');
  return insights;
}
