import Link from 'next/link';
import type { CardProps } from './types';
import { AccountCard } from './AccountCard';
import { PersonCard } from './PersonCard';
import { SignalCard } from './SignalCard';
import { ActionCard } from './ActionCard';
import { BriefingCard } from './BriefingCard';
import { ConfirmationCard } from './ConfirmationCard';
import { ResultCard } from './ResultCard';

/**
 * CardRenderer — the only component the chat layer imports.
 * Dispatches to the correct card type based on `cardType`.
 * Individual cards are NOT exported from the barrel — use this dispatcher.
 */
export default function CardRenderer(props: CardProps) {
  const { cardType, _meta } = props;

  let cardComponent: React.ReactNode | null = null;

  switch (cardType) {
    case 'account':
      cardComponent = <AccountCard data={props.data} />;
      break;
    case 'person':
      cardComponent = <PersonCard data={props.data} />;
      break;
    case 'signal':
      cardComponent = <SignalCard data={props.data} />;
      break;
    case 'action':
      cardComponent = <ActionCard data={props.data} />;
      break;
    case 'briefing':
      cardComponent = <BriefingCard data={props.data} />;
      break;
    case 'confirmation':
      cardComponent = <ConfirmationCard />;
      break;
    case 'result':
      cardComponent = <ResultCard />;
      break;
    default:
      cardComponent = null;
  }

  if (!cardComponent) return null;

  if (_meta?.navigable && _meta?.href) {
    return <Link href={_meta.href}>{cardComponent}</Link>;
  }

  return cardComponent;
}
