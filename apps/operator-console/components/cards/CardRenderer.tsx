import Link from 'next/link';
import { CardProps } from './types';
import { AccountCard } from './AccountCard';
import { PersonCard } from './PersonCard';
import { SignalCard } from './SignalCard';
import { ActionCard } from './ActionCard';
import { BriefingCard } from './BriefingCard';
import { ConfirmationCard } from './ConfirmationCard';
import { ResultCard } from './ResultCard';

export default function CardRenderer(props: CardProps) {
  const { cardType, data, _meta } = props;

  let cardComponent: React.ReactNode | null = null;

  switch (cardType) {
    case 'account':
      cardComponent = <AccountCard data={data} />;
      break;
    case 'person':
      cardComponent = <PersonCard data={data} />;
      break;
    case 'signal':
      cardComponent = <SignalCard data={data} />;
      break;
    case 'action':
      cardComponent = <ActionCard data={data} />;
      break;
    case 'briefing':
      cardComponent = <BriefingCard data={data} />;
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
