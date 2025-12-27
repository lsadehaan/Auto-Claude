import { useState, useEffect } from 'react';
import { GitBranch, Info } from 'lucide-react';
import { CollapsibleSection } from './CollapsibleSection';
import { StatusBadge } from './StatusBadge';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import { api } from '../../client-api';
import type { ProjectSettings } from '../../../shared/types';

interface GitIdentityConfig {
  userName?: string;
  userEmail?: string;
}

interface GitIdentitySectionProps {
  isExpanded: boolean;
  onToggle: () => void;
  settings: ProjectSettings;
  onUpdateSettings: (updates: Partial<ProjectSettings>) => void;
  projectId: string;
  projectName: string;
}

export function GitIdentitySection({
  isExpanded,
  onToggle,
  settings,
  onUpdateSettings,
  projectId,
  projectName,
}: GitIdentitySectionProps) {
  const [globalConfig, setGlobalConfig] = useState<GitIdentityConfig | null>(null);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);

  // Load global git config
  useEffect(() => {
    if (isExpanded) {
      loadGlobalConfig();
    }
  }, [isExpanded]);

  const loadGlobalConfig = async () => {
    setIsLoadingGlobal(true);
    try {
      const result = await fetch('/api/settings/git/config').then(res => res.json());
      if (result.success && result.data) {
        setGlobalConfig(result.data);
      }
    } catch (error) {
      console.error('Failed to load global git config:', error);
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  const isOverrideEnabled = settings.gitIdentityOverride?.enabled || false;
  const overrideUserName = settings.gitIdentityOverride?.userName || '';
  const overrideUserEmail = settings.gitIdentityOverride?.userEmail || '';

  const effectiveUserName = isOverrideEnabled ? overrideUserName : globalConfig?.userName;
  const effectiveUserEmail = isOverrideEnabled ? overrideUserEmail : globalConfig?.userEmail;

  const handleToggleOverride = (checked: boolean) => {
    onUpdateSettings({
      gitIdentityOverride: {
        enabled: checked,
        userName: checked ? (globalConfig?.userName || '') : undefined,
        userEmail: checked ? (globalConfig?.userEmail || '') : undefined,
      },
    });
  };

  const handleUpdateOverride = (field: 'userName' | 'userEmail', value: string) => {
    onUpdateSettings({
      gitIdentityOverride: {
        ...settings.gitIdentityOverride,
        enabled: true,
        [field]: value,
      },
    });
  };

  const badge = isOverrideEnabled ? (
    <StatusBadge status="warning" label="Override Active" />
  ) : null;

  return (
    <CollapsibleSection
      title="Git Identity"
      icon={<GitBranch className="h-4 w-4" />}
      isExpanded={isExpanded}
      onToggle={onToggle}
      badge={badge}
    >
      {/* Info about git identity */}
      <div className="rounded-lg border border-info/30 bg-info/5 p-3 mb-4">
        <div className="flex items-start gap-2">
          <Info className="h-4 w-4 text-info mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Git Identity Configuration</p>
            <p className="text-xs text-muted-foreground mt-1">
              Git identity (name and email) is used for commits in this project. By default, the global
              configuration from onboarding is used. Enable override to use different credentials for{' '}
              <span className="font-semibold text-foreground">{projectName}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Global Configuration Display */}
      {!isLoadingGlobal && globalConfig && (
        <div className="space-y-3 mb-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Global Git Identity</Label>
            <div className="bg-muted/50 rounded-md p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-16">Name:</span>
                <span className="text-sm text-foreground">{globalConfig.userName || 'Not set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-16">Email:</span>
                <span className="text-sm text-foreground">{globalConfig.userEmail || 'Not set'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Override Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="space-y-0.5">
          <Label className="font-normal text-foreground">Override Global Identity</Label>
          <p className="text-xs text-muted-foreground">
            Use different git credentials for this project
          </p>
        </div>
        <Switch
          checked={isOverrideEnabled}
          onCheckedChange={handleToggleOverride}
        />
      </div>

      {/* Override Fields */}
      {isOverrideEnabled && (
        <div className="space-y-4 pl-4 border-l-2 border-primary/20">
          <div className="space-y-2">
            <Label htmlFor="git-override-name" className="text-sm font-medium text-foreground">
              Name
            </Label>
            <Input
              id="git-override-name"
              placeholder="Your Name"
              value={overrideUserName}
              onChange={(e) => handleUpdateOverride('userName', e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="git-override-email" className="text-sm font-medium text-foreground">
              Email
            </Label>
            <Input
              id="git-override-email"
              type="email"
              placeholder="your.email@example.com"
              value={overrideUserEmail}
              onChange={(e) => handleUpdateOverride('userEmail', e.target.value)}
            />
          </div>

          {/* Effective Identity Display */}
          <div className="rounded-lg border border-success/30 bg-success/5 p-3">
            <p className="text-xs font-medium text-foreground mb-2">Effective Identity for Commits:</p>
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12">Name:</span>
                <span className="text-foreground font-mono">{effectiveUserName || 'Not set'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12">Email:</span>
                <span className="text-foreground font-mono">{effectiveUserEmail || 'Not set'}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
