import dayjs from 'dayjs';
import { salesQueries } from '../db/sales';
import { productQueries } from '../db/products';
import { getBusinessInfo } from '../db/settings';

export type InsightType = 'highlight' | 'trend' | 'alert' | 'warning' | 'recommendation';

export interface Insight {
  type: InsightType;
  priority: number;
  title: string;
  body: string;
}

function fmt(n: number) {
  return `KES ${Math.round(n).toLocaleString('en-KE')}`;
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return '';
  const p = ((current - previous) / previous) * 100;
  return (p >= 0 ? '+' : '') + p.toFixed(0) + '%';
}

export async function computeInsights(): Promise<Insight[]> {
  const today = dayjs().format('YYYY-MM-DD');
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  const weekStart = dayjs().subtract(6, 'day').format('YYYY-MM-DD');
  const prevWeekStart = dayjs().subtract(13, 'day').format('YYYY-MM-DD');
  const prevWeekEnd = dayjs().subtract(7, 'day').format('YYYY-MM-DD');
  const hourNow = dayjs().hour();

  const [
    todaySummary,
    yesterdaySummary,
    topThisWeek,
    topLastWeek,
    trend,
    outOfStock,
    lowStock,
    expiring,
    bizInfo,
  ] = await Promise.all([
    salesQueries.getDailySummary(today),
    salesQueries.getDailySummary(yesterday),
    salesQueries.getTopProducts(weekStart, today, 5),
    salesQueries.getTopProducts(prevWeekStart, prevWeekEnd, 5),
    salesQueries.getRevenueTrend(14),
    productQueries.getOutOfStock(),
    productQueries.getLowStock(),
    productQueries.getExpiring(30),
    getBusinessInfo(),
  ]);

  const insights: Insight[] = [];

  const todayRevenue = todaySummary?.total_revenue ?? 0;
  const todaySales = todaySummary?.total_sales ?? 0;
  const yesterdayRevenue = yesterdaySummary?.total_revenue ?? 0;
  const target = bizInfo?.dailySalesTarget ?? 0;

  // Trend data split into this week (last 7 days) and prev week
  const thisWeekTrend = trend.filter((d) => d.date >= weekStart);
  const prevWeekTrend = trend.filter((d) => d.date >= prevWeekStart && d.date < weekStart);

  // ── DETECTOR 1: No sales today (past 10am) ──────────────────────────────
  if (todaySales === 0 && hourNow >= 10) {
    insights.push({
      type: 'alert',
      priority: 9,
      title: 'No Sales Recorded Today',
      body: hourNow >= 14
        ? 'No transactions yet today. Consider a quick promotion or check that the POS is set up correctly.'
        : 'No sales yet this morning. Make sure the register is open and products are priced.',
    });
  }

  // ── DETECTOR 2: Top sellers out of stock ────────────────────────────────
  const outOfStockNames = new Set(outOfStock.map((p) => p.name.toLowerCase()));
  const topSellers = topThisWeek ?? [];
  const atRisk = topSellers.filter((p) => outOfStockNames.has(p.product_name.toLowerCase()));

  if (atRisk.length > 0) {
    const names = atRisk.slice(0, 2).map((p) => p.product_name).join(' and ');
    insights.push({
      type: 'alert',
      priority: 10,
      title: `Top Seller${atRisk.length > 1 ? 's' : ''} Out of Stock`,
      body: `${names} ${atRisk.length === 1 ? 'is' : 'are'} in your top sellers this week but out of stock. Restock immediately to avoid lost revenue.`,
    });
  } else if (outOfStock.length > 0) {
    const names = outOfStock.slice(0, 3).map((p) => p.name).join(', ');
    const more = outOfStock.length > 3 ? ` and ${outOfStock.length - 3} more` : '';
    insights.push({
      type: 'alert',
      priority: 8,
      title: `${outOfStock.length} Product${outOfStock.length !== 1 ? 's' : ''} Out of Stock`,
      body: `${names}${more} ${outOfStock.length === 1 ? 'has' : 'have'} zero stock. Update inventory or remove from active listings to avoid failed sales.`,
    });
  }

  // ── DETECTOR 3: Expiring this week ──────────────────────────────────────
  const expiringSoon = expiring.filter((p) => {
    if (!p.expiry_date) return false;
    return dayjs(p.expiry_date).diff(dayjs(), 'day') <= 7;
  });
  if (expiringSoon.length > 0) {
    const names = expiringSoon.slice(0, 2).map((p) => p.name).join(', ');
    insights.push({
      type: 'alert',
      priority: 8,
      title: `${expiringSoon.length} Item${expiringSoon.length !== 1 ? 's' : ''} Expiring This Week`,
      body: `${names}${expiringSoon.length > 2 ? '…' : ''} expire within 7 days. Prioritise selling or discount these items now.`,
    });
  } else if (expiring.length > 0) {
    const names = expiring.slice(0, 2).map((p) => p.name).join(', ');
    insights.push({
      type: 'recommendation',
      priority: 3,
      title: `${expiring.length} Item${expiring.length !== 1 ? 's' : ''} Expiring Within 30 Days`,
      body: `${names}${expiring.length > 2 ? '…' : ''} expire within a month. Plan promotions to clear this stock before it's written off.`,
    });
  }

  // ── DETECTOR 4: Revenue vs yesterday ────────────────────────────────────
  if (todaySales > 0 && yesterdayRevenue > 0) {
    const diff = todayRevenue - yesterdayRevenue;
    const pct = pctChange(todayRevenue, yesterdayRevenue);
    if (diff > 0) {
      insights.push({
        type: 'highlight',
        priority: 5,
        title: `Revenue Up ${pct} vs Yesterday`,
        body: `Today's ${fmt(todayRevenue)} is ${fmt(diff)} ahead of yesterday's ${fmt(yesterdayRevenue)}. Keep the momentum going.`,
      });
    } else if (diff < 0 && Math.abs(diff) / yesterdayRevenue > 0.15) {
      insights.push({
        type: 'warning',
        priority: 7,
        title: `Revenue Down ${pct} vs Yesterday`,
        body: `Today's ${fmt(todayRevenue)} is ${fmt(Math.abs(diff))} below yesterday's ${fmt(yesterdayRevenue)}. The day isn't over — focus on upselling to close the gap.`,
      });
    }
  }

  // ── DETECTOR 5: Week-over-week revenue ──────────────────────────────────
  if (thisWeekTrend.length >= 3 && prevWeekTrend.length >= 3) {
    const thisTotal = thisWeekTrend.reduce((s, d) => s + d.revenue, 0);
    const prevTotal = prevWeekTrend.reduce((s, d) => s + d.revenue, 0);
    const growthRate = prevTotal > 0 ? (thisTotal - prevTotal) / prevTotal : 0;
    if (growthRate > 0.1) {
      insights.push({
        type: 'trend',
        priority: 4,
        title: `Revenue Up ${(growthRate * 100).toFixed(0)}% This Week`,
        body: `This week's revenue of ${fmt(thisTotal)} is ahead of last week's ${fmt(prevTotal)}. Strong consistent growth.`,
      });
    } else if (growthRate < -0.1) {
      insights.push({
        type: 'trend',
        priority: 6,
        title: `Revenue Down ${(Math.abs(growthRate) * 100).toFixed(0)}% vs Last Week`,
        body: `This week's ${fmt(thisTotal)} is below last week's ${fmt(prevTotal)}. Consider restocking popular items or running a promotion.`,
      });
    }
  } else if (thisWeekTrend.length >= 4) {
    // Fall back: compare first half vs second half of this week's trend
    const half = Math.floor(thisWeekTrend.length / 2);
    const firstAvg = thisWeekTrend.slice(0, half).reduce((s, d) => s + d.revenue, 0) / half;
    const secondAvg = thisWeekTrend.slice(-half).reduce((s, d) => s + d.revenue, 0) / half;
    const gr = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
    if (gr > 0.15) {
      insights.push({
        type: 'trend',
        priority: 4,
        title: 'Revenue Trending Up',
        body: `Your daily average has grown ${(gr * 100).toFixed(0)}% over the past week. Daily average: ${fmt(secondAvg)}.`,
      });
    } else if (gr < -0.15) {
      insights.push({
        type: 'trend',
        priority: 5,
        title: 'Revenue Trending Down',
        body: `Average daily revenue has slipped ${(Math.abs(gr) * 100).toFixed(0)}% over the past week. Consider a promotion or restock push.`,
      });
    }
  }

  // ── DETECTOR 6: Daily target ─────────────────────────────────────────────
  if (target > 0) {
    const progress = (todayRevenue / target) * 100;
    if (progress >= 100) {
      insights.push({
        type: 'highlight',
        priority: 7,
        title: 'Daily Target Achieved!',
        body: `${fmt(todayRevenue)} against a target of ${fmt(target)} — ${fmt(todayRevenue - target)} over target. Great work today!`,
      });
    } else if (hourNow >= 14 && progress < 60 && todaySales > 0) {
      insights.push({
        type: 'warning',
        priority: 5,
        title: `${progress.toFixed(0)}% of Daily Target`,
        body: `${fmt(todayRevenue)} of your ${fmt(target)} target reached. ${fmt(target - todayRevenue)} still needed with ${24 - hourNow} hours left — push high-value items.`,
      });
    }
  }

  // ── DETECTOR 7: Top product this week ───────────────────────────────────
  if (topSellers.length > 0 && topSellers[0].total_revenue > 0) {
    const top = topSellers[0];
    const prev = (topLastWeek ?? []).find((p) => p.product_name === top.product_name);
    const growthStr = prev && prev.total_revenue > 0
      ? ` (${pctChange(top.total_revenue, prev.total_revenue)} vs last week)`
      : '';
    insights.push({
      type: 'highlight',
      priority: 3,
      title: `Top Seller: ${top.product_name}`,
      body: `${top.total_qty} unit${top.total_qty !== 1 ? 's' : ''} sold this week for ${fmt(top.total_revenue)}${growthStr}. Keep it well-stocked.`,
    });
  }

  // ── DETECTOR 8: Critically low stock ────────────────────────────────────
  if (lowStock.length > 0) {
    const critical = lowStock.filter((p) => p.stock_qty <= 3);
    if (critical.length > 0) {
      const names = critical.slice(0, 3).map((p) => `${p.name} (${p.stock_qty} left)`).join(', ');
      insights.push({
        type: 'warning',
        priority: 6,
        title: `${critical.length} Item${critical.length !== 1 ? 's' : ''} Critically Low`,
        body: `${names}${critical.length > 3 ? '…' : ''}. Reorder before you run out.`,
      });
    } else {
      const names = lowStock.slice(0, 3).map((p) => `${p.name} (${p.stock_qty})`).join(', ');
      insights.push({
        type: 'recommendation',
        priority: 4,
        title: `${lowStock.length} Product${lowStock.length !== 1 ? 's' : ''} Running Low`,
        body: `${names}${lowStock.length > 3 ? ` and ${lowStock.length - 3} more` : ''}. Plan your next reorder soon.`,
      });
    }
  }

  // ── DETECTOR 9: Credit exposure ──────────────────────────────────────────
  if (todaySales > 0 && todayRevenue > 0) {
    const creditShare = (todaySummary?.credit_total ?? 0) / todayRevenue;
    if (creditShare > 0.3) {
      insights.push({
        type: 'warning',
        priority: 6,
        title: `${(creditShare * 100).toFixed(0)}% of Revenue on Credit`,
        body: `${fmt(todaySummary?.credit_total ?? 0)} recorded as credit today. High credit exposure affects cash flow — follow up on outstanding balances.`,
      });
    }
  }

  // ── DETECTOR 10: M-Pesa adoption ─────────────────────────────────────────
  if (todaySales > 0 && todayRevenue > 0) {
    const mpesaShare = (todaySummary?.mpesa_total ?? 0) / todayRevenue;
    if (mpesaShare > 0 && (todaySummary?.credit_total ?? 0) / todayRevenue <= 0.3) {
      insights.push({
        type: 'trend',
        priority: 2,
        title: `${(mpesaShare * 100).toFixed(0)}% of Sales via M-Pesa`,
        body: `M-Pesa brought in ${fmt(todaySummary?.mpesa_total ?? 0)} today. Digital payments reduce cash handling risk and are easier to reconcile.`,
      });
    }
  }

  // ── DETECTOR 11: Average transaction value ───────────────────────────────
  if (todaySales > 1 && todayRevenue > 0) {
    const avg = todayRevenue / todaySales;
    insights.push({
      type: 'trend',
      priority: 1,
      title: `Avg Transaction: ${fmt(avg)}`,
      body: `${todaySales} transactions today averaging ${fmt(avg)} each. ${avg < 200 ? 'Encourage add-ons to increase basket size.' : 'Your basket size is healthy.'}`,
    });
  }

  // ── DETECTOR 12: Best day of the week ───────────────────────────────────
  if (thisWeekTrend.length >= 4) {
    const best = [...thisWeekTrend].sort((a, b) => b.revenue - a.revenue)[0];
    if (best && best.revenue > 0 && best.date !== today) {
      insights.push({
        type: 'trend',
        priority: 2,
        title: `${dayjs(best.date).format('dddd')} Is Your Best Day`,
        body: `${dayjs(best.date).format('D MMM')} was your highest-revenue day this week at ${fmt(best.revenue)}. Plan stock and promotions around your peak days.`,
      });
    }
  }

  return insights.sort((a, b) => b.priority - a.priority).slice(0, 7);
}
