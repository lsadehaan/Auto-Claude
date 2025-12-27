import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Copy, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { api } from '../../client-api';

interface GitSetupStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function GitSetupStep({ onNext, onBack }: GitSetupStepProps) {
  const { t } = useTranslation('onboarding');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [sshKey, setSSHKey] = useState<{ publicKey: string; fingerprint: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const handleGenerateSSHKey = async () => {
    if (!userEmail.trim()) {
      setError('Please enter your email first');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const result = await fetch('/api/settings/ssh/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail.trim() }),
      }).then(res => res.json());

      if (result.success) {
        setSSHKey(result.data);
      } else {
        setError(result.error || 'Failed to generate SSH key');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SSH key');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySSHKey = async () => {
    if (!sshKey) return;

    try {
      await navigator.clipboard.writeText(sshKey.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError('Failed to copy to clipboard');
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const result = await fetch('/api/settings/ssh/test-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).then(res => res.json());

      setConnectionStatus(result.success ? 'success' : 'failed');
      if (!result.success && result.data?.message) {
        setError(result.data.message);
      }
    } catch (err) {
      setConnectionStatus('failed');
      setError('Failed to test connection');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveAndContinue = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await fetch('/api/settings/git/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userName: userName.trim(),
          userEmail: userEmail.trim(),
        }),
      }).then(res => res.json());

      if (result.success) {
        onNext();
      } else {
        setError(result.error || 'Failed to save git configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="flex justify-center">
          <div className="p-4 bg-primary/10 rounded-full">
            <GitBranch className="h-8 w-8 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold">Git Configuration</h2>
        <p className="text-muted-foreground">
          Configure your git identity and SSH key for repository operations
        </p>
      </div>

      {/* Git Identity */}
      <div className="space-y-4 bg-card border rounded-lg p-6">
        <h3 className="font-semibold text-lg">Git Identity</h3>
        <p className="text-sm text-muted-foreground">
          This information will be used for git commits and repository operations.
        </p>

        <div className="space-y-4">
          <div>
            <Label htmlFor="git-name">Full Name</Label>
            <Input
              id="git-name"
              placeholder="John Doe"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="git-email">Email Address</Label>
            <Input
              id="git-email"
              type="email"
              placeholder="john@example.com"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use the same email as your GitHub account
            </p>
          </div>
        </div>
      </div>

      {/* SSH Key Generation */}
      <div className="space-y-4 bg-card border rounded-lg p-6">
        <h3 className="font-semibold text-lg">SSH Key</h3>
        <p className="text-sm text-muted-foreground">
          Generate an SSH key to authenticate with GitHub and other git services.
        </p>

        {!sshKey ? (
          <Button
            onClick={handleGenerateSSHKey}
            disabled={!userEmail.trim() || isGenerating}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate SSH Key'
            )}
          </Button>
        ) : (
          <div className="space-y-4">
            {/* Public Key Display */}
            <div>
              <Label>Public Key</Label>
              <div className="mt-1 relative">
                <textarea
                  readOnly
                  value={sshKey.publicKey}
                  className="w-full h-24 px-3 py-2 text-xs font-mono bg-muted border rounded resize-none"
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-2 right-2"
                  onClick={handleCopySSHKey}
                >
                  {copied ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Fingerprint: {sshKey.fingerprint}
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm">Next Steps:</h4>
              <ol className="text-sm space-y-1 ml-4 list-decimal">
                <li>Copy the public key above</li>
                <li>
                  Go to{' '}
                  <a
                    href="https://github.com/settings/ssh/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    GitHub SSH Settings
                  </a>
                </li>
                <li>Paste the key and save</li>
                <li>Test the connection below</li>
              </ol>
            </div>

            {/* Test Connection */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={testingConnection}
                className="flex-1"
              >
                {testingConnection ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test GitHub Connection'
                )}
              </Button>

              {connectionStatus === 'success' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-success/10 text-success rounded">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Connected</span>
                </div>
              )}

              {connectionStatus === 'failed' && (
                <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 text-destructive rounded">
                  <XCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Failed</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Navigation */}
      <div className="flex gap-4">
        <Button variant="outline" onClick={onBack} disabled={isSaving} className="flex-1">
          Back
        </Button>
        <Button
          onClick={handleSaveAndContinue}
          disabled={!userName.trim() || !userEmail.trim() || isSaving}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save and Continue'
          )}
        </Button>
      </div>

      {/* Skip Note */}
      <p className="text-xs text-center text-muted-foreground">
        You can skip SSH key generation and add it later in settings, but it's required for cloning
        private repositories and pushing changes.
      </p>
    </div>
  );
}
