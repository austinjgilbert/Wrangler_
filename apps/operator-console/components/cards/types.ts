export type CardType = 'account' | 'person' | 'signal' | 'action' | 'briefing' | 'confirmation' | 'result';
export type CardDisplay = 'inline' | 'expanded' | 'summary';
export type CardMeta = { display: CardDisplay; navigable?: boolean; href?: string };

export type AccountCardData = {
  name: string;
  domain: string;
  opportunityScore: number;
  industry?: string;
  techStack?: string[];
  completeness?: number;
  signalCount?: number;
  lastActivity?: string;
};

export type PersonCardData = {
  name: string;
  title: string;
  company?: string;
  seniority?: 'C-Suite' | 'VP' | 'Director' | 'Manager' | 'IC';
  linkedin?: string;
  email?: string;
  recentSignals?: number;
};

export type SignalCardData = {
  signalType: string;
  strength: 'high' | 'medium' | 'low';
  timestamp: string;
  summary?: string;
  source?: string;
  accountName?: string;
  accountId?: string;
};

export type ActionCardData = {
  actionType: string;
  whyNow: string;
  urgency: 'high' | 'medium' | 'low';
  evidence?: string[];
  accountName?: string;
  accountId?: string;
  personName?: string;
};

export type BriefingCardData = {
  date: string;
  topActions: Array<{ action: string; account: string; urgency: string }>;
  overnightSignals: Array<{ type: string; account: string; summary: string }>;
  stats?: { accounts: number; signals: number; actions: number };
};

export type CardProps = {
  cardType: CardType;
  data: Record<string, any>;
  _meta?: CardMeta;
};
