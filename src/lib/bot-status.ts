import type { BotActionState, BotStatus } from './backend-api';

// Shared presentation for the authoritative bot lifecycle so every surface labels a state the same way.
export interface BotActionPresentation {
  label: string;
  tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  description: string;
}

const PRESENTATION: Record<BotActionState, BotActionPresentation> = {
  OFFLINE: { label: 'OFFLINE', tone: 'neutral', description: 'The paper bot is not running.' },
  DISABLED: { label: 'DISABLED', tone: 'neutral', description: 'An autonomy switch or account setting prevents new paper entries.' },
  INITIALIZING: { label: 'INITIALIZING', tone: 'info', description: 'Required services, data, or ledger verification are still loading.' },
  MONITORING: { label: 'MONITORING', tone: 'info', description: 'The bot is watching eligible markets but entries are currently blocked.' },
  ANALYZING: { label: 'ANALYZING', tone: 'info', description: 'A decision or setup evaluation is in progress.' },
  NO_SETUP: { label: 'NO SETUP', tone: 'neutral', description: 'No valid trade setup exists on the latest closed candles.' },
  PLAN_CREATED: { label: 'PLAN CREATED', tone: 'info', description: 'A valid plan has been persisted and is waiting for price.' },
  WAITING_FOR_TRIGGER: { label: 'WAITING FOR TRIGGER', tone: 'info', description: 'Price is in the plan zone; a closed trigger candle is required.' },
  TRIGGER_CONFIRMED: { label: 'TRIGGER CONFIRMED', tone: 'warning', description: 'A closed candle confirmed the entry trigger; the order is being validated.' },
  RISK_REJECTED: { label: 'RISK REJECTED', tone: 'danger', description: 'Risk or eligibility validation rejected the proposal.' },
  READY_FOR_PAPER_EXECUTION: { label: 'READY', tone: 'success', description: 'All required checks passed; paper execution can proceed.' },
  PAPER_ORDER_PENDING: { label: 'ORDER PENDING', tone: 'warning', description: 'A paper order is persisted and awaiting fill validation.' },
  PAPER_BUY: { label: 'PAPER BUY', tone: 'success', description: 'A BUY paper position was confirmed by the backend.' },
  PAPER_SELL: { label: 'PAPER SELL', tone: 'success', description: 'A SELL paper position was confirmed by the backend.' },
  POSITION_OPEN: { label: 'POSITION OPEN', tone: 'success', description: 'An open paper position is being managed.' },
  PAUSED: { label: 'PAUSED', tone: 'warning', description: 'The bot is paused and will not open new paper entries.' },
  ERROR: { label: 'ERROR', tone: 'danger', description: 'An operational failure blocks the bot.' },
};

export function presentBotAction(action: BotActionState): BotActionPresentation {
  return PRESENTATION[action] ?? PRESENTATION.ERROR;
}

export function botToneClass(tone: BotActionPresentation['tone']): string {
  return tone === 'success' ? 'text-success'
    : tone === 'warning' ? 'text-warning'
      : tone === 'danger' ? 'text-danger'
        : tone === 'info' ? 'text-primary'
          : 'text-muted';
}

export function describeBotBias(bias: BotStatus['analysis']['marketBias']): string {
  return bias === 'BUY' ? 'Bullish' : bias === 'SELL' ? 'Bearish' : bias === 'NEUTRAL' ? 'Mixed' : 'Unknown';
}

export function describePlan(plan: BotStatus['plan']): string {
  if (!plan) return 'No active plan';
  const side = plan.side === 'long' ? 'LONG' : 'SHORT';
  return `${side} · ${plan.status.replaceAll('_', ' ')} · ${plan.id.slice(-8)}`;
}

export function describeTrigger(status: BotStatus): string {
  return status.trigger.state === 'CONFIRMED' ? 'Confirmed'
    : status.trigger.state === 'WAITING' ? 'Waiting' : 'None';
}

export function describeRisk(status: BotStatus): string {
  return status.risk.state === 'APPROVED' ? 'Approved'
    : status.risk.state === 'REJECTED' ? 'Rejected' : 'Not evaluated';
}

export function describeExecution(status: BotStatus): string {
  if (status.execution.positionStatus === 'OPEN') {
    const side = status.execution.positionSide === 'sell' ? 'SELL' : 'BUY';
    return `${side} position open${status.execution.positionQuantity ? ` · ${status.execution.positionQuantity}` : ''}`;
  }
  if (status.execution.orderStatus === 'PENDING') return `${(status.execution.orderSide ?? 'buy').toUpperCase()} order pending`;
  if (status.execution.orderStatus === 'FILLED') return 'Order filled';
  return 'No paper order';
}

export function formatBotTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never';
}
