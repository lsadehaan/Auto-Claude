import { useEffect, useState } from 'react';

export function VersionDisplay() {
  const [version, setVersion] = useState<string>('');

  useEffect(() => {
    // Fetch version from the server
    fetch('/api/version')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.commit) {
          setVersion(data.data.commit);
        }
      })
      .catch(() => {
        // Silently fail if version endpoint doesn't exist
      });
  }, []);

  if (!version) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '8px',
        right: '8px',
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.7)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {version}
    </div>
  );
}
