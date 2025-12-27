/**
 * SSH Key Service
 * Handles SSH key generation and management for git operations
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface SSHKeyPair {
  publicKey: string;
  privateKeyPath: string;
  fingerprint: string;
}

class SSHKeyService {
  private sshDir: string;
  private keyPath: string;

  constructor() {
    // Store SSH keys in ~/.auto-claude/ssh/
    this.sshDir = join(homedir(), '.auto-claude', 'ssh');
    this.keyPath = join(this.sshDir, 'id_ed25519');
  }

  /**
   * Ensure SSH directory exists with correct permissions
   */
  private ensureSSHDirectory(): void {
    if (!existsSync(this.sshDir)) {
      mkdirSync(this.sshDir, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Generate a new SSH key pair
   */
  generateKeyPair(email: string, force: boolean = false): SSHKeyPair {
    this.ensureSSHDirectory();

    // Check if key already exists
    if (existsSync(this.keyPath) && !force) {
      throw new Error('SSH key already exists. Use force=true to overwrite.');
    }

    try {
      // Generate ED25519 key (more secure and shorter than RSA)
      execSync(
        `ssh-keygen -t ed25519 -C "${email}" -f "${this.keyPath}" -N ""`,
        {
          stdio: 'pipe',
          shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
        }
      );

      // Set correct permissions (Unix only)
      if (process.platform !== 'win32') {
        chmodSync(this.keyPath, 0o600);
        chmodSync(`${this.keyPath}.pub`, 0o644);
      }

      // Read the public key
      const publicKey = readFileSync(`${this.keyPath}.pub`, 'utf-8').trim();

      // Get fingerprint
      const fingerprint = this.getFingerprint();

      return {
        publicKey,
        privateKeyPath: this.keyPath,
        fingerprint,
      };
    } catch (error) {
      throw new Error(
        `Failed to generate SSH key: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get the fingerprint of the current SSH key
   */
  getFingerprint(): string {
    if (!existsSync(this.keyPath)) {
      throw new Error('SSH key does not exist');
    }

    try {
      const output = execSync(`ssh-keygen -lf "${this.keyPath}"`, {
        encoding: 'utf-8',
        stdio: 'pipe',
      });
      return output.trim();
    } catch (error) {
      throw new Error('Failed to get SSH key fingerprint');
    }
  }

  /**
   * Get the public key
   */
  getPublicKey(): string | null {
    const pubKeyPath = `${this.keyPath}.pub`;
    if (!existsSync(pubKeyPath)) {
      return null;
    }
    return readFileSync(pubKeyPath, 'utf-8').trim();
  }

  /**
   * Get the private key path
   */
  getPrivateKeyPath(): string | null {
    if (!existsSync(this.keyPath)) {
      return null;
    }
    return this.keyPath;
  }

  /**
   * Check if SSH key exists
   */
  hasKey(): boolean {
    return existsSync(this.keyPath) && existsSync(`${this.keyPath}.pub`);
  }

  /**
   * Get SSH key info
   */
  getKeyInfo(): SSHKeyPair | null {
    if (!this.hasKey()) {
      return null;
    }

    return {
      publicKey: this.getPublicKey()!,
      privateKeyPath: this.keyPath,
      fingerprint: this.getFingerprint(),
    };
  }

  /**
   * Create SSH config for git operations
   * Returns environment variables to use with git commands
   */
  getGitSSHConfig(): Record<string, string> {
    if (!this.hasKey()) {
      return {};
    }

    // Create a wrapper script that uses our SSH key
    const sshCommand = process.platform === 'win32'
      ? `ssh -i "${this.keyPath}" -o StrictHostKeyChecking=accept-new`
      : `ssh -i ${this.keyPath} -o StrictHostKeyChecking=accept-new`;

    return {
      GIT_SSH_COMMAND: sshCommand,
    };
  }

  /**
   * Test SSH connection to GitHub
   */
  async testGitHubConnection(): Promise<{ success: boolean; message: string; username?: string }> {
    if (!this.hasKey()) {
      return {
        success: false,
        message: 'No SSH key found. Please generate an SSH key first.',
      };
    }

    try {
      // First, ensure GitHub is in known_hosts to avoid "Host key verification failed"
      try {
        execSync('ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null', {
          stdio: 'pipe',
          shell: '/bin/sh',
        });
      } catch {
        // Ignore errors if known_hosts already has the key
      }

      const sshConfig = this.getGitSSHConfig();
      const output = execSync('ssh -T git@github.com', {
        encoding: 'utf-8',
        stdio: 'pipe',
        env: { ...process.env, ...sshConfig },
        timeout: 10000,
      });

      // GitHub returns exit code 1 even on success, with message like:
      // "Hi username! You've successfully authenticated..."
      const username = this.extractGitHubUsername(output);
      return {
        success: output.includes('successfully authenticated'),
        message: output.trim(),
        username,
      };
    } catch (error: any) {
      // Check if the error message indicates success
      const message = error.stderr?.toString() || error.stdout?.toString() || error.message || '';
      if (message.includes('successfully authenticated')) {
        const username = this.extractGitHubUsername(message);
        return {
          success: true,
          message: message.trim(),
          username,
        };
      }

      return {
        success: false,
        message: `SSH connection failed: ${message}`,
      };
    }
  }

  /**
   * Extract GitHub username from SSH test output
   * Output format: "Hi username! You've successfully authenticated..."
   */
  private extractGitHubUsername(output: string): string | undefined {
    const match = output.match(/Hi\s+([^!]+)!/);
    return match ? match[1].trim() : undefined;
  }
}

// Singleton instance
export const sshKeyService = new SSHKeyService();
