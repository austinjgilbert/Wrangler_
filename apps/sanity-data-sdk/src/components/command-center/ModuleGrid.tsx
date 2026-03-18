/**
 * ModuleGrid — Responsive 3×3 grid layout for the Command Center.
 *
 * Manages module expansion: when one module expands, others collapse
 * to mini-cards in a sidebar (≥1200px) or horizontal strip (<1200px).
 *
 * Glance metrics derived from deriveAllModuleGlanceProps() — NO independent subscriptions.
 */

import { useCallback, useMemo, useState } from 'react';
import { ModuleShell } from './ModuleShell';
import { PipelineBar } from './PipelineBar';
import type { ActionButton, Account, ModuleGlanceProps } from '../../lib/adapters';
import {
  MODULE_CONFIGS,
  deriveAllModuleGlanceProps,
  type GlanceContext,
} from '../../lib/adapters';

// ─── Props ──────────────────────────────────────────────────────────────

export interface ModuleGridProps {
  glanceContext: GlanceContext;
  onModuleAction: (moduleKey: string, actionKey: string) => void;
}

// ─── Component ──────────────────────────────────────────────────────────

export function ModuleGrid({ glanceContext, onModuleAction }: ModuleGridProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Derive all glance props in a single pass — O(1) lookup via Map
  const glanceMap = useMemo(
    () => deriveAllModuleGlanceProps(glanceContext),
    [glanceContext],
  );

  const handleExpand = useCallback((key: string) => setExpandedKey(key), []);
  const handleCollapse = useCallback(() => setExpandedKey(null), []);

  // Build action button from glance props
  const makeAction = (moduleKey: string, label: string): ActionButton => ({
    key: `${moduleKey}-primary`,
    label,
    variant: 'primary',
  });

  // ── Expanded Layout ─────────────────────────────────────────────────

  if (expandedKey) {
    const expandedConfig = MODULE_CONFIGS.find(c => c.key === expandedKey);
    const expandedGlance = glanceMap.get(expandedKey);
    if (!expandedConfig || !expandedGlance) return null;

    const otherConfigs = MODULE_CONFIGS.filter(c => c.key !== expandedKey);

    return (
      <div className="module-grid module-grid--expanded">
        {/* Expanded module: 2/3 width */}
        <div className="module-grid__main">
          <ModuleShell
            moduleKey={expandedConfig.key}
            icon={expandedConfig.icon}
            label={expandedConfig.label}
            color={expandedConfig.color}
            primaryAction={makeAction(expandedConfig.key, expandedGlance.primaryActionLabel)}
            progress={expandedGlance.progress}
            gaps={expandedGlance.gaps}
            insight={expandedGlance.insight}
            activeJob={expandedGlance.activeJob}
            state="detail"
            onExpand={() => {}}
            onCollapse={handleCollapse}
            onAction={onModuleAction}
            detailContent={
              expandedConfig.key === 'research'
                ? <PipelineBar stages={glanceContext.pipelineStages} />
                : undefined
            }
            actions={[
              makeAction(expandedConfig.key, expandedGlance.primaryActionLabel),
            ]}
          />
        </div>

        {/* Mini sidebar: 1/3 width */}
        <div className="module-grid__sidebar">
          {otherConfigs.map(config => {
            const glance = glanceMap.get(config.key);
            if (!glance) return null;
            return (
              <ModuleShell
                key={config.key}
                moduleKey={config.key}
                icon={config.icon}
                label={config.label}
                color={config.color}
                primaryAction={makeAction(config.key, glance.primaryActionLabel)}
                progress={glance.progress}
                gaps={glance.gaps}
                insight={glance.insight}
                activeJob={glance.activeJob}
                state="mini"
                onExpand={() => handleExpand(config.key)}
                onCollapse={handleCollapse}
                onAction={onModuleAction}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // ── Grid Layout (3×3) ───────────────────────────────────────────────

  return (
    <div className="module-grid module-grid--grid">
      {MODULE_CONFIGS.map(config => {
        const glance = glanceMap.get(config.key);
        if (!glance) return null;
        return (
          <ModuleShell
            key={config.key}
            moduleKey={config.key}
            icon={config.icon}
            label={config.label}
            color={config.color}
            primaryAction={makeAction(config.key, glance.primaryActionLabel)}
            progress={glance.progress}
            gaps={glance.gaps}
            insight={glance.insight}
            activeJob={glance.activeJob}
            state="glance"
            onExpand={() => handleExpand(config.key)}
            onCollapse={handleCollapse}
            onAction={onModuleAction}
          />
        );
      })}
    </div>
  );
}
