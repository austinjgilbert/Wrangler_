/**
 * Sanity schema index (manual export list).
 * Assumption: used by Sanity Studio schema builder.
 */

import moltbotConfig from './moltbot.config';
import accountAssumed from './accountAssumed';
import personAssumed from './personAssumed';
import technology from './technology';
import moltEvent from './moltEvent';
import moltJob from './moltJob';
import moltApproval from './moltApproval';
import moltPattern from './moltPattern';
import moltMetricSnapshot from './moltMetricSnapshot';
import moltStrategyBrief from './moltStrategyBrief';
import moltNotification from './moltNotification';
import dqRule from './dqRule';
import dqFinding from './dqFinding';
import enrichJob from './enrichJob';
import enrichmentJob from './enrichmentJob';
import enrichProposal from './enrichProposal';
import accountPack from './accountPack';
import crawlSnapshot from './crawlSnapshot';
import callSession from './callSession';
import callInsight from './callInsight';
import callTask from './callTask';
import callCoaching from './callCoaching';
import callFollowupDraft from './callFollowupDraft';
import networkPerson from './networkPerson';
import signal from './signal';
import conversationStarter from './conversationStarter';
import touch from './touch';
import networkDailyBriefing from './networkDailyBriefing';
import communitySource from './communitySource';
import communityPostRaw from './communityPostRaw';
import communityPostSanitized from './communityPostSanitized';
import opportunity from './opportunity';
import opportunityBrief from './opportunityBrief';
import draftAction from './draftAction';
import actionCandidate from './actionCandidate';
import company from './company';
import userPattern from './userPattern';
import session from './session';
import interaction from './interaction';
import learning from './learning';
import accountPlanContextDraft from './accountPlanContextDraft';
import operatorDailyBriefing from './operatorDailyBriefing';
import operatorFeedback from './operatorFeedback';
import learnSession from './learnSession';
import gmailDraft from './gmailDraft';
import evidencePack from './evidencePack';
import scoringPolicyVersion from './scoringPolicyVersion';
import patternVersion from './patternVersion';
import draftPolicyVersion from './draftPolicyVersion';
import strategyInstructionVersion from './strategyInstructionVersion';
import outcomeEvent from './outcomeEvent';
import driftMetric from './driftMetric';
import scenarioRun from './scenarioRun';
import flowExperience from './flowExperience';
import repairAttempt from './repairAttempt';
import autonomyPolicy from './autonomyPolicy';
import runtimeIncident from './runtimeIncident';
import bestKnownPath from './bestKnownPath';
import scenarioConfidenceSnapshot from './scenarioConfidenceSnapshot';
import storageDashboard from './storageDashboard';
import accountTreeExplorer from './accountTreeExplorer';

export const schemaTypes = [
  moltbotConfig,
  accountAssumed,
  personAssumed,
  technology,
  moltEvent,
  moltJob,
  moltApproval,
  moltPattern,
  moltMetricSnapshot,
  moltStrategyBrief,
  moltNotification,
  dqRule,
  dqFinding,
  enrichJob,
  enrichmentJob,
  enrichProposal,
  accountPack,
  crawlSnapshot,
  callSession,
  callInsight,
  callTask,
  callCoaching,
  callFollowupDraft,
  networkPerson,
  signal,
  conversationStarter,
  touch,
  networkDailyBriefing,
  communitySource,
  communityPostRaw,
  communityPostSanitized,
  opportunity,
  opportunityBrief,
  draftAction,
  actionCandidate,
  company,
  userPattern,
  session,
  interaction,
  learning,
  accountPlanContextDraft,
  operatorDailyBriefing,
  operatorFeedback,
  learnSession,
  gmailDraft,
  evidencePack,
  scoringPolicyVersion,
  patternVersion,
  draftPolicyVersion,
  strategyInstructionVersion,
  outcomeEvent,
  driftMetric,
  scenarioRun,
  flowExperience,
  repairAttempt,
  autonomyPolicy,
  runtimeIncident,
  bestKnownPath,
  scenarioConfidenceSnapshot,
  storageDashboard,
  accountTreeExplorer,
];

export default schemaTypes;
