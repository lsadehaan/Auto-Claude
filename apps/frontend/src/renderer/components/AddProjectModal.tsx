import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, FolderPlus, GitBranch, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog';
import { cn } from '../lib/utils';
import { addProject, createProject, cloneProject } from '../stores/project-store';
import { api, isWebMode } from '../client-api';
import type { Project } from '../../shared/types';

type ModalStep = 'choose' | 'create-form' | 'clone-form' | 'open-form';

interface AddProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProjectAdded?: (project: Project, needsInit: boolean) => void;
}

export function AddProjectModal({ open, onOpenChange, onProjectAdded }: AddProjectModalProps) {
  const { t } = useTranslation('dialogs');
  const [step, setStep] = useState<ModalStep>('choose');
  const [projectName, setProjectName] = useState('');
  const [projectLocation, setProjectLocation] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [cloneName, setCloneName] = useState('');
  const [openExistingPath, setOpenExistingPath] = useState('');
  const [initGit, setInitGit] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setProjectName('');
      setProjectLocation('');
      setGitUrl('');
      setCloneName('');
      setOpenExistingPath('');
      setInitGit(true);
      setError(null);
      setIsOpening(false);
    }
  }, [open]);

  // Load default location on mount (for Electron mode)
  useEffect(() => {
    const loadDefaultLocation = async () => {
      if (isWebMode) return; // Web mode uses PROJECTS_DIR
      try {
        const defaultDir = await api.getDefaultProjectLocation();
        if (defaultDir) {
          setProjectLocation(defaultDir);
        }
      } catch {
        // Ignore - will just be empty
      }
    };
    loadDefaultLocation();
  }, []);

  const handleOpenExisting = async () => {
    // In web mode, go to the open form for manual path entry
    if (isWebMode) {
      setStep('open-form');
      return;
    }

    try {
      const path = await api.selectDirectory();
      if (path) {
        await openProjectAtPath(path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToOpen'));
    }
  };

  const openProjectAtPath = async (path: string) => {
    setIsOpening(true);
    setError(null);
    try {
      const project = await addProject(path);
      if (project) {
        // Auto-detect and save the main branch for the project
        try {
          const mainBranchResult = await api.detectMainBranch(path);
          if (mainBranchResult.success && mainBranchResult.data) {
            await api.updateProjectSettings(project.id, {
              mainBranch: mainBranchResult.data
            });
          }
        } catch {
          // Non-fatal - main branch can be set later in settings
        }
        onProjectAdded?.(project, !project.autoBuildPath);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToOpen'));
    } finally {
      setIsOpening(false);
    }
  };

  const handleSelectLocation = async () => {
    try {
      const path = await api.selectDirectory();
      if (path) {
        setProjectLocation(path);
      }
    } catch {
      // User cancelled - ignore
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setError(t('addProject.nameRequired'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // In web mode, use the new createProject API
      if (isWebMode) {
        const project = await createProject(projectName.trim(), initGit);
        if (project) {
          onProjectAdded?.(project, true); // New projects always need init
          onOpenChange(false);
        }
        return;
      }

      // Electron mode: create folder locally
      if (!projectLocation.trim()) {
        setError(t('addProject.locationRequired'));
        return;
      }

      console.log('[AddProjectModal] About to call api.createProjectFolder, api =', {
        type: typeof api,
        isUndefined: api === undefined,
        isNull: api === null,
        hasCreateProjectFolder: typeof (api as any)?.createProjectFolder,
        api: api,
        windowAPI: (window as any).__claudeAPI
      });

      const result = await api.createProjectFolder(
        projectLocation,
        projectName.trim(),
        initGit
      );

      if (!result.success || !result.data) {
        setError(result.error || 'Failed to create project folder');
        return;
      }

      // Add the project to our store
      const project = await addProject(result.data.path);
      if (project) {
        // For new projects with git init, set main branch
        if (initGit) {
          try {
            const mainBranchResult = await api.detectMainBranch(result.data.path);
            if (mainBranchResult.success && mainBranchResult.data) {
              await api.updateProjectSettings(project.id, {
                mainBranch: mainBranchResult.data
              });
            }
          } catch {
            // Non-fatal - main branch can be set later in settings
          }
        }
        onProjectAdded?.(project, true); // New projects always need init
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addProject.failedToCreate'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleCloneProject = async () => {
    if (!gitUrl.trim()) {
      setError('Git URL is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const project = await cloneProject(gitUrl.trim(), cloneName.trim() || undefined);
      if (project) {
        // Auto-detect main branch
        try {
          const mainBranchResult = await api.detectMainBranch(project.id);
          if (mainBranchResult.success && mainBranchResult.data) {
            await api.updateProjectSettings(project.id, {
              mainBranch: mainBranchResult.data
            });
          }
        } catch {
          // Non-fatal
        }
        onProjectAdded?.(project, !project.autoBuildPath);
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone repository');
    } finally {
      setIsCreating(false);
    }
  };

  const renderChooseStep = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('addProject.title')}</DialogTitle>
        <DialogDescription>
          {isWebMode
            ? 'Create a new project or clone from a Git repository'
            : t('addProject.description')
          }
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-3">
        {/* Create New Option */}
        <button
          onClick={() => setStep('create-form')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-success/10">
            <FolderPlus className="h-6 w-6 text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">{t('addProject.createNew')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isWebMode
                ? 'Start a new empty project'
                : t('addProject.createNewDescription')
              }
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Clone from Git Option (Web mode primary option) */}
        <button
          onClick={() => setStep('clone-form')}
          className={cn(
            'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
            'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
            'text-left group'
          )}
        >
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-foreground">Clone from Git</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Clone an existing repository from GitHub or other Git hosting
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>

        {/* Open Existing Option (Electron mode only) */}
        {!isWebMode && (
          <button
            onClick={handleOpenExisting}
            className={cn(
              'w-full flex items-center gap-4 p-4 rounded-xl border border-border',
              'bg-card hover:bg-accent hover:border-accent transition-all duration-200',
              'text-left group'
            )}
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <FolderOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-foreground">{t('addProject.openExisting')}</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t('addProject.openExistingDescription')}
              </p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </button>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3 mt-2">
          {error}
        </div>
      )}
    </>
  );

  const renderCreateForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('addProject.createNewTitle')}</DialogTitle>
        <DialogDescription>
          {isWebMode
            ? 'Enter a name for your new project'
            : t('addProject.createNewSubtitle')
          }
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">{t('addProject.projectName')}</Label>
          <Input
            id="project-name"
            placeholder={t('addProject.projectNamePlaceholder')}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            {isWebMode
              ? 'Use lowercase letters, numbers, and hyphens'
              : t('addProject.projectNameHelp')
            }
          </p>
        </div>

        {/* Location (Electron mode only) */}
        {!isWebMode && (
          <div className="space-y-2">
            <Label htmlFor="project-location">{t('addProject.location')}</Label>
            <div className="flex gap-2">
              <Input
                id="project-location"
                placeholder={t('addProject.locationPlaceholder')}
                value={projectLocation}
                onChange={(e) => setProjectLocation(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectLocation}>
                {t('addProject.browse')}
              </Button>
            </div>
            {projectLocation && projectName && (
              <p className="text-xs text-muted-foreground">
                {t('addProject.willCreate')} <code className="bg-muted px-1 py-0.5 rounded">{projectLocation}/{projectName}</code>
              </p>
            )}
          </div>
        )}

        {/* Git Init Checkbox */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="init-git"
            checked={initGit}
            onChange={(e) => setInitGit(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-background"
          />
          <Label htmlFor="init-git" className="text-sm font-normal cursor-pointer">
            {t('addProject.initGit')}
          </Label>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCreating}>
          {t('addProject.back')}
        </Button>
        <Button onClick={handleCreateProject} disabled={isCreating}>
          {isCreating ? t('addProject.creating') : t('addProject.createProject')}
        </Button>
      </DialogFooter>
    </>
  );

  const renderCloneForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>Clone Repository</DialogTitle>
        <DialogDescription>
          Enter the Git URL to clone a repository
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        {/* Git URL */}
        <div className="space-y-2">
          <Label htmlFor="git-url">Repository URL</Label>
          <Input
            id="git-url"
            placeholder="https://github.com/user/repo.git"
            value={gitUrl}
            onChange={(e) => setGitUrl(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            HTTPS or SSH URL of the repository
          </p>
        </div>

        {/* Custom Name (optional) */}
        <div className="space-y-2">
          <Label htmlFor="clone-name">Project Name (optional)</Label>
          <Input
            id="clone-name"
            placeholder="Leave empty to use repository name"
            value={cloneName}
            onChange={(e) => setCloneName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Custom folder name for the cloned project
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isCreating}>
          Back
        </Button>
        <Button onClick={handleCloneProject} disabled={isCreating || !gitUrl.trim()}>
          {isCreating ? 'Cloning...' : 'Clone Repository'}
        </Button>
      </DialogFooter>
    </>
  );

  const renderOpenForm = () => (
    <>
      <DialogHeader>
        <DialogTitle>Open Existing Project</DialogTitle>
        <DialogDescription>
          Enter the full path to your project directory
        </DialogDescription>
      </DialogHeader>

      <div className="py-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-path">Project Path</Label>
          <Input
            id="project-path"
            placeholder="/home/user/my-project or C:\Users\name\project"
            value={openExistingPath}
            onChange={(e) => setOpenExistingPath(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Enter the absolute path to an existing project directory on the server
          </p>
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => setStep('choose')} disabled={isOpening}>
          Back
        </Button>
        <Button
          onClick={() => openProjectAtPath(openExistingPath)}
          disabled={isOpening || !openExistingPath.trim()}
        >
          {isOpening ? 'Opening...' : 'Open Project'}
        </Button>
      </DialogFooter>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === 'choose' && renderChooseStep()}
        {step === 'create-form' && renderCreateForm()}
        {step === 'clone-form' && renderCloneForm()}
        {step === 'open-form' && renderOpenForm()}
      </DialogContent>
    </Dialog>
  );
}
